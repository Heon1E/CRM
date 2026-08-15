/**
 * 잘못 등록된 매출 업로드 배치 되돌리기
 *
 * 배경 (2026-08-05 사고):
 *   엑셀 일괄업로드의 대사(reconcileSales)가 '엑셀에 있는 날짜'로 기존 매출을
 *   조회하는데, 엑셀은 '20260122', DB는 '2026-01-22' 형식이라 문자열이 달랐다.
 *   그 결과 기존 매출을 하나도 찾지 못하고 전부 신규로 판단해 3,198건을
 *   그대로 다시 등록했다. (매출 420.53억 -> 514.28억)
 *
 * 이 스크립트는 특정 업로드 배치를 통째로 지워 업로드 직전 상태로 되돌린다.
 * 배치는 created_at(분 단위)으로 식별한다. 한 번의 업로드는 같은 시각에 저장된다.
 *
 * 사용법:
 *   node execution/rollback_sales_batch.mjs --list
 *       최근 업로드 배치 목록을 보여준다 (DB 변경 없음)
 *
 *   node execution/rollback_sales_batch.mjs --batch "2026-08-05T23:01"
 *       해당 배치를 지우면 어떻게 되는지 미리보기 (DB 변경 없음)
 *
 *   node execution/rollback_sales_batch.mjs --batch "2026-08-05T23:01" --apply
 *       실제 삭제
 *
 *   기본은 미리보기다. --apply 없이는 아무것도 바꾸지 않는다.
 */

import fs from 'fs'
import path from 'path'
import { connect } from './_supabase.mjs'

const { supabase } = await connect({ write: process.argv.includes('--apply') })

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const LIST = args.includes('--list')
const batchIdx = args.indexOf('--batch')
const BATCH = batchIdx !== -1 ? args[batchIdx + 1] : null

const fetchAll = async (build, pageSize = 1000) => {
    let from = 0, out = []
    for (;;) {
        const { data, error } = await build().range(from, from + pageSize - 1)
        if (error) throw error
        out = out.concat(data || [])
        if (!data || data.length < pageSize) break
        from += pageSize
    }
    return out
}

const eok = (v) => (v / 100000000).toFixed(2) + '억'
const man = (v) => Math.round(v / 10000).toLocaleString('ko-KR') + '만원'

const sales = await fetchAll(() =>
    supabase.from('sales').select('id, sale_date, client_id, item_name, quantity, unit_price, total_amount, created_at').order('id')
)
const totalNow = sales.reduce((a, s) => a + (Number(s.total_amount) || 0), 0)
console.log(`현재 매출 ${sales.length.toLocaleString()}건 / 총액 ${eok(totalNow)}\n`)

// ---------- 배치 목록 ----------
const byBatch = {}
sales.forEach(s => {
    const k = (s.created_at || '').slice(0, 16)
    const e = byBatch[k] || (byBatch[k] = { rows: 0, amt: 0, dates: new Set() })
    e.rows++
    e.amt += Number(s.total_amount) || 0
    if (s.sale_date) e.dates.add(s.sale_date)
})

if (LIST || !BATCH) {
    console.log('업로드 배치 (생성 시각 기준, 건수 많은 순 상위 12개)')
    console.log('─'.repeat(76))
    Object.entries(byBatch)
        .sort((a, b) => b[1].rows - a[1].rows)
        .slice(0, 12)
        .forEach(([k, v]) => {
            const ds = [...v.dates].sort()
            console.log(`  ${k}  ${String(v.rows).padStart(6)}건  ${eok(v.amt).padStart(9)}  매출일 ${ds.length}일 (${ds[0]} ~ ${ds[ds.length - 1]})`)
        })
    console.log('─'.repeat(76))
    if (!BATCH) {
        console.log('\n되돌릴 배치를 --batch "YYYY-MM-DDTHH:mm" 으로 지정하세요.')
        process.exit(0)
    }
    console.log('')
}

// ---------- 대상 배치 분석 ----------
const target = sales.filter(s => (s.created_at || '').slice(0, 16) === BATCH)
if (target.length === 0) {
    console.error(`배치 "${BATCH}" 에 해당하는 매출이 없습니다. --list 로 확인하세요.`)
    process.exit(1)
}

