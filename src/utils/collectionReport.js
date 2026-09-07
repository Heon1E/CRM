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
 * 한 거래처를 다듬는다. 세 가지 모양을 다 받는다:
 *
 *   1. `{ carried: "n,n,…12개", sales: "…", collected: "…", balance: "…" }`  ← 지금 쓰는 것
 *   2. `{ carried: [12], … }`  (배열이어도 받는다)
 *   3. `{ months: { "1": {carried,…}, … } }` / `{ months: { "2026-01": {…} } }`
 *
 * **1번(쉼표로 이은 12개)을 쓰는 이유가 둘 있다.**
 *
 * - 달을 키로 받으면 모델이 **빈칸을 통째로 빼먹는다.** 그러면 뒤의 값이
 *   앞으로 당겨져 다른 달의 값이 된다 — 실측에서 7월 수금 칸에 8월 수금이
 *   들어왔다(7월이 빈칸이었다). 자리 수가 정해져 있으면 밀리면 드러난다.
 * - 배열로 받았더니 이번에는 **구조가 깨졌다.** 거래처 하나를 닫는 `}`를
 *   빠뜨려 `] , {` 가 되면서 JSON 전체를 못 읽었다. 괄호가 적을수록 안전하고,
 *   출력도 짧아진다(6쪽짜리라 길이도 문제다).
 */
