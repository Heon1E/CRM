export const HOLIDAYS_BY_YEAR = {
    2023: [
        { date: '2023-01-01', name: '신정' },
        { date: '2023-01-21', name: '설날 연휴' },
        { date: '2023-01-22', name: '설날' },
        { date: '2023-01-23', name: '설날 연휴' },
        { date: '2023-01-24', name: '대체공휴일' },
        { date: '2023-03-01', name: '삼일절' },
        { date: '2023-05-05', name: '어린이날' },
        { date: '2023-05-27', name: '부처님오신날' },
        { date: '2023-05-29', name: '대체공휴일' },
        { date: '2023-06-06', name: '현충일' },
        { date: '2023-08-15', name: '광복절' },
        { date: '2023-09-28', name: '추석 연휴' },
        { date: '2023-09-29', name: '추석' },
        { date: '2023-09-30', name: '추석 연휴' },
        { date: '2023-10-03', name: '개천절' },
        { date: '2023-10-09', name: '한글날' },
        { date: '2023-12-25', name: '크리스마스' },
    ],
    2024: [
        { date: '2024-01-01', name: '신정' },
        { date: '2024-02-09', name: '설날 연휴' },
        { date: '2024-02-10', name: '설날' },
        { date: '2024-02-11', name: '설날 연휴' },
        { date: '2024-02-12', name: '대체공휴일' },
        { date: '2024-03-01', name: '삼일절' },
        { date: '2024-04-10', name: '국회의원 선거' },
        { date: '2024-05-05', name: '어린이날' },
        { date: '2024-05-06', name: '대체공휴일' },
        { date: '2024-05-15', name: '부처님오신날' },
        { date: '2024-06-06', name: '현충일' },
        { date: '2024-08-15', name: '광복절' },
        { date: '2024-09-16', name: '추석 연휴' },
        { date: '2024-09-17', name: '추석' },
        { date: '2024-09-18', name: '추석 연휴' },
        { date: '2024-10-03', name: '개천절' },
        { date: '2024-10-09', name: '한글날' },
        { date: '2024-12-25', name: '크리스마스' },
    ],
    2025: [
        { date: '2025-01-01', name: '신정' },
        { date: '2025-01-28', name: '설날 연휴' },
        { date: '2025-01-29', name: '설날' },
        { date: '2025-01-30', name: '설날 연휴' },
        { date: '2025-03-01', name: '삼일절' },
        { date: '2025-03-03', name: '대체공휴일' },
        { date: '2025-05-05', name: '어린이날/부처님오신날' },
        { date: '2025-05-06', name: '대체공휴일' },
        { date: '2025-06-06', name: '현충일' },
        { date: '2025-08-15', name: '광복절' },
        { date: '2025-10-03', name: '개천절' },
        { date: '2025-10-05', name: '추석 연휴' },
        { date: '2025-10-06', name: '추석' },
        { date: '2025-10-07', name: '추석 연휴' },
        { date: '2025-10-08', name: '대체공휴일' },
        { date: '2025-10-09', name: '한글날' },
        { date: '2025-12-25', name: '크리스마스' },
    ],
    2026: [
        { date: '2026-01-01', name: '신정' },
        { date: '2026-02-16', name: '설날 연휴' },
        { date: '2026-02-17', name: '설날' },
        { date: '2026-02-18', name: '설날 연휴' },
        { date: '2026-03-01', name: '삼일절' },
        { date: '2026-03-02', name: '대체공휴일' },
        { date: '2026-05-05', name: '어린이날' },
        { date: '2026-05-24', name: '부처님오신날' },
        { date: '2026-05-25', name: '대체공휴일' },
        { date: '2026-06-03', name: '지방선거' },
        { date: '2026-06-06', name: '현충일' },
        { date: '2026-08-15', name: '광복절' },
        { date: '2026-09-24', name: '추석 연휴' },
        { date: '2026-09-25', name: '추석' },
        { date: '2026-09-26', name: '추석 연휴' },
        { date: '2026-10-03', name: '개천절' },
        { date: '2026-10-05', name: '대체공휴일' },
        { date: '2026-10-09', name: '한글날' },
        { date: '2026-12-25', name: '크리스마스' },
    ]
}

