/**
 * 외상매출금 관리대장 판독 + 연체 경과월 계산 (순수 함수)
 *
 * 대장은 가로로 긴 표다. 거래처 한 줄에 월별로 [매출/수금/잔액] 3칸이 반복된다.
 * 앱(화면 업로드)과 스크립트(`execution/analyze_receivables.mjs`)가 **같은 결과를
 * 내야 하므로** 계산은 전부 여기 모아 둔다. 부작용 없음 · xlsx 의존 없음.
 *
 * 입력은 시트를 2차원 배열로 편 것과 병합셀 정보다. 호출부에서 xlsx로 만들어 넘긴다.
 *   aoa    = xlsx.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
 *   merges = ws['!merges']
 */

/** '1,234,000' / '(1,200)' / '' -> 숫자 */
export const toNumber = (v) => {
    const s = String(v ?? '').replace(/[^0-9.-]/g, '')
    if (!s) return 0
    const n = Number(s)
    return Number.isFinite(n) ? n : 0
}

const TOTAL_ROW = /^(합계|계|총계|소계)$/

const NAME_COL = 1
const HEADER_MONTH_ROW = 2   // '2026년 05월' (병합)
const HEADER_SUB_ROW = 3     // '매출' / '수금' / '잔액'
const FIRST_DATA_ROW = 4

/**
 * 월 열 위치를 헤더에서 찾는다.
 *
 * **열 번호를 하드코딩하면 안 된다.** 달이 하나 추가되면 뒤가 전부 밀려서
 * 다음 달에 조용히 엉뚱한 값을 읽는다.
 */
export const findColumns = ({ aoa, merges = [] }) => {
    const monthRow = [...(aoa[HEADER_MONTH_ROW] || [])]
    // 병합된 월 헤더를 각 열로 펼친다
    merges.forEach((m) => {
        if (m.s.r !== HEADER_MONTH_ROW) return
        const v = aoa[HEADER_MONTH_ROW][m.s.c]
        for (let c = m.s.c; c <= m.e.c; c++) monthRow[c] = v
    })
    const subRow = aoa[HEADER_SUB_ROW] || []

    const monthCols = {}
    let delayCol = null

    monthRow.forEach((v, i) => {
        const label = String(v ?? '').trim()
        const sub = String(subRow[i] ?? '').trim()

        const m = label.match(/(\d{4})년\s*(\d{1,2})월/)
        if (m && ['매출', '수금', '잔액'].includes(sub)) {
            const key = `${m[1]}-${String(m[2]).padStart(2, '0')}`
            if (!monthCols[key]) monthCols[key] = {}
            monthCols[key][sub] = i
        }
        if (/지연/.test(sub) || /지연/.test(label)) delayCol = i
    })

    return { monthCols, delayCol, months: Object.keys(monthCols).sort() }
}

/** 거래처 데이터 행만 추린다 (합계행 제외) */
export const dataRows = (aoa) => {
    const out = []
    for (let r = FIRST_DATA_ROW; r < aoa.length; r++) {
        const name = String(aoa[r]?.[NAME_COL] ?? '').trim()
        if (!name || TOTAL_ROW.test(name)) continue
        out.push({ rowIndex: r, name, cells: aoa[r] })
    }
    return out
}

/**
 * 기준월 = 잔액이 채워진 마지막 달.
 * 대장은 12월까지 열이 미리 만들어져 있어 마지막 열을 그냥 쓰면 빈 달을 집는다.
 */
export const findBaseMonth = ({ months, monthCols, rows }) => {
    let base = null
    for (const m of months) {
        const col = monthCols[m]['잔액']
        if (col == null) continue
        if (rows.some((x) => toNumber(x.cells[col]) !== 0)) base = m
    }
    return base
}

/**
 * 연체 경과월 계산 (FIFO).
 *
 * 잔액을 기준월 매출부터 **거꾸로** 배분한다. 당월 매출로 다 덮이면 aging 0,
 * 전월까지 가야 덮이면 1 ... 이런 식이다.
 *
 * 정상 거래처는 `수금 = 전월 매출`, `잔액 = 당월 매출`로 익월 결제가 지켜진다.
 * 그래서 **aging 0은 연체가 아니다.** 당월 매출을 넘어선 부분(overdue)이 실제로 밀린 돈이다.
 *
 * 대장의 '지연' 메모로 정렬하지 않는 이유: 108곳 중 10곳에만 적혀 있어 순서가 안 생긴다.
 */
export const agingOf = ({ cells, monthCols, monthsUpto, baseMonth }) => {
    const balCol = monthCols[baseMonth]['잔액']
    const balance = toNumber(cells[balCol])
    if (balance <= 0) return { balance, aging: 0, overdue: 0, oldest: null }

    let rest = balance
    let aging = 0
    let oldest = null

    for (let i = monthsUpto.length - 1; i >= 0; i--) {
        const col = monthCols[monthsUpto[i]]['매출']
        if (col == null) continue
        const amount = toNumber(cells[col])
        if (amount <= 0) continue

        rest -= Math.min(rest, amount)
        oldest = monthsUpto[i]
        aging = monthsUpto.length - 1 - i
        if (rest <= 0) break
    }

    const current = toNumber(cells[monthCols[baseMonth]['매출']])
    return { balance, aging, overdue: Math.max(0, balance - current), oldest }
}

