/**
 * AI Revenue Forecast Logic Engine (Debug Mode v5.1)
 * 
 * Enhancements:
 * - Added "Independent Verification" step to cross-check totals and segmentation.
 * - Added "Raw Data Audit" to detect potential zero/null amount issues.
 * - Strict 2023-2025 historical data reliance.
 */

// --- Helpers ---
const sum = (arr) => arr.reduce((a, b) => a + b, 0)
// Simple linear regression (y=mx+c)
const calculateLinearRegression = (yValues) => {
    const n = yValues.length
    if (n < 2) return { slope: 0, intercept: yValues[0] || 0 }
    const xValues = Array.from({ length: n }, (_, i) => i)
    const sumX = xValues.reduce((a, b) => a + b, 0)
    const sumY = yValues.reduce((a, b) => a + b, 0)
    const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0)
    const sumXX = xValues.reduce((sum, x) => sum + x * x, 0)
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n
    return { slope, intercept }
}

export const calculateRevenueForecast = (salesData, currentYear = new Date().getFullYear()) => {
    // --- 1. Raw Data Audit (Independent Check) ---
    // Perform this BEFORE any transformation to catch conversion errors.
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

    // Pass 1: Raw Sums
    salesData.forEach(s => {
        // Handle various date formats safely
        const d = new Date(s.sale_date || s.date)
        const y = d.getFullYear()

        // Value check
        let val = s.totalAmount || s.total_amount
        if (val === undefined || val === null) {
            val = 0
            audit.invalidAmounts++
        }
        const amt = Number(val)
        if (isNaN(amt)) {
            audit.invalidAmounts++
            return
        }

        if (y === currentYear - 3) audit.rawTotal2023 += amt
        if (y === currentYear - 2) audit.rawTotal2024 += amt
        if (y === currentYear - 1) audit.rawTotal2025 += amt
        if (y === currentYear) audit.rawTotal2026 += amt
    })

    // --- 2. Main Logic: Data Aggregation ---
    const clientMap = {}
    const years = [currentYear - 3, currentYear - 2, currentYear - 1, currentYear] // [2023, 2024, 2025, 2026]

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

        if (years.includes(y)) {
            if (!clientMap[cid]) clientMap[cid] = initClient()
            clientMap[cid][y][m] += amt
        }
    })

    // --- 3. Client Segmentation & Base Forecast ---
    // Independent Validation Counters
    let validationCounts = { Growing: 0, Stable: 0, Declining: 0, New: 0, Churned: 0 }

    let segmentForecasts = {
        Growing: { count: 0, amount: 0, monthly: Array(12).fill(0) },
        Stable: { count: 0, amount: 0, monthly: Array(12).fill(0) },
        Declining: { count: 0, amount: 0, monthly: Array(12).fill(0) },
        Churned: { count: 0, amount: 0, monthly: Array(12).fill(0) },
        New: { count: 0, amount: 0, monthly: Array(12).fill(0) }
    }

    const yearPrior = currentYear - 2 // 2024
    const yearPrev = currentYear - 1 // 2025

    // Base Calculation Arrays
    let predictedTotalBase = 0
    let predictedMonthlyBase = Array(12).fill(0)

    Object.entries(clientMap).forEach(([cid, data]) => {
        const total2023 = sum(data[currentYear - 3])
        const total2024 = sum(data[yearPrior])
        const total2025 = sum(data[yearPrev])

        let segment = 'Stable'
        let clientForecastMonthly = Array(12).fill(0)
        let clientForecastYear = 0

        // Explicit Logic based on Spec v2.0
        // New: No rev in 2023, First rev in 2024/2025
        if (total2023 === 0 && (total2024 > 0 || total2025 > 0)) {
            segment = 'New'
        }
        // Churned: Active in 2023/24 but 2025 < threshold (100k)
        else if ((total2023 > 0 || total2024 > 0) && total2025 < 100000) {
            segment = 'Churned'
        }
        // Established: Active 2023/24 and still active 2025
        else {
            // Growth Rate
            const base = total2024 > 0 ? total2024 : 1 // avoid div/0
            const growthRate = (total2025 - total2024) / base

            if (growthRate >= 0.10) segment = 'Growing'
            else if (growthRate <= -0.10) segment = 'Declining'
            else segment = 'Stable'
        }

        validationCounts[segment]++

        // --- Forecast Logic per Segment ---
        const lastYearMonthly = data[yearPrev]
        const seasonality = total2025 > 0 ? lastYearMonthly.map(v => v / total2025) : Array(12).fill(1 / 12)

        if (segment === 'New') {
            // Extrapolate Trend (Damped) or Avg
            // Check active months in 2025
            const activeMonths = lastYearMonthly.filter(v => v > 0).length
            if (activeMonths >= 4) {
                // Damped Linear
                // Find start of activity
                let startIdx = 0
                for (let i = 0; i < 12; i++) if (lastYearMonthly[i] > 0) { startIdx = i; break; }

                const yVals = lastYearMonthly.slice(startIdx)
                const { slope } = calculateLinearRegression(yVals) // intercept relative to slice
                // We need absolute intercept? No, just project from last value
                const lastVal = yVals[yVals.length - 1]

                let currentVal = lastVal
                for (let i = 0; i < 12; i++) {
                    currentVal += (slope * Math.pow(0.9, i + 1))
                    clientForecastMonthly[i] = Math.max(0, currentVal)
                }
            } else {
                // Simple Average of active months
                const avgVal = activeMonths > 0 ? total2025 / activeMonths : 0
                clientForecastMonthly.fill(avgVal)
            }
        }
        else if (segment === 'Churned') {
            clientForecastMonthly.fill(0)
        }
        else {
            // Growing / Stable / Declining
            let growthFactor = 0
            if (segment === 'Growing') {
                const rate = (total2025 - total2024) / (total2024 || 1)
                growthFactor = Math.min(rate, 0.5) // Cap +50%
            } else if (segment === 'Declining') {
                const rate = (total2025 - total2024) / (total2024 || 1)
                growthFactor = Math.max(rate, -0.2) // Floor -20%
            } else {
                // Stable: Use Average of 24/25
                const avgAnnual = (total2024 + total2025) / 2
                // Implied growth factor vs 2025
                growthFactor = (avgAnnual - total2025) / total2025
            }

            clientForecastYear = total2025 * (1 + growthFactor)
            for (let i = 0; i < 12; i++) {
                clientForecastMonthly[i] = clientForecastYear * seasonality[i]
            }
        }

        // Aggregate
        const cTotal = sum(clientForecastMonthly)
        segmentForecasts[segment].count++
        segmentForecasts[segment].amount += cTotal
        for (let i = 0; i < 12; i++) {
            segmentForecasts[segment].monthly[i] += clientForecastMonthly[i]
            predictedMonthlyBase[i] += clientForecastMonthly[i]
        }
        predictedTotalBase += cTotal
    })

    // --- 4. Top-Down Calibration ---
    let ytdActual = 0
    // Sum 2026 data
    salesData.forEach(s => {
        const d = new Date(s.sale_date || s.date)
        if (d.getFullYear() === currentYear) ytdActual += Number(s.totalAmount || s.total_amount || 0)
    })

    // Calculate YTD Target
    let ytdTarget = 0
    for (let i = 0; i < currentMonthIndex; i++) ytdTarget += predictedMonthlyBase[i]
    // Prorate current month target
    const daysInMonth = new Date(currentYear, currentMonthIndex + 1, 0).getDate()
    const ratio = Math.min(Math.max(currentDay / daysInMonth, 0.05), 1.0)
    ytdTarget += (predictedMonthlyBase[currentMonthIndex] * ratio)

    // Scale Factor
    let scaleFactor = 1.0
    let incompleteFlag = false

    // Guardrail: Missing Data
    if (ytdTarget > 10000000 && ytdActual < (ytdTarget * 0.1)) {
        scaleFactor = 1.0
        incompleteFlag = true
    } else {
        scaleFactor = ytdTarget > 0 ? ytdActual / ytdTarget : 1.0
    }

    // Clamp
    const rawScale = scaleFactor
    if (!incompleteFlag) {
        scaleFactor = Math.min(Math.max(scaleFactor, 0.8), 1.2)
    }

    // Apply
    const finalMonthlyData = []
    let totalForecastFinal = 0
    for (let i = 0; i < 12; i++) {
        let val = predictedMonthlyBase[i] * scaleFactor
        let isForecast = true
        let actualVal = 0

        // For past months, show actuals if available? 
        // User requested: 2026-01 is for correction only.
        // We will show Actuals for PAST months (0 to m-1), and Forecast for Current+Future.
        if (i < currentMonthIndex) {
            // Calculate actual for this month
            let mTotal = 0
            // Optimization: loop salesData again or use clientMap
            Object.values(clientMap).forEach(d => mTotal += d[currentYear][i])
            val = mTotal
            actualVal = mTotal
            isForecast = false
        } else if (i === currentMonthIndex) {
            let mTotal = 0
            Object.values(clientMap).forEach(d => mTotal += d[currentYear][i])
            actualVal = mTotal
            // val is forecast
            if (incompleteFlag) isForecast = true
        }

        finalMonthlyData.push({ month: i + 1, actual: actualVal, forecast: Math.round(val), isForecast })
        totalForecastFinal += Math.round(val)
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
        // EXPLICIT DEBUG INFO
        debug: {
            audit,
            validationCounts,
            predictedTotalBase,
            ytdTarget,
            ytdActual,
            rawScale,
            clampedScale: scaleFactor,
            incompleteFlag
        }
    }
}
