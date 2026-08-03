/**
 * AI Revenue Forecast Logic Engine (v7.0)
 *
 * v6.1 -> v7.0 변경점:
 * - [신규] 'NewThisYear' 세그먼트: 올해 처음 거래한 고객이 잔여 기간 예측 0으로 누락되던 문제 해결.
 * - [수정] 진행 중인 달을 '확정 실적 + 잔여 영업일 예측'으로 조립. 기존에는 이번 달 실적이
 *         총액/차트에서 통째로 무시되어 '예측 총액 < 이미 확정된 매출'이 발생했다.
 * - [수정] 'New' 세그먼트의 12배 연환산에 3배 상한 적용 (기존 무제한).
 * - [수정] 'New' 판정에 이력 두께 조건 추가. 2년간 거래한 대형 고객이 'New'로 오분류되던 문제 해결.
 * - [수정] 세그먼트 분류와 예측 배수가 서로 다른 성장률(영업일 정규화 vs 원시)을 쓰던 불일치 해소.
 * - [수정] 월별 시즌성을 영업일 기준으로 재분배. 설날/추석 이동에 따른 월 편차를 반영한다.
 *         (예: 2026-02 영업일 17일 vs 2025-02 20일 -> 2월 비중 자동 하향)
 * - [수정] YTD 캘리브레이션 기준을 달력일 -> 영업일로 변경.
 * - [수정] 영업일 테이블을 고객 루프 밖에서 1회만 계산 (기존: 고객 수 x 24개월 재계산).
 * - [수정] incompleteFlag를 최상위로 노출해 UI가 데이터 부족을 알릴 수 있게 함.
 * - [정리] 흩어져 있던 임계값을 FORECAST_CONFIG로 통합.
 */

// 확장자를 명시해 Node에서도 그대로 import 가능하게 한다 (tests/revenueForecastEngine.test.mjs)
import { getBusinessDaysCount, hasHolidayData } from './koreanHolidays.js'

const sum = (arr) => arr.reduce((a, b) => a + b, 0)
const safeNum = (v, def = 0) => (isNaN(v) || !isFinite(v) ? def : v)

/** 예측 로직의 모든 임계값. 튜닝은 여기서만 한다. */
export const FORECAST_CONFIG = {
    // 이탈 판정
    CHURN_MIN_PEAK: 100000,        // 이 금액 이하의 과거 피크는 이탈 판정 대상 아님
    CHURN_RATIO: 0.3,              // 작년 실적이 피크의 30% 이하면 이탈
    CHURN_RESIDUAL_FLOOR: 100000,  // 작년 실적이 이 금액 이하면 0으로 처리

    // 신규 고객
    NEW_MAX_ACTIVE_MONTHS: 9,      // 최근 2년 활동 월수가 이보다 많으면 'New'가 아닌 기성 고객
    NEW_ANNUALIZE_CAP: 3.0,        // 연환산 시 작년(또는 YTD) 실적의 최대 배수

    // 고성장 신규
    HP_H2_MULTIPLIER: 1.5,         // 하반기 > 상반기 x 1.5
    HP_MIN_H2: 1000000,            // 하반기 최소 규모
    HP_MOMENTUM: 1.1,              // 모멘텀 가산
    HP_CAP: 3.0,                   // 작년 실적의 최대 배수

    // 기성 고객
    SEGMENT_THRESHOLD: 0.10,       // ±10%로 Growing / Stable / Declining 구분
    GROWTH_CAP: 0.3,               // 성장 반영 상한 +30%
    DECLINE_FLOOR: -0.2,           // 감소 반영 하한 -20%

    // 전체 캘리브레이션
    SCALE_MIN: 0.8,
    SCALE_MAX: 1.2,
    INCOMPLETE_MIN_TARGET: 10000000, // 모델 YTD가 이 금액 이상일 때만 미입력 판정
    INCOMPLETE_RATIO: 0.1,           // 실제 YTD가 모델 YTD의 10% 미만이면 데이터 미입력으로 간주
}

const C = FORECAST_CONFIG

/**
 * @param {Array} salesData - sale_date / total_amount / client_id 를 가진 매출 레코드
 * @param {number} currentYear - 예측 대상 연도
 * @param {Date} now - 기준 시점 (테스트 주입용)
 */
