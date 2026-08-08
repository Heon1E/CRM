/**
 * 외상매출금 관리대장(.xlsx) 분석
 *
 * 회사 대장은 가로로 긴 표다. 거래처 한 줄에 월별로 [매출/수금/잔액] 3칸이 반복된다.
 * 여기서 두 가지를 뽑는다:
 *
 *   1) 채권 현황  — 기준월 잔액, '지연' 표시된 건수
 *      KPI '채권관리'는 이 지연 건수를 쓴다. localStorage에 저장되므로
 *      숫자를 화면(대시보드 KPI 카드)에 직접 넣어야 한다. 스크립트가 대신 넣을 수 없다.
 *
 *   2) 매출 대조  — 대장의 월별 매출 vs CRM 매출
 *      **대장 금액은 부가세 포함(VAT 10%)이고 CRM은 공급가액이다.**
 *      그대로 비교하면 CRM이 늘 9% 적어 보인다. 1.1로 나눠 비교해야 한다.
 *
 * 이 대장은 외상(신용) 거래만 담는다. 현금·카드 거래는 빠져 있을 수 있다.
 *
 * 3) 연체 순위  — 잔액을 최근 매출부터 거꾸로 배분해(FIFO) 가장 오래된 미수분이
 *      몇 개월 전 매출인지 계산한다. 대장의 '지연' 메모는 108곳 중 10곳에만 적혀 있어
 *      정렬 기준이 되지 못한다. 계산값이 있어야 순서가 생긴다.
 *
 * 사용법:
 *   node execution/analyze_receivables.mjs "<외상매출금.xlsx>"           # 보기만
 *   node execution/analyze_receivables.mjs "<외상매출금.xlsx>" --apply   # receivables 테이블에 반영
 *
 * --apply 없이는 DB를 바꾸지 않는다. 같은 달을 다시 올리면 덮어쓴다.
 */

import { createClient } from '@supabase/supabase-js'
import xlsx from 'xlsx'
import fs from 'fs'
import path from 'path'

const loadEnv = () => {
    for (const file of ['.env.local', '.env']) {
        const p = path.resolve(process.cwd(), file)
        if (!fs.existsSync(p)) continue
        const env = Object.fromEntries(
            fs.readFileSync(p, 'utf8').split('\n')
                .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
                .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')] })
        )
        if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) return env
    }
    throw new Error('.env.local 또는 .env에서 Supabase 설정을 찾지 못했습니다.')
}

const APPLY = process.argv.includes('--apply')
const file = process.argv.slice(2).find((a) => !a.startsWith('--'))
if (!file) {
    console.error('사용법: node execution/analyze_receivables.mjs "<외상매출금.xlsx>"')
    process.exit(1)
}

const N = (v) => { const s = String(v ?? '').replace(/[^0-9.-]/g, ''); return s ? (Number(s) || 0) : 0 }
const eok = (v) => (v / 1e8).toFixed(2) + '억'
const won = (v) => Math.round(v).toLocaleString('ko-KR') + '원'
const VAT = 1.1

// ---------------------------------------------------------------------------
// 대장 읽기 — 열 위치를 고정하지 않고 헤더에서 찾는다.
// 월이 추가되면 열이 밀리므로 하드코딩하면 다음 달에 깨진다.
// ---------------------------------------------------------------------------
const wb = xlsx.readFile(file)
const ws = wb.Sheets[wb.SheetNames[0]]
const A = xlsx.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })

// 2행: 월 헤더(병합됨) / 3행: 매출·수금·잔액
const h2 = [...(A[2] || [])]
;(ws['!merges'] || []).forEach((m) => {
    if (m.s.r !== 2) return
    const v = A[2][m.s.c]
    for (let c = m.s.c; c <= m.e.c; c++) h2[c] = v
})
const h3 = A[3] || []

const NAME_COL = 1
const monthCols = {}   // 'YYYY-MM' -> { 매출, 수금, 잔액 }
let delayCol = null
h2.forEach((v, i) => {
    const label = String(v ?? '').trim()
    const sub = String(h3[i] ?? '').trim()
    const m = label.match(/(\d{4})년\s*(\d{1,2})월/)
    if (m && ['매출', '수금', '잔액'].includes(sub)) {
        const key = `${m[1]}-${String(m[2]).padStart(2, '0')}`
        ;(monthCols[key] = monthCols[key] || {})[sub] = i
    }
    if (/지연/.test(sub) || /지연/.test(label)) delayCol = i
})

const rows = []
for (let r = 4; r < A.length; r++) {
    const name = String(A[r][NAME_COL] ?? '').trim()
    if (!name || /^(합계|계|총계|소계)$/.test(name)) continue
    rows.push({ r, name, raw: A[r] })
}

// 기준월 = 잔액이 마지막으로 채워진 달
const months = Object.keys(monthCols).sort()
let baseMonth = null
for (const m of months) {
    const c = monthCols[m]['잔액']
    if (c == null) continue
    if (rows.some((x) => N(x.raw[c]) !== 0)) baseMonth = m
}

