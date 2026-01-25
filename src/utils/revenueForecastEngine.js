/**
 * AI Revenue Forecast Logic Engine (v5.4 - Bulletproof NaN Safety)
 * 
 * Enhancements:
 * - Added "NaN Guards" to prevent one bad client from crashing the entire forecast.
 * - Added "nanClients" debug list to identify culprits.
 */

// --- Helpers ---
const sum = (arr) => arr.reduce((a, b) => a + b, 0)
const safeNum = (v, def = 0) => (isNaN(v) || !isFinite(v) ? def : v)

// Simple linear regression (y=mx+c)
const calculateLinearRegression = (yValues) => {
    const n = yValues.length
    if (n < 2) return { slope: 0, intercept: yValues[0] || 0 }
    const xValues = Array.from({ length: n }, (_, i) => i)
    const sumX = xValues.reduce((a, b) => a + b, 0)
    const sumY = yValues.reduce((a, b) => a + b, 0)
    const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0)
    const sumXX = xValues.reduce((sum, x) => sum + x * x, 0)

    const denom = (n * sumXX - sumX * sumX)
    if (denom === 0) return { slope: 0, intercept: sumY / n }

    const slope = (n * sumXY - sumX * sumY) / denom
    const intercept = (sumY - slope * sumX) / n
    return { slope: safeNum(slope), intercept: safeNum(intercept) }
}

