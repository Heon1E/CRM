/**
 * 2026-08 채권 스냅샷 — 「영업사원 거래처별 매출/수금 실적표」(이헌일, 6쪽)에서 옮김.
 *
 * 사용자의 ERP는 엑셀로 내리면 숫자 위치가 꼬여서 화면 사진으로 받았다.
 * 그 6장을 **사람이 직접 읽어** 여기에 적었다.
 *
 * ## 검산
 *
 * 표 맨 아래 '잔액 합계'가 **306,500,260원**이다. 아래 거래처별 8월 잔액을
 * 더해 그 값과 맞지 않으면 **아무것도 쓰지 않고 멈춘다.** 한 곳이라도 잘못
 * 옮겼으면 합이 어긋나기 때문이다.
 *
 * ## 경과월·연체금액은 계산하지 않는다
 *
 * `collectionReport.summarizeClients` -> `receivablesLedger.agingOf` 를 그대로
 * 부른다. 엑셀 대장과 같은 함수여야 숫자가 갈리지 않는다.
 *
 * 담긴 것은 **이헌일 담당분뿐**이다(전사 채권 대장이 아니다).
 *
 * ```bash
 * node execution/import_collection_report_202608.mjs            # 미리보기
 * node execution/import_collection_report_202608.mjs --apply    # 반영
 * ```
 */
import { connect } from './_supabase.mjs'
import { summarizeClients, normalizeClient, monthKey } from '../src/utils/collectionReport.js'

const APPLY = process.argv.includes('--apply')
const YEAR = 2026
const BASE_MONTH = '2026-08'
const REPORTED_BALANCE_TOTAL = 306500260   // 표의 '잔액 합계'
const SALES_REP = '이헌일'

/**
 * [거래처명, 8월 잔액, 1~8월 매출]
 * 잔액이 0인 곳은 대장에 담지 않는다(엑셀 경로와 같은 규칙).
 */
const DATA = [
    ['(주)대성산업', 23430000, [2772000, 2772000, 4268000, 5654000, 2992000, 2992000, 12342000, 11088000]],
    ['(주)휴브글로벌', 3273600, [0, 0, 3553900, 0, 1636800, 6426200, 1636800, 1636800]],
    ['(주)에프티씨코리아', 23788600, [0, 15444000, 18832000, 14592600, 0, 22958100, 15494600, 8294000]],
    ['(주)더가든오브내추럴솔루션', 28050000, [0, 0, 1254000, 5500, 6578000, 6160000, 20790000, 7260000]],
    ['한독산업(주)', 7524000, [0, 0, 9262000, 16104000, 7524000, 7524000, 7524000, 0]],
    ['진영IBC (최은성)', 10340000, [5023700, 19012400, 8148800, 2464000, 2772000, 2657600, 5766200, 4573800]],
    ['(주)오뚜기', 2079000, [5032500, 5032500, 5032500, 8523900, 2494800, 5197500, 10395000, 2079000]],
    ['신성소재(주)', 13713700, [2618000, 1771000, 4268000, 1680800, 840400, 2731300, 10772300, 2941400]],
    ['현대산업 주식회사(1)', 26180000, [1485000, 8250000, 27178800, 28798000, 9482000, 9460000, 28534000, 26180000]],
    ['부평상회', 2772000, [2772000, 0, 2772000, 2772000, 2992000, 0, 0, 0]],
    ['주식회사 윌슨플로켐', 18849600, [0, 6333800, 5740900, 0, 0, 0, 12672000, 6177600]],
    ['신성물산(주)', 1925000, [0, 0, 0, 0, 0, 0, 3465000, 0]],
    ['주식회사 수산머티리얼즈', 20671200, [6811200, 6652800, 6652800, 10956000, 13780800, 13780800, 13780800, 6890400]],
    ['현대드럼산업(주)', 49269000, [11154000, 23188000, 31609600, 28465800, 21582000, 46917200, 29425400, 19844000]],
    ['수산고분자주식회사', 4785000, [0, 0, 2587200, 0, 0, 0, 0, 4785000]],
    ['스타코스(STARCOS)', 3697760, [0, 814000, 3330800, 1804000, 880000, 924000, 1760000, 1937760]],
    ['중부산업(주)', 10945000, [5368000, 2684000, 12760000, 7876000, 3322000, 14410000, 7068600, 10945000]],
    ['인천드럼', 1694000, [2585000, 2726900, 1621400, 0, 2618000, 1694000, 1694000, 0]],
    ['(주)이한산업', 53512800, [13860000, 15840000, 12760000, 27412000, 11088000, 31966000, 18824300, 21546800]],
]

const won = (v) => Number(v || 0).toLocaleString('ko-KR')