/**
 * 대장 한 장을 통째로 판독한다.
 *
 * @param {{ aoa: Array<Array>, merges?: Array }} sheet
 * @returns {{
 *   baseMonth: string|null, months: string[],
 *   rows: Array<{ name, balance, overdue, aging, oldest, delay }>,
 *   salesByMonth: Object   // 'YYYY-MM' -> 대장 매출 합계 (부가세 포함)
 * }}
 */
export const parseReceivablesLedger = (sheet) => {
    const { monthCols, delayCol, months } = findColumns(sheet)
    const rows = dataRows(sheet.aoa)
    const baseMonth = findBaseMonth({ months, monthCols, rows })

    if (!baseMonth) return { baseMonth: null, months, rows: [], salesByMonth: {} }

    const monthsUpto = months.filter((m) => m <= baseMonth)

    const parsed = rows.map((x) => ({
        name: x.name,
        delay: delayCol != null ? String(x.cells[delayCol] ?? '').trim() : '',
        ...agingOf({ cells: x.cells, monthCols, monthsUpto, baseMonth })
    })).filter((x) => x.balance !== 0 || x.delay)

    // 매출 대조용 월별 합계 (대장은 부가세 포함, CRM은 공급가액 -> 비교 시 1.1로 나눌 것)
    const salesByMonth = {}
    months.forEach((m) => {
        const col = monthCols[m]['매출']
        if (col == null) return
        const sum = rows.reduce((a, x) => a + toNumber(x.cells[col]), 0)
        if (sum !== 0) salesByMonth[m] = sum
    })

    return { baseMonth, months, rows: parsed, salesByMonth }
}

/** 화면 표시용 구간 */
export const agingBucket = (aging) =>
    aging <= 0 ? '정상(당월분)' : aging === 1 ? '1개월' : aging === 2 ? '2개월' : '3개월 이상'

/**
 * 대장 한 달치를 요약한다 — 총 미수금 · 연체 건수 · 연체 금액 · 3개월 이상.
 *
 * **화면과 KPI가 같은 함수를 쓴다.** 예전에는 채권관리 화면 안에만 이 계산이
 * 있어서, KPI로 보내려면 사람이 '저장' 단추를 눌러야 했다. 같은 숫자를 두
 * 군데서 따로 세면 어긋났을 때 어느 쪽이 맞는지 알 수 없다.
 *
 * - **제외 표시된 건은 전부 뺀다.** 회계팀이 잘못 잡은 미수(선입금 건 등)라
 *   실제 채권이 아니다.
 * - **총 미수금은 음수(선수금)까지 더한다.** 그래야 대장의 합계행과 맞는다.
 * - **연체는 `overdue_amount > 0`으로 본다.** 대장의 '지연' 메모는 108곳 중
 *   10곳에만 적혀 있어 기준이 되지 못한다.
 */
export const summarizeReceivables = (rows = []) => {
    const active = rows.filter((r) => !r.excluded)
    const overdue = active.filter((r) => Number(r.overdue_amount) > 0)
    return {
        total: active.reduce((a, r) => a + Number(r.balance || 0), 0),
        clients: active.filter((r) => Number(r.balance) > 0).length,
        overdueCount: overdue.length,
        overdueAmount: overdue.reduce((a, r) => a + Number(r.overdue_amount || 0), 0),
        m3: active.filter((r) => Number(r.aging_months) >= 3).length,
    }
}

/**
 * 대장이 얼마나 낡았는지 — `'YYYY-MM'` 기준월과 오늘을 비교한다.
 *
 * 대장은 **월 스냅샷**이다. 한 달이 끝나야 그 달 자료가 나오므로, 8월에
 * 가장 최신이 7월인 것은 정상이다. 그보다 더 벌어지면 그때부터는 숫자가
 * 현재를 말하지 못한다 — 이미 갚은 곳이 아직 밀린 것처럼 보이고, 새로
 * 밀린 곳은 아예 안 보인다. **그런 숫자는 보여주지 않는 편이 낫다.**
 *
 * @returns {{ monthsBehind: number, stale: boolean }}
 *   `monthsBehind` 0이면 이번 달 자료, 1이면 지난달 자료(정상).
 *   `stale` 2개월 이상 벌어졌는가 — 갱신을 요청해야 하는 상태.
 */
export const ledgerAge = (baseMonth, now = new Date()) => {
    const m = /^(\d{4})-(\d{2})$/.exec(String(baseMonth || ''))
    if (!m) return { monthsBehind: Infinity, stale: true }
    const base = Number(m[1]) * 12 + (Number(m[2]) - 1)
    const cur = now.getFullYear() * 12 + now.getMonth()
    const monthsBehind = cur - base
    return { monthsBehind, stale: monthsBehind >= 2 }
}