export const normalizeClient = (raw, year) => {
    const months = {}
    const src = raw?.months || {}
    const toArr = (v) => {
        if (Array.isArray(v)) return v
        if (typeof v === 'string' && v.includes(',')) return v.split(',')
        return null
    }
    const arr = (k, ko) => toArr(raw?.[k]) ?? toArr(raw?.[ko])
    const A = { carried: arr('carried', '이월'), sales: arr('sales', '매출'), collected: arr('collected', '수금'), balance: arr('balance', '잔액') }

    for (let m = 1; m <= 12; m++) {
        const cell = src[String(m)] ?? src[m] ?? src[monthKey(year, m)] ?? {}
        const pick = (k, ko) => (A[k] ? num(A[k][m - 1]) : num(cell[k] ?? cell[ko]))
        months[monthKey(year, m)] = {
            carried: pick('carried', '이월'),
            sales: pick('sales', '매출'),
            collected: pick('collected', '수금'),
            balance: pick('balance', '잔액'),
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
export const verifyReport = ({ clients, year, repTotal = null, tolerance = 0, now = new Date() }) => {
    const keys = monthKeys(year)
    const baseMonth = findBaseMonth(clients, year)
    const problems = []

    /*
     * **아직 오지 않은 달이 기준월로 잡히면 판독이 밀린 것이다.**
     * 실측에서 그랬다 — 7월 수금이 빈칸이라 8월 값이 당겨지면서 뒤가 줄줄이
     * 밀렸고 기준월이 2026-12로 잡혔다. 그런데 **잔액 합계 대조는 통과했다**
     * (잔액은 이월로 계속 딸려오니까). 합계만 믿으면 안 되는 이유다.
     */
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    if (baseMonth && baseMonth > thisMonth) {
        problems.push({
            kind: 'future', clientName: null, month: baseMonth,
            message: `기준월이 ${baseMonth}로 잡혔습니다 — 아직 오지 않은 달입니다.`
                + ` 빈칸을 건너뛰어 값이 한 칸씩 밀렸을 수 있습니다.`,
        })
    }

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
 * 틀린 칸을 **표의 계산으로 되찾는다.**
 *
 * 이 표는 같은 값이 여러 자리에 겹쳐 적혀 있다. 그래서 한 칸을 잘못 읽어도
 * 나머지가 그 값을 가리킨다 — 지어내는 것이 아니라 **표가 이미 갖고 있는
 * 답을 꺼내는 것**이다.
 *
 * 실제로 있었던 오독이 이 경우다 — (주)이한산업 8월 잔액 53,512,800 을
 * 그 달 매출 21,546,800 으로 집어 왔다. 항등식(이월+매출−수금)도,
 * 9월 이월도 똑같이 53,512,800 을 가리킨다.
 *
 * **자동으로 고치지 않는다.** 후보만 돌려주고 사람이 누른다 — 이 숫자로
 * 수금 독촉 전화를 걸기 때문이다.
 *
 * @returns {Array<{field, value, basis, confidence}>} 확신이 큰 것부터
 */
export const suggestFix = ({ client, month, year }) => {
    const keys = monthKeys(year)
    const i = keys.indexOf(month)
    if (i < 0) return []
    const cur = client.months[month]
    if (!cur) return []

    const prev = i > 0 ? client.months[keys[i - 1]] : null
    const next = i < 11 ? client.months[keys[i + 1]] : null
    const byIdentity = cur.carried + cur.sales - cur.collected
    const out = []

    /*
     * **잔액이 옆 달과 이어져 있으면 잔액은 맞다.** 그때 틀린 것은 수금(또는
     * 매출)이다. 실측에서 그랬다 — 7월 수금이 빈칸인데 모델이 8월 수금을
     * 당겨 와서, 항등식만 보면 "잔액을 0으로 고쳐라"가 되지만 그건 정반대다.
     * 다음 달 이월이 이번 달 잔액과 같으면 잔액 고치기를 **권하지 않는다.**
     */
    const balanceCorroborated = next && next.carried === cur.balance && cur.balance !== 0

    if (byIdentity !== cur.balance && !balanceCorroborated) {
        const nextAgrees = next && next.carried === byIdentity
        out.push({
            field: 'balance', value: byIdentity,
            basis: nextAgrees
                ? `이월+매출−수금 과 다음 달 이월이 모두 ${byIdentity.toLocaleString()} 을 가리킵니다`
                : `이월 ${cur.carried.toLocaleString()} + 매출 ${cur.sales.toLocaleString()} − 수금 ${cur.collected.toLocaleString()}`,
            confidence: nextAgrees ? 'high' : 'medium',
        })
    }

    // 이월이 틀린 경우 — 전달 잔액이 답이다
    if (prev && prev.carried + prev.sales - prev.collected === prev.balance && cur.carried !== prev.balance) {
        const fixesIdentity = prev.balance + cur.sales - cur.collected === cur.balance
        out.push({
            field: 'carried', value: prev.balance,
            basis: fixesIdentity
                ? `전달 잔액 ${prev.balance.toLocaleString()} 을 넣으면 이 달 항등식도 맞습니다`
                : `전달 잔액이 ${prev.balance.toLocaleString()} 입니다`,
            confidence: fixesIdentity ? 'high' : 'medium',
        })
    }

    /*
     * 수금이 틀린 경우 — 이월·매출·잔액이 성하면 수금이 하나로 정해진다.
     *
     * **잔액이 다음 달 이월과 이어져 있고 이월도 전달 잔액과 맞으면**, 남은
     * 후보는 매출 아니면 수금뿐이다. 이 표에서 빈칸을 건너뛰어 밀리는 것은
     * 거의 수금 줄이므로(실측) 그때는 확실한 쪽으로 올린다.
     */
    const bySubtract = cur.carried + cur.sales - cur.balance
    if (byIdentity !== cur.balance && bySubtract !== cur.collected && bySubtract >= 0) {
        const carriedCorroborated = !prev || prev.balance === cur.carried
        const strong = balanceCorroborated && carriedCorroborated
        out.push({
            field: 'collected', value: bySubtract,
            basis: strong
                ? `잔액과 이월이 옆 달과 이어지므로 수금만 남습니다 — 이월+매출−잔액 = ${bySubtract.toLocaleString()}`
                : `이월+매출−잔액 = ${bySubtract.toLocaleString()}`,
            confidence: strong ? 'high' : 'low',
        })
    }

    const rank = { high: 0, medium: 1, low: 2 }
    return out.sort((a, b) => rank[a.confidence] - rank[b.confidence])
}

/**
 * 판독된 거래처명이 CRM에 있는 곳인지 본다.
 *
 * **검산으로는 이름 오독을 못 잡는다** — 숫자가 맞으면 항등식은 통과한다.
 * 실제로 넷이 틀렸다(`수산머티리얼즈`→`수산아타리얼즈` 등). 이름이 틀리면
 * 다른 회사의 채권으로 저장되거나 새 거래처가 만들어진다.
 *
 * @param {(name:string)=>object|undefined} lookup 이름으로 거래처를 찾는 함수
 * @param {string[]} allNames 대조용 거래처명 전체
 */
export const checkNames = ({ clients, lookup, allNames = [] }) => {
    const unmatched = []
    clients.forEach((c) => {
        if (!c.clientName) return
        if (lookup(c.clientName)) return
        unmatched.push({ clientName: c.clientName, suggestions: closestNames(c.clientName, allNames) })
    })
    return unmatched
}

/**
 * 글자가 얼마나 겹치는지로 비슷한 이름을 고른다 (오독은 한두 글자만 어긋난다).
 *
 * **회사를 가리키는 말을 먼저 걷어낸다.** `주식회사 수산머티리얼즈` 와
 * `수산아타리얼즈` 는 실제로 같은 곳인데, '주식회사'를 그대로 두면 겹치는
 * 비율이 0.3까지 떨어져 후보에서 빠진다.
 */
const corpStripped = (s) => String(s)
    .replace(/주식회사|유한회사|합자회사|합명회사|\(주\)|\(유\)|㈜/g, '')
    .replace(/[\s()[\]{}\-_.·]/g, '')

export const closestNames = (name, allNames, limit = 3) => {
    const a = corpStripped(name)
    if (a.length < 2) return []
    const bigrams = (s) => { const out = []; for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2)); return out }
    const A = bigrams(a)
    if (!A.length) return []
    return allNames
        .map((n) => {
            const b = corpStripped(n)
            const B = new Set(bigrams(b))
            const hit = A.filter((g) => B.has(g)).length
            return { name: n, score: hit / Math.max(A.length, B.size || 1) }
        })
        .filter((x) => x.score >= 0.4)
        .sort((x, y) => y.score - x.score)
        .slice(0, limit)
        .map((x) => x.name)
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