console.log(`외상매출금 대장 분석 — ${path.basename(file)}`)
console.log(`  거래처 ${rows.length.toLocaleString()}곳 / 월 데이터 ${months[0]} ~ ${months[months.length - 1]}`)
console.log(`  기준월 ${baseMonth}\n`)

// ---------------------------------------------------------------------------
// 1) 채권 현황
// ---------------------------------------------------------------------------
const balCol = monthCols[baseMonth]['잔액']
const outstanding = rows.map((x) => ({ name: x.name, bal: N(x.raw[balCol]), delay: delayCol != null ? String(x.raw[delayCol] ?? '').trim() : '' }))
    .filter((x) => x.bal !== 0 || x.delay)

const total = outstanding.reduce((a, x) => a + x.bal, 0)
const delayed = outstanding.filter((x) => x.delay)

console.log('채권 현황')
console.log('─'.repeat(72))
console.log(`  ${baseMonth} 말 외상매출금 총액 : ${won(total)} (${eok(total)})`)
console.log(`  잔액이 있는 거래처        : ${outstanding.filter((x) => x.bal !== 0).length}곳`)
console.log(`  '지연' 표시된 건          : ${delayed.length}건   <- KPI 채권관리에 넣을 숫자`)
console.log('─'.repeat(72))

if (delayed.length) {
    console.log('\n  [지연 거래처]')
    delayed.sort((a, b) => b.bal - a.bal).forEach((x) =>
        console.log(`    ${x.name.slice(0, 22).padEnd(24)} ${won(x.bal).padStart(15)}   ${x.delay}`)
    )
}

console.log('\n  [잔액 상위 10곳]')
outstanding.filter((x) => x.bal > 0).sort((a, b) => b.bal - a.bal).slice(0, 10)
    .forEach((x) => console.log(`    ${x.name.slice(0, 22).padEnd(24)} ${won(x.bal).padStart(15)}`))

console.log(`\n  ※ KPI 채권관리는 브라우저에 저장되는 값이라 스크립트가 넣을 수 없습니다.`)
console.log(`     대시보드 > KPI 카드 > 채권관리 를 펼쳐 ${delayed.length} 을 직접 넣어 주세요.`)

// ---------------------------------------------------------------------------
// 1-2) 연체 경과월 계산 (FIFO)
//
// 잔액을 기준월 매출부터 거꾸로 배분한다. 다 채우고도 남으면 그만큼 더 오래된
// 매출이 아직 미수라는 뜻이다.
//   aging 0 = 당월 매출만 미수 (익월 결제 조건에서는 정상)
//   aging 1 = 전월 매출까지 미수
// overdue(연체금액)는 '당월 매출을 넘어선 잔액' = 실제로 밀린 돈이다.
//
// 대장의 '지연' 메모만으로는 108곳 중 10곳밖에 순서를 못 매긴다. 그래서 계산한다.
// ---------------------------------------------------------------------------
const monthsUpto = months.filter((m) => m <= baseMonth)

const agingOf = (raw) => {
    const balance = N(raw[balCol])
    if (balance <= 0) return { balance, aging: 0, overdue: 0, oldest: null }

    let rest = balance, aging = 0, oldest = null
    for (let i = monthsUpto.length - 1; i >= 0; i--) {
        const col = monthCols[monthsUpto[i]]['매출']
        if (col == null) continue
        const amt = N(raw[col])
        if (amt <= 0) continue
        rest -= Math.min(rest, amt)
        oldest = monthsUpto[i]
        aging = monthsUpto.length - 1 - i
        if (rest <= 0) break
    }
    const current = N(raw[monthCols[baseMonth]['매출']])
    return { balance, aging, overdue: Math.max(0, balance - current), oldest }
}

const aged = rows
    .map((x) => ({
        name: x.name,
        delay: delayCol != null ? String(x.raw[delayCol] ?? '').trim() : '',
        ...agingOf(x.raw)
    }))
    .filter((x) => x.balance !== 0 || x.delay)

const overdueList = aged.filter((x) => x.overdue > 0)
    .sort((a, b) => b.aging - a.aging || b.overdue - a.overdue)

const bucket = (a) => (a <= 0 ? '정상(당월분)' : a === 1 ? '1개월' : a === 2 ? '2개월' : '3개월 이상')
const buckets = {}
aged.filter((x) => x.balance > 0).forEach((x) => { buckets[bucket(x.aging)] = (buckets[bucket(x.aging)] || 0) + 1 })

console.log('\n\n연체 현황 (잔액을 최근 매출부터 거꾸로 배분해 계산)')
console.log('─'.repeat(88))
Object.entries(buckets).forEach(([k, v]) => console.log(`  ${k.padEnd(14)} ${v}곳`))
console.log(`  연체 업체 ${overdueList.length}곳 / 연체 총액 ${won(overdueList.reduce((a, x) => a + x.overdue, 0))}`)
console.log('─'.repeat(88))
console.log('\n  [연체 상위 15곳]')
overdueList.slice(0, 15).forEach((x) =>
    console.log(`    ${x.name.slice(0, 20).padEnd(22)} 잔액 ${won(x.balance).padStart(15)}  연체 ${won(x.overdue).padStart(15)}  ${x.aging}개월  최초 ${x.oldest || '-'}  ${x.delay}`)
)

