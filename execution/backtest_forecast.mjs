#!/usr/bin/env node
/**
 * 매출 추정 백테스트 — 추정치를 믿어도 되는지 숫자로 확인한다
 *
 *   node execution/backtest_forecast.mjs
 *
 * **엔진이 순수 함수이고 `now`를 주입받기 때문에 가능하다.**
 * 과거 어느 시점으로 시계를 되돌려, 그때까지의 자료만 주고 예측하게 한 뒤
 * 실제로 그 해에 얼마가 나왔는지와 맞춰 본다.
 *
 * 예측은 만드는 것보다 **얼마나 틀리는지 아는 것**이 중요하다.
 * "152억"만 있으면 그 숫자를 얼마나 믿어야 할지 알 수 없다.
 *
 * 읽는 법 — `치우침`이 핵심이다.
 *   평균절대오차가 크더라도 위아래로 고르게 틀리면 평균적으로는 맞는다.
 *   한쪽으로 쏠려 있으면(치우침) **체계적으로 잘못 보고 있다**는 뜻이다.
 *
 * 매년 한 번씩 돌려 볼 것. 자료가 쌓이면 결론이 달라질 수 있다.
 */
import { connect } from './_supabase.mjs'
import { calculateRevenueForecast } from '../src/utils/revenueForecastEngine.js'

const 억 = (v) => (v / 1e8).toFixed(2)
const pct = (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%'

const main = async () => {
    const { supabase } = await connect()

    const all = []
    for (let p = 0; ; p++) {
        const { data, error } = await supabase
            .from('sales').select('sale_date,total_amount,client_id').is('deleted_at', null)
            .order('sale_date', { ascending: true }).order('id', { ascending: true })
            .range(p * 1000, (p + 1) * 1000 - 1)
        if (error) throw error
        if (!data?.length) break
        all.push(...data)
        if (data.length < 1000) break
    }

    const yearSum = (y) => all.filter((s) => String(s.sale_date).slice(0, 4) === String(y))
        .reduce((a, s) => a + (Number(s.total_amount) || 0), 0)
    const ytdTo = (y, cut) => all.filter((s) => String(s.sale_date).slice(0, 4) === String(y) && new Date(s.sale_date) <= cut)
        .reduce((a, s) => a + (Number(s.total_amount) || 0), 0)

    const years = [...new Set(all.map((s) => String(s.sale_date).slice(0, 4)))].sort()
    console.log('\n실제 연도별 매출')
    years.forEach((y) => console.log(`  ${y}   ${억(yearSum(y))}억`))

    /* ── 계절성이 있는가 ─────────────────────────────────────────────────
     * 계절성이 강하면 '월별로 세밀하게' 보는 것이 이득이다. 약하면 그 노력이
     * 오차를 줄이지 못한다. 월 매출의 변동계수(표준편차÷평균)로 잰다. */
    console.log('\n계절성 — 월 매출이 얼마나 출렁이는가')
    for (const y of years) {
        const ms = Array.from({ length: 12 }, (_, i) =>
            all.filter((s) => String(s.sale_date).slice(0, 7) === `${y}-${String(i + 1).padStart(2, '0')}`)
                .reduce((a, s) => a + (Number(s.total_amount) || 0), 0))
        const live = ms.filter((v) => v > 0)
        if (live.length < 6) continue
        const avg = live.reduce((a, b) => a + b, 0) / live.length
        const sd = Math.sqrt(live.reduce((a, b) => a + (b - avg) ** 2, 0) / live.length)
        console.log(`  ${y}   변동계수 ${(sd / avg * 100).toFixed(0)}%   `
            + `최저 ${억(Math.min(...live))}억 / 최고 ${억(Math.max(...live))}억`)
    }

    /* ── 백테스트 ───────────────────────────────────────────────────────── */
    const rows = []
    for (const Y of years.map(Number)) {
        if (yearSum(Y) === 0) continue
        if (yearSum(Y - 1) === 0) continue          // 비교할 과거가 없으면 건너뛴다
        if (Y === new Date().getFullYear()) continue // 아직 끝나지 않은 해
        for (const m of [3, 6, 8, 10]) {
            const cut = new Date(Y, m - 1, 16, 23, 59, 59)
            const upto = all.filter((s) => new Date(s.sale_date) <= cut)
            if (!upto.length) continue
            const 경과 = Math.round((cut - new Date(Y, 0, 1)) / 86400000)
            rows.push({
                Y, m, act: yearSum(Y),
                engine: calculateRevenueForecast(upto, Y, cut).total_amount,
                naive: ytdTo(Y, cut) * 365 / 경과,   // YTD를 경과일로 나눠 1년으로 늘린 값
            })
        }
    }

    if (!rows.length) { console.log('\n백테스트할 과거 연도가 없습니다.'); return }

    const err = (f, r) => (f(r) - r.act) / r.act * 100
    const mae = (f) => rows.reduce((a, r) => a + Math.abs(err(f, r)), 0) / rows.length
    const bias = (f) => rows.reduce((a, r) => a + err(f, r), 0) / rows.length

    console.log('\n백테스트 — 그해 몇 월에 예측했다면 얼마나 틀렸을까')
    console.log('  연도  기준월     엔진     단순환산      실제')
    for (const r of rows) {
        console.log(`  ${r.Y}  ${String(r.m + '월').padStart(4)}   ${pct(err((x) => x.engine, r)).padStart(7)}`
            + `  ${pct(err((x) => x.naive, r)).padStart(9)}    ${억(r.act)}억`)
    }

    const 방법 = {
        '엔진 그대로': (r) => r.engine,
        '단순 환산 (YTD ÷ 경과일 × 365)': (r) => r.naive,
        '엔진 3 : 단순 7': (r) => r.engine * 0.3 + r.naive * 0.7,
    }
    console.log('\n  방법                              평균절대오차   치우침')
    for (const [k, f] of Object.entries(방법)) {
        console.log(`  ${k.padEnd(32)}${(mae(f).toFixed(2) + '%').padStart(8)}   ${pct(bias(f)).padStart(7)}`)
    }

    console.log('\n※ 표본이 적다(연도당 4개 시점). 가중치를 이 결과에 맞춰 고르면')
    console.log('   지난 자료에만 잘 맞는 값이 된다. 읽어야 할 것은 가중치가 아니라')
    console.log('   **치우침의 방향과 크기**다.\n')
}

main().catch((e) => { console.error('\n실패:', e.message); process.exit(1) })