// ---- 1. 검산 ----
const balanceSum = DATA.reduce((a, [, bal]) => a + bal, 0)
console.log(`거래처 ${DATA.length}곳 (잔액이 남은 곳만) · 기준월 ${BASE_MONTH}`)
console.log(`8월 잔액 합계 : ${won(balanceSum)}`)
console.log(`표의 잔액 합계 : ${won(REPORTED_BALANCE_TOTAL)}`)

if (balanceSum !== REPORTED_BALANCE_TOTAL) {
    console.error(`\n합이 ${won(balanceSum - REPORTED_BALANCE_TOTAL)} 어긋납니다. 옮겨 적은 값에 오류가 있습니다.`)
    console.error('아무것도 쓰지 않고 멈춥니다.')
    process.exit(1)
}
console.log('=> 표와 일치합니다.\n')

// ---- 2. 경과월·연체금액 (엑셀 대장과 같은 함수) ----
const clients = DATA.map(([name, balance, sales]) => {
    const months = {}
    sales.forEach((v, i) => { months[i + 1] = { sales: v, collected: 0, carried: 0, balance: 0 } })
    months[8] = { ...months[8], balance }
    return normalizeClient({ clientName: name, months }, YEAR)
})

const rows = summarizeClients({ clients, year: YEAR, baseMonth: BASE_MONTH })
    .sort((a, b) => (b.aging - a.aging) || (b.overdue - a.overdue))

console.log('거래처'.padEnd(28), '잔액'.padStart(14), '연체금액'.padStart(14), '경과', '최초미수월')
console.log('-'.repeat(80))
rows.forEach((r) => {
    console.log(
        r.name.padEnd(28),
        won(r.balance).padStart(14),
        won(r.overdue).padStart(14),
        String(r.aging).padStart(3),
        ' ', r.oldest || '-',
    )
})
const overdueCount = rows.filter((r) => r.overdue > 0).length
console.log('-'.repeat(80))
console.log(`연체 ${overdueCount}곳 · 연체금액 합계 ${won(rows.reduce((a, r) => a + r.overdue, 0))}`)

if (!APPLY) {
    console.log('\n미리보기입니다. --apply 를 붙이면 반영합니다.')
    process.exit(0)
}

// ---- 3. 반영 ----
const { supabase } = await connect({ write: true })

const fetchAll = async (build, size = 1000) => {
    const out = []
    for (let from = 0; ; from += size) {
        const { data, error } = await build().order('id').range(from, from + size - 1)
        if (error) throw new Error(error.message)
        out.push(...(data || []))
        if (!data || data.length < size) break
    }
    return out
}

const allClients = await fetchAll(() => supabase.from('clients').select('id, company').is('deleted_at', null))

/** 앱과 같은 기준으로 이름을 맞춘다 */
const key = (s) => String(s || '')
    .replace(/주식회사|유한회사|\(주\)|\(유\)|㈜/g, '')
    .replace(/[\s()[\]{}\-_.·]/g, '')
    .toLowerCase()
const byKey = new Map()
allClients.forEach((c) => { const k = key(c.company); if (!byKey.has(k)) byKey.set(k, c) })

// 이미 '제외'로 표시해 둔 거래처는 새 달에도 그대로 제외한다
const prevExcluded = new Map()
{
    const { data, error } = await supabase.from('receivables')
        .select('client_name, exclusion_reason').eq('excluded', true)
    if (!error) (data || []).forEach((r) => prevExcluded.set(r.client_name, r.exclusion_reason))
}

const payload = rows.map((r) => {
    const hit = byKey.get(key(r.name))
    return {
        ...(prevExcluded.has(r.name) ? { excluded: true, exclusion_reason: prevExcluded.get(r.name) } : {}),
        client_id: hit ? hit.id : null,
        client_name: r.name,
        base_month: BASE_MONTH,
        balance: Math.round(r.balance),
        overdue_amount: Math.round(r.overdue),
        aging_months: r.aging,
        oldest_unpaid_month: r.oldest,
        delay_note: `${SALES_REP} 담당 · 매출/수금 실적표에서`,
        updated_at: new Date().toISOString(),
    }
})

const unmatched = payload.filter((p) => !p.client_id).map((p) => p.client_name)

for (let i = 0; i < payload.length; i += 200) {
    const { error } = await supabase.from('receivables')
        .upsert(payload.slice(i, i + 200), { onConflict: 'client_name,base_month' })
    if (error) throw new Error(`반영 실패: ${error.message}`)
}

console.log(`\n${BASE_MONTH} 기준 ${payload.length}곳을 반영했습니다.`)
console.log(`거래처 연결 ${payload.filter((p) => p.client_id).length}곳`)
if (unmatched.length) console.log(`거래처를 못 찾은 곳: ${unmatched.join(', ')}`)
