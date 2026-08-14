/**
 * 문서번호 짓기 — 견적서(Q) · 발주서(PO) 공용
 *
 * 형식: `Q-20260814-01` / `PO-20260814-01`
 *
 * **화면에 든 목록을 세면 안 된다.** 예전에는 `list.filter(오늘).length + 1` 이었는데
 * 세 가지가 깨진다:
 *   1. 오늘 것을 하나 지우면 번호가 되돌아가 이미 있는 번호와 부딪힌다.
 *      (`quote_no`는 unique라 저장이 실패하고, 사용자는 이유를 알 수 없다)
 *   2. 두 사람이 같은 시각에 새로 만들면 둘 다 같은 번호를 받는다.
 *   3. 창을 열어 두고 한참 있다가 저장하면 그 사이에 생긴 번호와 부딪힌다.
 *
 * 그래서 **저장하기 직전에 DB를 보고** 짓는다. 그래도 동시에 눌리면 부딪힐 수
 * 있으므로, unique 위반이 나면 다시 지어 재시도한다. 마지막 방어는 DB의 unique
 * 제약이다 — 번호가 겹친 문서가 저장되는 일은 없다.
 */

/** 오늘 (로컬 기준). `toISOString()`은 UTC라 한국에서 하루 밀린다. */
export const todayLocal = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** `2026-08-14` → `20260814` */
export const dateKey = (date) => String(date || '').slice(0, 10).replace(/-/g, '')

/** `Q` + `2026-08-14` + `3` → `Q-20260814-03` */
export const formatDocNo = (prefix, date, seq) =>
    `${prefix}-${dateKey(date)}-${String(seq).padStart(2, '0')}`

/**
 * 그 날짜에 이미 있는 번호들 중 가장 큰 것 + 1.
 *
 * **개수가 아니라 최대값**을 쓴다. 개수로 하면 중간을 지웠을 때 번호가 되돌아간다.
 * 형식이 다른 번호(손으로 넣은 것 등)는 무시한다.
 */
export const nextDocSeq = (existingNos, prefix, date) => {
    const head = `${prefix}-${dateKey(date)}-`
    let max = 0
    for (const no of existingNos || []) {
        const s = String(no || '')
        if (!s.startsWith(head)) continue
        const n = parseInt(s.slice(head.length), 10)
        if (Number.isFinite(n) && n > max) max = n
    }
    return max + 1
}

/**
 * DB를 보고 다음 번호를 짓는다.
 *
 * 그 날짜 것만 like로 좁혀 읽는다 — 전체를 읽으면 문서가 쌓일수록 느려진다.
 */
export const issueDocNo = async (supabase, { table, column, prefix, date }) => {
    const head = `${prefix}-${dateKey(date)}-`
    const { data, error } = await supabase
        .from(table).select(column).like(column, `${head}%`)
    if (error) throw error
    return formatDocNo(prefix, date, nextDocSeq((data || []).map((r) => r[column]), prefix, date))
}

/** Postgres unique 위반 */
export const isDuplicateNo = (error) =>
    error?.code === '23505' || /duplicate key|already exists/i.test(error?.message || '')

/**
 * 번호를 새로 지어 저장한다. 부딪히면 다시 지어 재시도한다.
 *
 * `insert(no)`는 그 번호로 실제 저장을 시도하는 함수다. 성공하면 그 결과를 돌려준다.
 */
export const saveWithFreshNo = async (supabase, opts, insert, tries = 5) => {
    let last
    for (let i = 0; i < tries; i++) {
        const no = await issueDocNo(supabase, opts)
        try {
            return { no, result: await insert(no) }
        } catch (e) {
            if (!isDuplicateNo(e)) throw e
            last = e
        }
    }
    throw last
}
