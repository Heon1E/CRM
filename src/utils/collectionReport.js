/**
 * 「영업사원 거래처별 매출/수금 실적표」 판독 결과 검산 (순수 함수)
 *
 * ERP가 내는 6쪽짜리 표다. 거래처 하나가 **네 줄**이고 열은 1~12월 + 합계다:
 *
 *   거래처명   이월 |      |          | ...
 *   (코드)     매출 | 5,368,000 | ...
 *   (전화)     수금 | 2,684,000 | ...
 *              잔액 | 5,368,000 | ...
 *
 * 엑셀 대장(`receivablesLedger.js`)과 **같은 종류의 자료**라 경과월 계산을
 * 그대로 재사용한다 — 계산이 둘로 갈리면 어느 쪽을 믿어야 할지 알 수 없다.
 *
 * ## 이 표는 스스로를 검산한다
 *
 * 사진 판독은 반드시 틀린다. 실제로 15줄에서 이름 넷이 틀렸다
 * (`수산머티리얼즈`→`수산아타리얼즈`, `현대드럼산업`→`창원드럼산업`,
 * `강원드림상사`→`강원드럼상사`, `안산상사(김현욱)`→`일신상사(김천북)`),
 * 금액도 잔액 대신 매출을 집어 온 것이 있었다.
 *
 * 그런데 이 표에는 **틀리면 드러나는 관계가 셋** 있다:
 *
 *   1. 달마다  `이월 + 매출 − 수금 = 잔액`
 *   2. 달 사이 `다음 달 이월 = 이번 달 잔액`
 *   3. 맨 아래 `잔액 합계` = 거래처별 기준월 잔액의 합
 *
 * 그래서 **어느 거래처 어느 달이 틀렸는지 짚어낼 수 있다.** 검산을 통과하지
 * 못한 판독은 저장하지 않는다 — 이 숫자로 수금 독촉 전화를 걸기 때문이다.
 */

import { agingOf } from './receivablesLedger.js'

/** '1,234,000' / '-1,729,200' / '' -> 숫자. 빈칸은 0이다(표에서 0은 비워 둔다). */
export const num = (v) => {
    if (v == null || v === '') return 0
    const s = String(v).replace(/[^0-9.-]/g, '')
    if (!s || s === '-') return 0
    const n = Number(s)
    return Number.isFinite(n) ? n : 0
}

export const monthKey = (year, m) => `${year}-${String(m).padStart(2, '0')}`

/** 1~12월 키 */
export const monthKeys = (year) => Array.from({ length: 12 }, (_, i) => monthKey(year, i + 1))

/**
 * 한 거래처를 다듬는다.
 * `months`는 `{ "1": {carried, sales, collected, balance}, ... }` 또는
 * `{ "2026-01": {...} }` 둘 다 받는다 — 모델이 어느 쪽으로 줄지 모른다.
 */
export const normalizeClient = (raw, year) => {
    const months = {}
    const src = raw?.months || {}
    for (let m = 1; m <= 12; m++) {
        const cell = src[String(m)] ?? src[m] ?? src[monthKey(year, m)] ?? {}
        months[monthKey(year, m)] = {
            carried: num(cell.carried ?? cell['이월']),
            sales: num(cell.sales ?? cell['매출']),
            collected: num(cell.collected ?? cell['수금']),
            balance: num(cell.balance ?? cell['잔액']),
        }
    }
    return {
        clientName: String(raw?.clientName ?? raw?.name ?? '').trim(),
        code: String(raw?.code ?? '').trim(),
        phone: String(raw?.phone ?? '').trim(),
        months,
    }
}

/**
 * 기준월 = **매출이나 수금이 실제로 있었던 마지막 달.**
 *
 * 잔액이 채워진 마지막 달을 쓰면 안 된다 — 이 표는 12월까지 열이 있고
 * 활동이 없는 뒷달에도 **이월과 잔액이 그대로 딸려 온다**(9~12월이 전부
 * 같은 값이다). 그걸 기준월로 잡으면 있지도 않은 달의 대장이 만들어진다.
 */
export const findBaseMonth = (clients, year) => {
    const keys = monthKeys(year)
    let base = null
    for (const k of keys) {
        const moved = clients.some((c) => c.months[k] && (c.months[k].sales !== 0 || c.months[k].collected !== 0))
        if (moved) base = k
    }
    return base
}

