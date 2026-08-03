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

const warnedYears = new Set()

export const getHolidays = (year) => {
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
    return holidays
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
