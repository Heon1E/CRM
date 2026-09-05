import { getHolidays } from './koreanHolidays.js'
import { ymd } from './day.js'

/**
 * 다음 영업일 — 주말과 공휴일을 건너뛴다.
 *
 * **'하루 미루기'가 일요일로 가면 안 된다.** 토요일에 눌러 하루를 더하면
 * 일요일이 되어 아무 일도 할 수 없는 날이 기한이 된다. 실제로 그렇게 짰다가
 * 2026-09-05(토)에 눌러 9/6(일)이 나오는 것을 보고 고쳤다.
 *
 * **`getHolidays()`는 `{date, name}` 객체 배열이다.** 문자열로 비교하면
 * (`.includes(iso)`) 하나도 안 걸려 공휴일이 영업일이 된다 — 서버 쪽에서
 * 그렇게 짰다가 광복절 대체공휴일(2026-08-17)과 성탄절을 그대로 통과시켰다.
 *
 * 서버(`api/telegram-webhook.js`)도 같은 계산을 한다. 두 곳의 결과가 갈리면
 * 봇이 잡아 준 기한과 화면에서 미룬 기한이 서로 다른 날이 된다.
 *
 * @param {string} from  'YYYY-MM-DD'
 * @param {number} days  건너뛸 영업일 수 (기본 1)
 * @returns {string|null} 'YYYY-MM-DD', 못 세면 null
 */
export const nextBusinessDay = (from, days = 1) => {
    const head = String(from ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(head)) return null

    // 로컬 자정으로 읽는다 — `new Date('2026-09-05')`는 UTC라 한국에서 하루 밀린다
    const d = new Date(`${head}T00:00:00`)
    if (Number.isNaN(d.getTime())) return null

    let left = Math.max(1, Math.floor(days))
    // 연휴가 길어도 2주면 반드시 영업일이 나온다
    for (let i = 0; i < 30 && left > 0; i++) {
        d.setDate(d.getDate() + 1)
        const dow = d.getDay()
        if (dow === 0 || dow === 6) continue
        const iso = ymd(d)
        if (getHolidays(d.getFullYear()).some((h) => h.date === iso)) continue
        left -= 1
    }
    return left === 0 ? ymd(d) : null
}