export const calculateRevenueForecast = (salesData, currentYear = new Date().getFullYear(), now = new Date()) => {
    // --- 1. Audit ---
    const audit = {
        totalRecords: salesData ? salesData.length : 0,
        prevYear: currentYear - 1,
        targetYear: currentYear,
        prevYearTotal: 0,
        currentYearYTD: 0
    }
    if (!audit.totalRecords) throw new Error('No data')

    const years = [currentYear - 3, currentYear - 2, currentYear - 1, currentYear]
    const yearPrev = currentYear - 1
    const yearPrior = currentYear - 2

    // --- 2. Aggregation ---
    const clientMap = {}
    const initClient = () => {
        const obj = {}
        years.forEach(y => obj[y] = Array(12).fill(0))
        return obj
    }

    salesData.forEach(s => {
        const d = new Date(s.sale_date || s.date)
        const y = d.getFullYear()
        const m = d.getMonth()
        const amt = Number(s.totalAmount || s.total_amount || 0)
        const cid = s.clientId || s.client_id || 'unknown'

        if (years.includes(y) && !isNaN(amt)) {
            if (!clientMap[cid]) clientMap[cid] = initClient()
            clientMap[cid][y][m] += amt

            if (y === yearPrev) audit.prevYearTotal += amt
            if (y === currentYear) audit.currentYearYTD += amt
        }
    })

    // --- 2b. 영업일 테이블 (고객과 무관한 상수 -> 루프 밖에서 1회만 계산) ---
    const bizDays = {}
    years.forEach(y => { bizDays[y] = Array.from({ length: 12 }, (_, m) => getBusinessDaysCount(y, m)) })
    const bizDaysPriorTotal = sum(bizDays[yearPrior]) || 1
    const bizDaysPrevTotal = sum(bizDays[yearPrev]) || 1
    const bizDaysTargetTotal = sum(bizDays[currentYear]) || 1

    // --- 2c. 기준 시점 계산 (영업일 기준) ---
    const nowYear = now.getFullYear()
    const yearAlreadyOver = nowYear > currentYear
    const yearNotStarted = nowYear < currentYear
    const currentMonthIndex = yearAlreadyOver ? 11 : (yearNotStarted ? 0 : now.getMonth())

    const bizDaysInCurrentMonth = bizDays[currentYear][currentMonthIndex] || 1
    const bizDaysElapsedInMonth = yearAlreadyOver
        ? bizDaysInCurrentMonth
        : (yearNotStarted ? 0 : getBusinessDaysCount(currentYear, currentMonthIndex, now.getDate()))
    const monthElapsedRatio = Math.min(1, bizDaysElapsedInMonth / bizDaysInCurrentMonth)

    let bizDaysYTD = 0
    for (let i = 0; i < currentMonthIndex; i++) bizDaysYTD += bizDays[currentYear][i]
    bizDaysYTD += bizDaysElapsedInMonth

    // --- 2d. 시즌성 헬퍼 ---
    // 작년 월별 실적을 '영업일당 매출'로 환산한 뒤 예측 연도의 영업일로 재분배한다.
    // 작년 월 구성비를 그대로 복사하면 설날/추석 이동분이 잘못된 달에 실린다.
    const flatSeasonality = Array(12).fill(1 / 12)
    const targetBizSeasonality = bizDays[currentYear].map(d => d / bizDaysTargetTotal)

    const buildSeasonality = (monthlyPrev, totalPrev) => {
        if (totalPrev <= 0) return targetBizSeasonality
        const reweighted = monthlyPrev.map((v, i) => (v / (bizDays[yearPrev][i] || 1)) * bizDays[currentYear][i])
        const total = sum(reweighted)
        if (total <= 0) return flatSeasonality
        return reweighted.map(v => v / total)
    }

    // --- 3. Segmentation & Forecast ---
    const segments = ['Growing', 'Stable', 'Declining', 'Churned', 'New', 'HighPotential', 'NewThisYear']
    const contribution = {}
    segments.forEach(s => {
        contribution[s] = {
            count: 0,
            revenuePrevYear: 0,
            forecastTargetYear: 0,
            ratio: 0
        }
    })

    const debugLists = {
        stoppedClients: [],
        highPotentialClients: [],
        newThisYearClients: []
    }

    const predictedMonthlyBase = Array(12).fill(0)

    Object.entries(clientMap).forEach(([cid, data]) => {
        const totalPrev3 = sum(data[currentYear - 3])
        const totalPrior = sum(data[yearPrior])
        const totalPrev = sum(data[yearPrev])
        const totalCurrentYTD = sum(data[currentYear])
        const monthlyPrev = data[yearPrev]

        let segment = 'Stable'
        let clientForecastMonthly = Array(12).fill(0)
        let ruleDescription = ''
        let establishedGrowthRate = 0

        const peakHistory = Math.max(totalPrev3, totalPrior)
        const activeMonthsPrev = monthlyPrev.filter(v => v > 0).length
        const activeMonthsPrior = data[yearPrior].filter(v => v > 0).length
        const hasHistory = totalPrev3 > 0 || totalPrior > 0 || totalPrev > 0

        // --- 분류 (판정 순서가 곧 우선순위) ---

        // 0. 올해 처음 거래를 시작한 고객 (과거 3년 실적 전무)
        if (!hasHistory && totalCurrentYTD > 0) {
            segment = 'NewThisYear'
        }
        // 1. 이탈 / 급감
        else if (peakHistory > C.CHURN_MIN_PEAK && totalPrev <= C.CHURN_RATIO * peakHistory) {
            segment = 'Churned'
            const type = totalPrev < C.CHURN_RESIDUAL_FLOOR ? 'Stopped' : 'Reduced'
            if (debugLists.stoppedClients.length < 20) {
                debugLists.stoppedClients.push({ cid, totalPrior, totalPrev, type, segment })
            }
        }
        // 2. 작년에 거래를 시작한 고객: 전년 대비 비교 대상이 없으므로 별도 규칙
        else if (totalPrev3 === 0 && totalPrior === 0 && totalPrev > 0) {
            const h1 = sum(monthlyPrev.slice(0, 6))
            const h2 = sum(monthlyPrev.slice(6, 12))

            // 하반기 급증은 활동 월수와 무관하게 잡아야 한다.
            // (1년 내내 거래하면서 하반기에 10배로 램프업하는 케이스가 전형적)
            if (h2 > h1 * C.HP_H2_MULTIPLIER && h2 > C.HP_MIN_H2) {
                segment = 'HighPotential'
                const growth = h1 > 0 ? (h2 / h1).toFixed(1) : 'New(H2)'
                if (debugLists.highPotentialClients.length < 20) {
                    debugLists.highPotentialClients.push({ cid, h1, h2, growth })
                }
            }
            // 이력이 얇으면 활동 월 평균으로 연환산
            else if (activeMonthsPrev <= C.NEW_MAX_ACTIVE_MONTHS) {
                segment = 'New'
            }
            // 작년 내내 꾸준히 거래했다면 이미 기성 고객으로 취급 (아래 else 블록과 동일 처리)
            else {
                establishedGrowthRate = C.GROWTH_CAP // 비교 기준연도 없음 -> 성장 상한
                segment = 'Growing'
            }
        }
        // 3. 재작년에 거래를 시작했고 아직 이력이 얇은 고객
        //    'totalPrev3 === 0' 만으로 판정하면 2년째 거래 중인 대형 고객도 New가 된다.
        else if (
            totalPrev3 === 0 &&
            totalPrior > 0 &&
            (activeMonthsPrev + activeMonthsPrior) <= C.NEW_MAX_ACTIVE_MONTHS
        ) {
            segment = 'New'
        }
        // 4. 기성 고객
        else {
            // 영업일 정규화 성장률(RPBD). 분류와 예측 배수 모두 이 값을 사용한다.
            const rpbdPrior = totalPrior / bizDaysPriorTotal
            const rpbdPrev = totalPrev / bizDaysPrevTotal

            if (rpbdPrior > 0) {
                establishedGrowthRate = (rpbdPrev - rpbdPrior) / rpbdPrior
            } else {
                // 재작년 실적이 없으면 비율이 무한대가 되므로 상한으로 취급
                establishedGrowthRate = rpbdPrev > 0 ? C.GROWTH_CAP : 0
            }

            if (establishedGrowthRate >= C.SEGMENT_THRESHOLD) segment = 'Growing'
            else if (establishedGrowthRate <= -C.SEGMENT_THRESHOLD) segment = 'Declining'
            else segment = 'Stable'
        }

        // --- 예측 계산 ---

        if (segment === 'NewThisYear') {
            // 올해 YTD 실적을 영업일 기준으로 연환산. 관측 기간이 짧을수록 과대 추정되므로 상한을 건다.
            const perBizDay = bizDaysYTD > 0 ? totalCurrentYTD / bizDaysYTD : 0
            let annual = perBizDay * bizDaysTargetTotal
            const cap = totalCurrentYTD * C.NEW_ANNUALIZE_CAP

            if (annual > cap) {
                annual = cap
                ruleDescription = `YTD RunRate (Capped ${C.NEW_ANNUALIZE_CAP}x)`
            } else {
                ruleDescription = 'YTD RunRate (BizDay)'
            }

            for (let i = 0; i < 12; i++) clientForecastMonthly[i] = safeNum(annual * targetBizSeasonality[i])

            if (debugLists.newThisYearClients.length < 20) {
                debugLists.newThisYearClients.push({
                    cid, ytd: totalCurrentYTD, annualized: Math.round(annual), rule: ruleDescription
                })
            }
        }
        else if (segment === 'Churned') {
            const residual = totalPrev > C.CHURN_RESIDUAL_FLOOR ? totalPrev : 0
            for (let i = 0; i < 12; i++) clientForecastMonthly[i] = safeNum(residual * targetBizSeasonality[i])
            ruleDescription = residual === 0 ? 'Zeroed (Stopped)' : 'Flat Residual (Reduced)'
        }
        else if (segment === 'HighPotential') {
            // 하반기 영업일당 매출을 연환산 + 모멘텀. 작년 총액의 3배로 캡.
            const h2Total = sum(monthlyPrev.slice(6, 12))
            const h2BizDays = sum(bizDays[yearPrev].slice(6, 12)) || 1
            let annual = (h2Total / h2BizDays) * bizDaysTargetTotal * C.HP_MOMENTUM

            const cap = totalPrev * C.HP_CAP
            if (annual > cap) {
                annual = cap
                ruleDescription = `H2 RunRate x${C.HP_MOMENTUM} (Capped ${C.HP_CAP}x)`
            } else {
                ruleDescription = `H2 RunRate x${C.HP_MOMENTUM}`
            }

            for (let i = 0; i < 12; i++) clientForecastMonthly[i] = safeNum(annual * targetBizSeasonality[i])
        }
        else if (segment === 'New') {
            // 활동 월 평균 x 12. 1~2개월만 거래한 고객이 12배로 부풀지 않도록 캡.
            const avg = activeMonthsPrev > 0 ? totalPrev / activeMonthsPrev : 0
            let annual = avg * 12
            const cap = totalPrev * C.NEW_ANNUALIZE_CAP

            if (annual > cap) {
                annual = cap
                ruleDescription = `Avg Active Months (Capped ${C.NEW_ANNUALIZE_CAP}x)`
            } else {
                ruleDescription = 'Avg Active Months'
            }

            for (let i = 0; i < 12; i++) clientForecastMonthly[i] = safeNum(annual * targetBizSeasonality[i])
        }
        else if (segment === 'Growing') {
            const applied = Math.min(establishedGrowthRate, C.GROWTH_CAP)
            const annual = totalPrev * (1 + applied)
            const seasonality = buildSeasonality(monthlyPrev, totalPrev)
            for (let i = 0; i < 12; i++) clientForecastMonthly[i] = safeNum(annual * seasonality[i])
            ruleDescription = `Growth ${(applied * 100).toFixed(0)}% (BizDay Normalized, Capped)`
        }
        else if (segment === 'Declining') {
            const applied = Math.max(establishedGrowthRate, C.DECLINE_FLOOR)
            const annual = totalPrev * (1 + applied)
            const seasonality = buildSeasonality(monthlyPrev, totalPrev)
            for (let i = 0; i < 12; i++) clientForecastMonthly[i] = safeNum(annual * seasonality[i])
            ruleDescription = `Decline ${(applied * 100).toFixed(0)}% (BizDay Normalized, Floored)`
        }
        else { // Stable
            const avg = (totalPrior + totalPrev) / 2
            const seasonality = buildSeasonality(monthlyPrev, totalPrev)
            for (let i = 0; i < 12; i++) clientForecastMonthly[i] = safeNum(avg * seasonality[i])
            ruleDescription = 'Avg of last 2 years'
        }

        // --- 집계 ---
        const cForecast = sum(clientForecastMonthly)

        contribution[segment].count++
        contribution[segment].revenuePrevYear += totalPrev
        contribution[segment].forecastTargetYear += cForecast

        const stoppedIdx = debugLists.stoppedClients.findIndex(c => c.cid === cid)
        if (stoppedIdx !== -1) {
            debugLists.stoppedClients[stoppedIdx].forecast = cForecast
            debugLists.stoppedClients[stoppedIdx].rule = ruleDescription
        }
        const hpIdx = debugLists.highPotentialClients.findIndex(c => c.cid === cid)
        if (hpIdx !== -1) {
            debugLists.highPotentialClients[hpIdx].forecast = cForecast
            debugLists.highPotentialClients[hpIdx].rule = ruleDescription
        }

        for (let i = 0; i < 12; i++) predictedMonthlyBase[i] += clientForecastMonthly[i]
    })

    Object.keys(contribution).forEach(k => {
        const item = contribution[k]
        item.ratio = item.revenuePrevYear > 0
            ? (item.forecastTargetYear / item.revenuePrevYear).toFixed(2)
            : 'N/A'
    })

    // --- 4. Calibration (YTD, 영업일 기준) ---
    let ytdTarget = 0
    for (let i = 0; i < currentMonthIndex; i++) ytdTarget += predictedMonthlyBase[i]
    ytdTarget += predictedMonthlyBase[currentMonthIndex] * monthElapsedRatio

    let rawScale = 1.0
    if (ytdTarget > 0 && audit.currentYearYTD > 0) {
        rawScale = audit.currentYearYTD / ytdTarget
    }

    let finalScale = safeNum(rawScale, 1.0)

    // 데이터 미입력 가드: 모델 대비 실제 YTD가 지나치게 낮으면 축소 보정을 걸지 않는다.
    let incompleteFlag = false
    if (ytdTarget > C.INCOMPLETE_MIN_TARGET && audit.currentYearYTD < (ytdTarget * C.INCOMPLETE_RATIO)) {
        finalScale = 1.0
        incompleteFlag = true
    } else {
        finalScale = Math.min(Math.max(finalScale, C.SCALE_MIN), C.SCALE_MAX)
    }

    // --- 5. 월별 데이터 조립 ---
    // 마감된 달 = 실적 확정 / 진행 중인 달 = 확정 실적 + 잔여 영업일 예측 / 미래 = 예측
    const actualByMonth = Array(12).fill(0)
    Object.values(clientMap).forEach(d => {
        for (let i = 0; i < 12; i++) actualByMonth[i] += d[currentYear][i]
    })

    const finalMonthlyData = []
    let totalForecastFinal = 0

    for (let i = 0; i < 12; i++) {
        const actual = actualByMonth[i]
        let val
        let isForecast

        if (i < currentMonthIndex) {
            val = actual
            isForecast = false
        } else if (i === currentMonthIndex) {
            const remaining = predictedMonthlyBase[i] * finalScale * (1 - monthElapsedRatio)
            val = actual + remaining
            isForecast = true
        } else {
            val = predictedMonthlyBase[i] * finalScale
            isForecast = true
        }

        const safeVal = Math.round(safeNum(val))
        finalMonthlyData.push({ month: i + 1, actual, forecast: safeVal, isForecast })
        totalForecastFinal += safeVal
    }

    const growthRate = audit.prevYearTotal > 0
        ? ((totalForecastFinal - audit.prevYearTotal) / audit.prevYearTotal * 100).toFixed(1)
        : '0.0'

    // --- 6. 요약 ---
    const toEok = (v) => (v / 100000000).toFixed(1)
    let analysis_summary = `분석된 고객사 ${Object.keys(clientMap).length}개. '${String(yearPrev).slice(2)}년 실적: ${toEok(audit.prevYearTotal)}억. 예측: ${toEok(totalForecastFinal)}억. 성장 잠재력 고객: ${contribution.HighPotential.count}개, 올해 신규: ${contribution.NewThisYear.count}개.`
    if (incompleteFlag) {
        analysis_summary = `⚠️ ${currentYear}년 매출 입력이 거의 없어 YTD 보정을 건너뛰었습니다. ` + analysis_summary
    }

    return {
        forecastYear: currentYear,
        total_amount: totalForecastFinal,
        monthlyData: finalMonthlyData,
        growth_rate: growthRate,
        analysis_summary,
        calculatedAt: new Date().toISOString(),
        // UI가 데이터 신뢰도를 표시할 수 있도록 최상위로 노출
        incompleteFlag,
        holidayDataMissing: !hasHolidayData(currentYear),
        debug: {
            audit,
            contribution,
            stoppedClients: debugLists.stoppedClients,
            highPotentialClients: debugLists.highPotentialClients,
            newThisYearClients: debugLists.newThisYearClients,
            rawScale,
            clampedScale: finalScale,
            incompleteFlag,
            monthElapsedRatio,
            bizDaysYTD
        }
    }
}
