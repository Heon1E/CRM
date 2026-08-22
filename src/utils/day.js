/**
 * 날짜를 'YYYY-MM-DD'로 — **로컬 기준이다.**
 *
 * `toISOString()`을 쓰면 안 된다. 그것은 UTC라 한국(UTC+9)에서는
 * **00:00~08:59 사이에 하루 전 날짜가 나온다.** 하필 영업사원이 어제 방문을
 * 기록하고 오전 주문을 넣는 시간대다.
 *
 * 실제로 이렇게 새고 있었다:
 * - 매출 추가·활동 추가의 기본 날짜 -> 아침에 넣으면 어제로 저장된다.
 *   활동은 `(client_id, activity_date)`로 중복을 거르므로 판정까지 어긋난다.
 * - 견적서 유효기간 -> `2026-08-22 + 30일`이 **2026-09-20**으로 인쇄됐다.
 *   고객에게 나가는 문서에서 하루가 짧았다.
 *
 * 서버(`api/`)는 UTC로 도므로 여기 것을 쓰지 않는다. 그쪽은 `kstToday()`가
 * 따로 있다 — 브라우저는 이미 한국 시간이고, 서버는 아니기 때문이다.
 */
export const ymd = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 오늘 (로컬 기준 'YYYY-MM-DD') */
export const todayYmd = () => ymd(new Date())

/**
 * 'YYYY-MM-DD' 문자열에 며칠을 더한다. **로컬 자정으로 읽고 로컬로 돌려준다.**
 * `new Date('2026-08-22')`는 UTC 자정으로 해석되므로 그대로 쓰면 안 된다.
 */
export const addDays = (dateStr, days) => {
    /*
     * **형식을 먼저 확인한다.** `new Date('2026T00:00:00')`은 오류가 아니라
     * 2026-01-01로 해석된다(V8). 그러면 엉뚱한 날짜가 조용히 나가서, 빈 값보다
     * 나쁘다 — 견적서에 그럴듯한 유효기간이 찍히는데 근거가 없다.
     */
    const head = String(dateStr ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(head)) return ''
    const d = new Date(`${head}T00:00:00`)
    if (Number.isNaN(d.getTime())) return ''
    d.setDate(d.getDate() + Number(days || 0))
    return ymd(d)
}