// ---------------------------------------------------------------------------
// 2) CRM 매출과 대조
// ---------------------------------------------------------------------------
const env = loadEnv()
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const fetchAll = async (build, ps = 1000) => {
    let from = 0, out = []
    for (;;) {
        const { data, error } = await build().range(from, from + ps - 1)
        if (error) throw error
        out = out.concat(data || [])
        if (!data || data.length < ps) break
        from += ps
    }
    return out
}

const sales = await fetchAll(() => supabase.from('sales').select('sale_date, total_amount').order('id'))
const crmByMonth = {}
sales.forEach((s) => {
    const k = String(s.sale_date || '').slice(0, 7)
    if (k) crmByMonth[k] = (crmByMonth[k] || 0) + (Number(s.total_amount) || 0)
})

const compareMonths = months.filter((m) => {
    const c = monthCols[m]['매출']
    return c != null && rows.some((x) => N(x.raw[c]) !== 0)
})

console.log('\n\nCRM 매출과 대조 (대장 금액 ÷ 1.1 = 공급가액 기준)')
console.log('─'.repeat(72))
console.log('  월         대장(VAT포함)   대장÷1.1        CRM          일치율')
let te = 0, tc = 0
compareMonths.forEach((m) => {
    const col = monthCols[m]['매출']
    const erp = rows.reduce((a, x) => a + N(x.raw[col]), 0)
    const supply = erp / VAT
    const crm = crmByMonth[m] || 0
    te += supply; tc += crm
    console.log(`  ${m}   ${eok(erp).padStart(10)}   ${eok(supply).padStart(10)}   ${eok(crm).padStart(10)}   ${supply ? (crm / supply * 100).toFixed(1) + '%' : '-'}`)
})
console.log('─'.repeat(72))
console.log(`  합계       ${''.padStart(10)}   ${eok(te).padStart(10)}   ${eok(tc).padStart(10)}   ${te ? (tc / te * 100).toFixed(1) + '%' : '-'}`)
console.log(`  차이       ${won(tc - te)}`)
console.log('\n  ※ 대장은 외상(신용) 거래만 담습니다. 현금·카드 거래는 여기에 없을 수 있습니다.')

// ---------------------------------------------------------------------------
// 3) receivables 테이블에 반영
// ---------------------------------------------------------------------------
if (!APPLY) {
    console.log('  ※ 읽기 전용으로 실행했습니다. DB는 변경되지 않았습니다.')
    console.log('  ※ 채권관리 화면에 반영하려면 --apply 를 붙여 다시 실행하세요.')
    process.exit(0)
}

// 거래처 연결 (앱의 매칭 기준과 같아야 한다)
const normalizeKey = (name, { removeCorp = false, removePunct = false } = {}) => {
    if (!name) return ''
    let t = String(name).replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/㈜/g, '(주)').trim()
    if (removeCorp) t = t.replace(/주식회사|유한회사|합자회사|합명회사|유한|㈜|\(주\)|\(유\)/g, '')
    t = removePunct ? t.replace(/[\s()[\]{}\-_.·]/g, '') : t.replace(/\s+/g, '')
    return t.toLowerCase()
}
const keysOf = (n) => [...new Set([
    normalizeKey(n), normalizeKey(n, { removeCorp: true }),
    normalizeKey(n, { removePunct: true }), normalizeKey(n, { removeCorp: true, removePunct: true })
])].filter(Boolean)

const clients = await fetchAll(() => supabase.from('clients').select('id, company').order('company'))
const clientMap = new Map()
clients.forEach((c) => keysOf(c.company).forEach((k) => { if (!clientMap.has(k)) clientMap.set(k, c) }))

const payload = aged.map((x) => {
    const hit = keysOf(x.name).map((k) => clientMap.get(k)).find(Boolean)
    return {
        client_id: hit ? hit.id : null,
        client_name: x.name,
        base_month: baseMonth,
        balance: Math.round(x.balance),
        overdue_amount: Math.round(x.overdue),
        aging_months: x.aging,
        oldest_unpaid_month: x.oldest,
        delay_note: x.delay || null,
        updated_at: new Date().toISOString()
    }
})

const linked = payload.filter((p) => p.client_id).length
console.log(`\n채권 ${payload.length}건을 ${baseMonth} 기준으로 반영합니다 (거래처 연결 ${linked} / 미연결 ${payload.length - linked})`)

let saved = 0
for (let i = 0; i < payload.length; i += 200) {
    const chunk = payload.slice(i, i + 200)
    // 같은 달을 다시 올리면 덮어쓴다 (unique: client_name + base_month)
    const { error } = await supabase.from('receivables')
        .upsert(chunk, { onConflict: 'client_name,base_month' })
    if (error) {
        console.error('반영 실패:', error.message)
        if (/relation .* does not exist|schema cache/i.test(error.message)) {
            console.error('  execution/sql/receivables.sql 을 Supabase에서 먼저 실행해 주세요.')
        }
        process.exit(1)
    }
    saved += chunk.length
}
console.log(`완료: ${saved}건 반영 (채권관리 화면에서 확인)`)