/**
 * 검산. 통과하지 못한 것만 돌려준다.
 *
 * @param {number} tolerance 원 단위 허용 오차. 표에 반올림이 없으므로 기본 0이다.
 */
export const verifyReport = ({ clients, year, repTotal = null, tolerance = 0 }) => {
    const keys = monthKeys(year)
    const baseMonth = findBaseMonth(clients, year)
    const problems = []

    clients.forEach((c) => {
        keys.forEach((k, i) => {
            const cur = c.months[k]
            if (!cur) return
            const empty = !cur.carried && !cur.sales && !cur.collected && !cur.balance
            if (empty) return

            // 1) 이월 + 매출 − 수금 = 잔액
            const expected = cur.carried + cur.sales - cur.collected
            if (Math.abs(expected - cur.balance) > tolerance) {
                problems.push({
                    kind: 'identity', clientName: c.clientName, month: k,
                    message: `이월 ${cur.carried.toLocaleString()} + 매출 ${cur.sales.toLocaleString()}`
                        + ` − 수금 ${cur.collected.toLocaleString()} = ${expected.toLocaleString()} 인데`
                        + ` 잔액이 ${cur.balance.toLocaleString()} 으로 읽혔습니다.`,
                })
            }

            // 2) 다음 달 이월 = 이번 달 잔액
            const next = c.months[keys[i + 1]]
            if (next && Math.abs(next.carried - cur.balance) > tolerance) {
                // 뒷달이 통째로 비어 있으면(거래 종료) 이월도 비는 것이 정상이다
                const nextEmpty = !next.carried && !next.sales && !next.collected && !next.balance
                if (!nextEmpty) {
                    problems.push({
                        kind: 'chain', clientName: c.clientName, month: keys[i + 1],
                        message: `${k} 잔액 ${cur.balance.toLocaleString()} 이`
                            + ` ${keys[i + 1]} 이월 ${next.carried.toLocaleString()} 과 다릅니다.`,
                    })
                }
            }
        })
    })

    // 3) 잔액 합계
    let totals = null
    if (baseMonth) {
        const sum = clients.reduce((a, c) => a + (c.months[baseMonth]?.balance || 0), 0)
        totals = { baseMonth, balanceSum: sum, reported: null, diff: null }
        const reported = repTotal == null ? null : num(repTotal.balance ?? repTotal['잔액'])
        if (reported != null && repTotal != null) {
            totals.reported = reported
            totals.diff = sum - reported
            if (Math.abs(totals.diff) > tolerance) {
                problems.push({
                    kind: 'total', clientName: null, month: baseMonth,
                    message: `거래처별 ${baseMonth} 잔액 합이 ${sum.toLocaleString()} 인데`
                        + ` 표의 잔액 합계는 ${reported.toLocaleString()} 입니다`
                        + ` (${(sum - reported).toLocaleString()} 차이).`,
                })
            }
        }
    }

    return { baseMonth, problems, totals, ok: problems.length === 0 }
}

/**
 * 경과월·연체금액을 낸다. **계산은 `receivablesLedger.agingOf` 그대로 쓴다.**
 *
 * 그쪽이 엑셀의 납작한 행을 받으므로, 여기서 같은 모양(`cells` + `monthCols`)을
 * 지어 넘긴다. 규칙을 옮겨 적으면 두 벌이 되고, 두 벌은 반드시 갈린다.
 */
export const summarizeClients = ({ clients, year, baseMonth }) => {
    const keys = monthKeys(year)
    const monthsUpto = keys.filter((m) => m <= baseMonth)

    const monthCols = {}
    keys.forEach((k, i) => { monthCols[k] = { 매출: i * 3, 수금: i * 3 + 1, 잔액: i * 3 + 2 } })

    return clients.map((c) => {
        const cells = []
        keys.forEach((k, i) => {
            cells[i * 3] = c.months[k]?.sales ?? 0
            cells[i * 3 + 1] = c.months[k]?.collected ?? 0
            cells[i * 3 + 2] = c.months[k]?.balance ?? 0
        })
        return {
            name: c.clientName,
            code: c.code,
            phone: c.phone,
            delay: '',
            ...agingOf({ cells, monthCols, monthsUpto, baseMonth }),
        }
    })
}