export const calculateRevenueForecast = (salesData, currentYear = new Date().getFullYear()) => {
    // --- 1. Raw Data Audit ---
    const audit = {
        totalRecords: salesData ? salesData.length : 0,
        invalidAmounts: 0,
        rawTotal2023: 0,
        rawTotal2024: 0,
        rawTotal2025: 0,
        rawTotal2026: 0
    }

    if (!salesData || salesData.length === 0) {
        throw new Error('Insufficient data: 0 records found.')
    }

    const today = new Date()
    const currentMonthIndex = today.getMonth()
    const currentDay = today.getDate()

    salesData.forEach(s => {
        const d = new Date(s.sale_date || s.date)
        const y = d.getFullYear()

        let val = s.totalAmount || s.total_amount
        const amt = Number(val || 0) // Explicitly handle undefined/null as 0

        if (isNaN(amt)) {
            audit.invalidAmounts++
        } else {
            if (y === currentYear - 3) audit.rawTotal2023 += amt
            if (y === currentYear - 2) audit.rawTotal2024 += amt
            if (y === currentYear - 1) audit.rawTotal2025 += amt
            if (y === currentYear) audit.rawTotal2026 += amt
        }
    })

    // --- 2. Data Aggregation ---
    const clientMap = {}
    const years = [currentYear - 3, currentYear - 2, currentYear - 1, currentYear]

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
        }
    })

    // --- 3. Client Segmentation & Calculation ---
    let validationCounts = { Growing: 0, Stable: 0, Declining: 0, New: 0, Churned: 0 }
    let nanClients = []

    let segmentForecasts = {
        Growing: { count: 0, amount: 0, monthly: Array(12).fill(0) },
        Stable: { count: 0, amount: 0, monthly: Array(12).fill(0) },
        Declining: { count: 0, amount: 0, monthly: Array(12).fill(0) },
        Churned: { count: 0, amount: 0, monthly: Array(12).fill(0) },
        New: { count: 0, amount: 0, monthly: Array(12).fill(0) }
    }

    const yearPrior = currentYear - 2
    const yearPrev = currentYear - 1

    let predictedTotalBase = 0
    let predictedMonthlyBase = Array(12).fill(0)

    Object.entries(clientMap).forEach(([cid, data]) => {
        const total2023 = sum(data[currentYear - 3])
        const total2024 = sum(data[yearPrior])
        const total2025 = sum(data[yearPrev])

        let segment = 'Stable'
        let clientForecastMonthly = Array(12).fill(0)
        let clientForecastYear = 0

        if (total2023 === 0 && (total2024 > 0 || total2025 > 0)) {
            segment = 'New'
        } else if ((total2023 > 0 || total2024 > 0) && total2025 < 100000) {
            segment = 'Churned'
        } else {
            const base = total2024 > 0 ? total2024 : 1
            const growthRate = (total2025 - total2024) / base
            if (growthRate >= 0.10) segment = 'Growing'
            else if (growthRate <= -0.10) segment = 'Declining'
            else segment = 'Stable'
        }

        validationCounts[segment]++

        const lastYearMonthly = data[yearPrev]
        const seasonality = total2025 > 0 ? lastYearMonthly.map(v => v / total2025) : Array(12).fill(1 / 12)

        if (segment === 'New') {
            const activeMonths = lastYearMonthly.filter(v => v > 0).length
            if (activeMonths >= 4) {
                let startIdx = 0
                for (let i = 0; i < 12; i++) if (lastYearMonthly[i] > 0) { startIdx = i; break; }

                const yVals = lastYearMonthly.slice(startIdx)
                const { slope } = calculateLinearRegression(yVals)
                const lastVal = yVals[yVals.length - 1] || 0

                let currentVal = lastVal
                for (let i = 0; i < 12; i++) {
                    currentVal += (slope * Math.pow(0.9, i + 1))
                    clientForecastMonthly[i] = Math.max(0, safeNum(currentVal))
                }
            } else {
                const avgVal = activeMonths > 0 ? total2025 / activeMonths : 0
                clientForecastMonthly.fill(safeNum(avgVal))
            }
        }
        else if (segment === 'Churned') {
            clientForecastMonthly.fill(0)
        }
        else {
            let growthFactor = 0
            if (segment === 'Growing') {
                const rate = (total2025 - total2024) / (total2024 || 1)
                growthFactor = Math.min(rate, 0.5)
            } else if (segment === 'Declining') {
                const rate = (total2025 - total2024) / (total2024 || 1)
                growthFactor = Math.max(rate, -0.2)
            } else {
                const avgAnnual = (total2024 + total2025) / 2
                growthFactor = (avgAnnual - total2025) / (total2025 || 1)
            }

            clientForecastYear = total2025 * (1 + growthFactor)
            for (let i = 0; i < 12; i++) {
                clientForecastMonthly[i] = safeNum(clientForecastYear * seasonality[i])
            }
        }

        // NaN Check
        const cTotal = sum(clientForecastMonthly)
        if (isNaN(cTotal) || !isFinite(cTotal)) {
            nanClients.push({ cid, segment, total2025, clientForecastYear })
            // Recovery: Fallback to 2025 actuals
            for (let i = 0; i < 12; i++) {
                clientForecastMonthly[i] = data[yearPrev][i]
            }
        }

        // Aggregate
        const cTotalSafe = sum(clientForecastMonthly)
        segmentForecasts[segment].count++
        segmentForecasts[segment].amount += cTotalSafe
        for (let i = 0; i < 12; i++) {
            segmentForecasts[segment].monthly[i] += clientForecastMonthly[i]
            predictedMonthlyBase[i] += clientForecastMonthly[i]
        }
        predictedTotalBase += cTotalSafe
    })

    // --- 4. Calibration ---
    let ytdActual = audit.rawTotal2026

    let ytdTarget = 0
    for (let i = 0; i < currentMonthIndex; i++) ytdTarget += predictedMonthlyBase[i]

    const daysInMonth = new Date(currentYear, currentMonthIndex + 1, 0).getDate()
    const ratio = Math.min(Math.max(currentDay / daysInMonth, 0.05), 1.0)
    ytdTarget += (predictedMonthlyBase[currentMonthIndex] * ratio)

    let scaleFactor = 1.0
    let incompleteFlag = false

    if (ytdTarget > 10000000 && ytdActual < (ytdTarget * 0.1)) {
        scaleFactor = 1.0
        incompleteFlag = true
    } else {
        scaleFactor = ytdTarget > 0 ? ytdActual / ytdTarget : 1.0
    }

    // Safety clamp (Prevent NaN scale)
    scaleFactor = safeNum(scaleFactor, 1.0)

    const rawScale = scaleFactor
    if (!incompleteFlag) {
        scaleFactor = Math.min(Math.max(scaleFactor, 0.8), 1.2)
    }

    const finalMonthlyData = []
    let totalForecastFinal = 0
    for (let i = 0; i < 12; i++) {
        let val = predictedMonthlyBase[i] * scaleFactor
        let isForecast = true
        let actualVal = 0

        if (i < currentMonthIndex) {
            let mTotal = 0
            Object.values(clientMap).forEach(d => mTotal += d[currentYear][i])
            val = mTotal
            actualVal = mTotal
            isForecast = false
        } else if (i === currentMonthIndex) {
            let mTotal = 0
            Object.values(clientMap).forEach(d => mTotal += d[currentYear][i])
            actualVal = mTotal
            if (incompleteFlag) isForecast = true
        }

        const safeVal = Math.round(safeNum(val))
        finalMonthlyData.push({ month: i + 1, actual: actualVal, forecast: safeVal, isForecast })
        totalForecastFinal += safeVal
    }

    const growthRate = audit.rawTotal2025 > 0
        ? ((totalForecastFinal - audit.rawTotal2025) / audit.rawTotal2025 * 100).toFixed(1)
        : 0

    const analysisSummary = `Analyzed ${Object.keys(clientMap).length} clients. Raw'25: ${(audit.rawTotal2025 / 100000000).toFixed(1)}억. Forecast: ${(totalForecastFinal / 100000000).toFixed(1)}억. Scale: x${scaleFactor.toFixed(2)}.`

    return {
        forecastYear: currentYear,
        total_amount: totalForecastFinal,
        monthlyData: finalMonthlyData,
        growth_rate: growthRate,
        analysis_summary: analysisSummary,
        calculatedAt: new Date().toISOString(),
        debug: {
            audit,
            validationCounts,
            predictedTotalBase,
            ytdTarget,
            ytdActual,
            rawScale,
            clampedScale: scaleFactor,
            incompleteFlag,
            nanClients
        }
    }
}
