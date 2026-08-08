/**
 * 외상매출금 관리대장(.xlsx) 분석 + 채권관리 화면에 반영
 *
 * 대장은 가로로 긴 표다. 거래처 한 줄에 월별로 [매출/수금/잔액] 3칸이 반복된다.
 *
 *   1) 연체 순위 — 잔액을 기준월 매출부터 거꾸로 배분(FIFO)해 가장 오래된 미수분이
 *      몇 개월 전 매출인지 계산한다. 대장의 '지연' 메모는 108곳 중 10곳에만 적혀 있어
 *      정렬 기준이 되지 못한다. 계산값이 있어야 순서가 생긴다.
 *
 *   2) 매출 대조 — 대장 월별 매출 vs CRM 매출.
 *      **대장 금액은 부가세 포함이고 CRM은 공급가액이다.** 그대로 비교하면 CRM이
 *      늘 9% 적어 보인다. 1.1로 나눠야 맞는다.
 *      (2024-12~2026-05 실측 일치율 99.9%)
 *
 * 계산은 `src/utils/receivablesLedger.js`에 있다. 앱의 화면 업로드와 **같은 코드**를
 * 써야 결과가 어긋나지 않는다. tests/receivablesLedger.test.mjs가 고정한다.
 *
 * 이 대장은 외상(신용) 거래만 담는다. 현금·카드 거래는 빠져 있을 수 있다.
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
import { parseReceivablesLedger, agingBucket } from '../src/utils/receivablesLedger.js'

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
    console.error('사용법: node execution/analyze_receivables.mjs "<외상매출금.xlsx>" [--apply]')
    process.exit(1)
}
if (!fs.existsSync(file)) {
    console.error(`파일 없음: ${file}`)
    process.exit(1)
}

const eok = (v) => (v / 1e8).toFixed(2) + '억'
const won = (v) => Math.round(v).toLocaleString('ko-KR') + '원'
const VAT = 1.1

// ---------------------------------------------------------------------------
// 판독
// ---------------------------------------------------------------------------
const wb = xlsx.readFile(file)
const ws = wb.Sheets[wb.SheetNames[0]]
const sheet = {
    aoa: xlsx.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }),
    merges: ws['!merges'] || []
}

const { baseMonth, months, rows: aged, salesByMonth } = parseReceivablesLedger(sheet)

console.log(`외상매출금 대장 분석 — ${path.basename(file)}`)
if (!baseMonth) {
    console.error('  잔액이 채워진 달을 찾지 못했습니다. 대장 양식이 바뀌었는지 확인해 주세요.')
    process.exit(1)
}
console.log(`  월 데이터 ${months[0]} ~ ${months[months.length - 1]} / 기준월 ${baseMonth}`)
console.log(`  잔액·메모가 있는 거래처 ${aged.length}곳\n`)

// ---------------------------------------------------------------------------
// 1) 연체 현황
// ---------------------------------------------------------------------------
const withBalance = aged.filter((x) => x.balance > 0)
const overdueList = aged.filter((x) => x.overdue > 0)
    .sort((a, b) => b.aging - a.aging || b.overdue - a.overdue)

const buckets = {}
withBalance.forEach((x) => { buckets[agingBucket(x.aging)] = (buckets[agingBucket(x.aging)] || 0) + 1 })

console.log('연체 현황 (잔액을 최근 매출부터 거꾸로 배분해 계산)')
console.log('─'.repeat(88))
// 총액은 음수(선수금)까지 포함해 합산한다. 그래야 대장의 합계행과 맞아떨어진다.
const netTotal = aged.reduce((a, x) => a + x.balance, 0)
console.log(`  ${baseMonth} 말 총 미수금 : ${won(netTotal)} (${eok(netTotal)})`)
Object.entries(buckets).forEach(([k, v]) => console.log(`  ${k.padEnd(16)} ${v}곳`))
console.log(`  연체 업체 ${overdueList.length}곳 / 연체 총액 ${won(overdueList.reduce((a, x) => a + x.overdue, 0))}`)
console.log('─'.repeat(88))

console.log('\n  [연체 상위 15곳]')
overdueList.slice(0, 15).forEach((x) =>
    console.log(`    ${x.name.slice(0, 20).padEnd(22)} 잔액 ${won(x.balance).padStart(15)}  연체 ${won(x.overdue).padStart(15)}  ${x.aging}개월  최초 ${x.oldest || '-'}  ${x.delay}`)
)

const delayed = aged.filter((x) => x.delay)
if (delayed.length) {
    console.log(`\n  [대장에 '지연' 표시된 ${delayed.length}곳]`)
    delayed.sort((a, b) => b.overdue - a.overdue).forEach((x) =>
        console.log(`    ${x.name.slice(0, 20).padEnd(22)} 연체 ${won(x.overdue).padStart(14)}  ${x.aging}개월  [${x.delay}]`)
    )
}

console.log(`\n  ※ KPI 채권관리 숫자는 연체 업체 수 ${overdueList.length}건입니다.`)
console.log(`     채권관리 화면의 'KPI에 저장' 버튼으로 넣을 수 있습니다.`)

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

console.log('\n\nCRM 매출과 대조 (대장 ÷ 1.1 = 공급가액 기준)')
console.log('─'.repeat(72))
console.log('  월         대장(VAT포함)   대장÷1.1        CRM          일치율')
let te = 0, tc = 0
Object.keys(salesByMonth).sort().forEach((m) => {
    const erp = salesByMonth[m]
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

// 이미 '제외'로 표시해 둔 거래처는 새 달에도 그대로 제외한다.
// 회계 장부가 고쳐지기 전까지 대장에는 계속 미수로 찍혀 나오기 때문이다.
const prevExcluded = new Map()
try {
    const ex = await fetchAll(() =>
        supabase.from('receivables').select('client_name, exclusion_reason').eq('excluded', true).order('client_name')
    )
    ex.forEach((r) => { if (!prevExcluded.has(r.client_name)) prevExcluded.set(r.client_name, r.exclusion_reason) })
    if (prevExcluded.size) console.log(`  제외 표시를 물려받는 거래처 ${prevExcluded.size}곳`)
} catch (e) {
    // excluded 열이 아직 없으면(마이그레이션 전) 그냥 넘어간다
    if (!/column .* does not exist|excluded/i.test(e.message || '')) throw e
}

const payload = aged.map((x) => {
    const hit = keysOf(x.name).map((k) => clientMap.get(k)).find(Boolean)
    const row = {
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
    if (prevExcluded.has(x.name)) {
        row.excluded = true
        row.exclusion_reason = prevExcluded.get(x.name)
    }
    return row
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
        if (/relation .* does not exist|schema cache|PGRST205/i.test(error.message + error.code)) {
            console.error('  execution/sql/receivables.sql 을 Supabase SQL Editor에서 먼저 실행해 주세요.')
        }
        process.exit(1)
    }
    saved += chunk.length
}
console.log(`완료: ${saved}건 반영 (채권관리 화면에서 확인)`)