const others = sales.filter(s => (s.created_at || '').slice(0, 16) !== BATCH)
const key = (s) => `${s.sale_date}|${s.client_id}|${(s.item_name || '').trim()}|${Number(s.quantity) || 0}|${Number(s.unit_price) || 0}`

const remain = {}
others.forEach(s => { remain[key(s)] = (remain[key(s)] || 0) + 1 })

let dupOfExisting = 0, brandNew = 0, brandNewAmt = 0
const newSamples = []
target.forEach(s => {
    const k = key(s)
    if (remain[k] > 0) { remain[k]--; dupOfExisting++ }
    else {
        brandNew++
        brandNewAmt += Number(s.total_amount) || 0
        if (newSamples.length < 8) newSamples.push(s)
    }
})

const targetAmt = target.reduce((a, s) => a + (Number(s.total_amount) || 0), 0)
const dates = [...new Set(target.map(s => s.sale_date))].sort()

console.log(`대상 배치: ${BATCH}`)
console.log('─'.repeat(76))
console.log(`  삭제할 매출        : ${target.length.toLocaleString()}건 / ${eok(targetAmt)}`)
console.log(`  매출일 범위        : ${dates[0]} ~ ${dates[dates.length - 1]} (${dates.length}일)`)
console.log('')
console.log(`  이 중 기존과 완전 동일(중복) : ${dupOfExisting.toLocaleString()}건`)
console.log(`  이 중 기존에 없던 데이터     : ${brandNew.toLocaleString()}건 / ${man(brandNewAmt)}`)
console.log('')
console.log(`  삭제 후 매출       : ${(sales.length - target.length).toLocaleString()}건 / ${eok(totalNow - targetAmt)}`)
console.log('─'.repeat(76))

if (brandNew > 0) {
    console.log(`\n※ '기존에 없던 데이터' ${brandNew}건도 함께 지워집니다.`)
    console.log('   버그를 고친 뒤 같은 엑셀을 다시 올리면 정상적으로 반영됩니다.')
    console.log('   (샘플)')
    newSamples.forEach(s => console.log(`     ${s.sale_date}  ${(s.item_name || '').slice(0, 24).padEnd(26)} ${man(Number(s.total_amount) || 0)}`))
}

if (!APPLY) {
    console.log('\n※ 미리보기입니다. DB는 전혀 변경되지 않았습니다.')
    console.log('※ 내용이 맞으면 같은 명령에 --apply 를 붙여 다시 실행하세요.')
    process.exit(0)
}

// ---------- 삭제 ----------
console.log('\n삭제를 시작합니다...')

// 되돌릴 수 있도록 지우기 전에 원본을 파일로 남긴다
try {
    const dir = path.resolve(process.cwd(), '.tmp')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `rollback_backup_${BATCH.replace(/[:T-]/g, '')}.json`)
    fs.writeFileSync(file, JSON.stringify({ batch: BATCH, deletedAt: new Date().toISOString(), rows: target }, null, 2))
    console.log(`  백업 저장: ${file}`)
} catch (e) {
    console.error('  백업 저장 실패:', e.message)
    console.error('  안전을 위해 삭제를 중단합니다.')
    process.exit(1)
}

const ids = target.map(s => s.id)
const CHUNK = 200
let deleted = 0
for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const { error } = await supabase.from('sales').delete().in('id', chunk)
    if (error) {
        console.error(`  삭제 실패 (${i}~): ${error.message}`)
        console.error(`  ${deleted}건까지 삭제된 상태입니다. 백업 파일로 복구할 수 있습니다.`)
        process.exit(1)
    }
    deleted += chunk.length
    if (deleted % 1000 === 0 || deleted === ids.length) console.log(`  ${deleted}/${ids.length}`)
}

// 확인
const after = await fetchAll(() => supabase.from('sales').select('total_amount').order('id'))
const afterAmt = after.reduce((a, s) => a + (Number(s.total_amount) || 0), 0)
console.log(`\n완료: ${deleted.toLocaleString()}건 삭제`)
console.log(`현재 매출 ${after.length.toLocaleString()}건 / 총액 ${eok(afterAmt)}`)