// ---------------------------------------------------------------------------
// 대체공휴일 자동 보정
//
// 손으로 적다 보면 빠진다. 실제로 2026-08-17(광복절이 토요일이라 생기는 대체공휴일)이
// 누락돼 있었다. 규칙으로 계산할 수 있는 것은 계산해서 채운다.
//
// 관공서의 공휴일에 관한 규정 제3조:
//   - 삼일절·광복절·개천절·한글날·부처님오신날·성탄절이 토요일 또는 일요일과 겹치면 대체
//   - 어린이날은 토·일 또는 다른 공휴일과 겹치면 대체
//   - 설날·추석 연휴는 **다른 공휴일(일요일 포함)과 겹칠 때만** 대체 (토요일은 대상 아님)
//   - 현충일은 대체 대상이 아니다
// 대체일은 그 뒤 첫 번째 '공휴일이 아닌 평일'이다.
//
// 설날·추석·부처님오신날은 음력이라 날짜 자체는 여전히 손으로 넣어야 한다.
// ---------------------------------------------------------------------------
const SUBSTITUTE_ELIGIBLE = ['삼일절', '광복절', '개천절', '한글날', '부처님오신날', '크리스마스', '어린이날']

const ymdOf = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
const parseUTC = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }

/** 규칙으로 만들어낼 수 있는 대체공휴일을 채워 넣는다 (이미 있으면 그대로 둔다) */
export const withSubstituteHolidays = (list) => {
    const dates = new Set(list.map((h) => h.date))
    // 이미 적힌 '대체공휴일'은 법정공휴일 목록에서 뺀다 (건너뛰기 대상이 아니다)
    const statutory = new Set(list.filter((h) => h.name !== '대체공휴일').map((h) => h.date))
    const added = []

    list.forEach((h) => {
        if (!SUBSTITUTE_ELIGIBLE.includes(h.name)) return
        const d = parseUTC(h.date)
        const dow = d.getUTCDay()
        if (dow !== 0 && dow !== 6) return   // 평일이면 대체 없음

        // 대체일 = 그 뒤 첫 번째 평일. 단, 다른 법정공휴일이 놓인 날은 건너뛴다.
        // (이미 적혀 있는 '대체공휴일'은 건너뛰면 안 된다 — 그게 바로 우리가 찾는 그 날이다.
        //  건너뛰면 3/1(일)에 3/2가 이미 있는데도 3/3을 또 만들어 낸다.)
        const next = new Date(d)
        for (let i = 0; i < 10; i++) {
            next.setUTCDate(next.getUTCDate() + 1)
            const nd = next.getUTCDay()
            if (nd === 0 || nd === 6) continue
            if (statutory.has(ymdOf(next))) continue

            const key = ymdOf(next)
            if (dates.has(key)) return          // 이미 등록돼 있다
            dates.add(key)
            added.push({ date: key, name: '대체공휴일', substituteFor: h.name })
            return
        }
    })

    return [...list, ...added].sort((a, b) => a.date.localeCompare(b.date))
}

const warnedYears = new Set()
const resolvedCache = new Map()

export const getHolidays = (year) => {
    if (resolvedCache.has(year)) return resolvedCache.get(year)
    const holidays = HOLIDAYS_BY_YEAR[year]
    if (!holidays) {
        // 공휴일 데이터가 없는 연도는 주말만 제외되어 영업일이 과대 계산된다.
        // 조용히 틀리지 않도록 연도당 한 번 경고한다. (HOLIDAYS_BY_YEAR 갱신 필요)
        if (!warnedYears.has(year)) {
            warnedYears.add(year)
            console.warn(`[koreanHolidays] ${year}년 공휴일 데이터가 없습니다. 영업일 계산이 부정확해집니다. HOLIDAYS_BY_YEAR를 갱신하세요.`)
        }
        return []
    }
    const resolved = withSubstituteHolidays(holidays)
    resolvedCache.set(year, resolved)
    return resolved
}

/** 해당 연도의 공휴일 데이터가 등록되어 있는지 여부 */
export const hasHolidayData = (year) => Boolean(HOLIDAYS_BY_YEAR[year])

/**
 * Calculates number of business days in a given month.
 * Subtracts Saturdays, Sundays, and Holidays.
 * @param {number} year - YYYY
 * @param {number} month - 0-indexed (0 = Jan, 11 = Dec)
 * @param {number} [untilDay] - 이 날짜(포함)까지만 계산. 생략 시 월 전체.
 */
export const getBusinessDaysCount = (year, month, untilDay) => {
    const end = new Date(year, month + 1, 0)
    const lastDay = end.getDate()
    const limit = untilDay == null ? lastDay : Math.max(0, Math.min(untilDay, lastDay))

    const holidays = getHolidays(year).map(h => h.date)
    let count = 0

    for (let d = 1; d <= limit; d++) {
        const date = new Date(year, month, d)
        const dayOfWeek = date.getDay()
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

        // 0=Sun, 6=Sat
        if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidays.includes(dateString)) {
            count++
        }
    }
    return count
}
