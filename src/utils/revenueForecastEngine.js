/**
 * AI Revenue Forecast Logic Engine (Customer-Level Bottom-Up v5.0)
 * 
 * Strategy:
 * 1. Bottom-Up: Analyze each client's history (2023-2025) to classify into segments.
 * 2. Segment Forecast: Apply specific growth/churn logic per segment.
 * 3. Calibration: Adjust theoretical forecast using 2026 YTD actuals (with missing data guardrails).
 */

// --- Helpers ---
const sum = (arr) => arr.reduce((a, b) => a + b, 0)
const avg = (arr) => arr.length > 0 ? sum(arr) / arr.length : 0

// Linear Regression Helper
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
    if (!salesData || salesData.length === 0) {
        throw new Error('Insufficient data for analysis')
    }

    const today = new Date()
    const currentMonthIndex = today.getMonth()
    const currentDay = today.getDate()

    // --- Step 1: Data Aggregation (Client x Year x Month) ---
    // Structure: { clientId: { '2023': [0...0], '2024': [...], '2025': [...], '2026': [...] } }
    const clientMap = {}
    const years = [currentYear - 3, currentYear - 2, currentYear - 1, currentYear] // e.g., 2023, 2024, 2025, 2026

    // Pre-fill helper
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

    // --- Step 2: Client Segmentation & Base Forecast ---
    let segmentForecasts = {
        Growing: { count: 0, amount: 0, monthly: Array(12).fill(0) },
        Stable: { count: 0, amount: 0, monthly: Array(12).fill(0) },
        Declining: { count: 0, amount: 0, monthly: Array(12).fill(0) },
        Churned: { count: 0, amount: 0, monthly: Array(12).fill(0) },
        New: { count: 0, amount: 0, monthly: Array(12).fill(0) }
    }

    const yearPrev = currentYear - 1 // 2025
    const yearPrior = currentYear - 2 // 2024

    // Aggregates for final stats
    let predictedTotalBase = 0
    let predictedMonthlyBase = Array(12).fill(0)

    Object.entries(clientMap).forEach(([cid, data]) => {
        const total2024 = sum(data[yearPrior])
        const total2025 = sum(data[yearPrev])
        const actives2025 = data[yearPrev].filter(v => v > 0).length

        let segment = 'Stable'
        let clientForecastYear = 0
        let clientForecastMonthly = Array(12).fill(0)

        // Logic A: New Client? (No revenue in 2023/2024, appeared in 2025 or late 2024)
        // Definition: Total 2024 < 100k AND Total 2025 > 0
        if (total2024 < 100000 && total2025 > 0) {
            segment = 'New'
            // Forecast: Extrapolate run-rate or use avg
            const monthsActive = actives2025
            if (monthsActive >= 4) {
                // Damped Linear
                const vals = data[yearPrev]
                // Find first non-zero month index
                const startIdx = vals.findIndex(v => v > 0)
                const activeVals = vals.slice(startIdx)
                const { slope, intercept } = calculateLinearRegression(activeVals)
                // Project 12 months for next year
                // Start level = last month of 2025 value
                let currentLvl = activeVals[activeVals.length - 1]
                for (let i = 0; i < 12; i++) {
                    currentLvl += (slope * Math.pow(0.9, i + 1)) // Damping
                    clientForecastMonthly[i] = Math.max(0, currentLvl)
                }
            } else {
                // Simple Avg
                const avgVal = total2025 / monthsActive
                clientForecastMonthly.fill(avgVal)
            }
        }
        // Logic B: Churned? (Revenue exist in past, but near zero in 2025 H2?)
        else if (total2025 < 100000 && total2024 > 100000) {
            segment = 'Churned'
            // Forecast: 0
        }
        // Logic C: Established (Growing/Stable/Declining)
        else {
            const growthRate = total2024 > 0 ? (total2025 - total2024) / total2024 : 0

            // Base seasonality pattern (2025 pattern)
            // Normalize to ratio array (sum = 1.0)
            const seasonality = total2025 > 0 ? data[yearPrev].map(v => v / total2025) : Array(12).fill(1 / 12)

            if (growthRate >= 0.10) {
                segment = 'Growing'
                // Conservative growth cap: +50%
                const appliedRate = Math.min(growthRate, 0.5)
                clientForecastYear = total2025 * (1 + appliedRate)
            } else if (growthRate <= -0.10) {
                segment = 'Declining'
                // Floor decline at -20%
                const appliedRate = Math.max(growthRate, -0.2)
                clientForecastYear = total2025 * (1 + appliedRate)
            } else {
                segment = 'Stable'
                // Average of 24/25 levels
                clientForecastYear = (total2024 + total2025) / 2
            }

            // Distribute monthly
            for (let i = 0; i < 12; i++) {
                clientForecastMonthly[i] = clientForecastYear * seasonality[i]
            }
        }

        // Aggregate to Segment
        const cTotal = sum(clientForecastMonthly)
        segmentForecasts[segment].count++
        segmentForecasts[segment].amount += cTotal
        for (let i = 0; i < 12; i++) {
            segmentForecasts[segment].monthly[i] += clientForecastMonthly[i]
            predictedMonthlyBase[i] += clientForecastMonthly[i]
        }
        predictedTotalBase += cTotal
    })

    // --- Step 3: Top-Down Calibration (Using 2026 YTD Actuals) ---

    // Calculate YTD Target (Expected from Base Forecast)
    // IMPORTANT: Prorated Day-level target for current month
    let ytdTarget = 0
    let ytdActual = 0
    let calibrationMessage = ""

    // Calculate Actual YTD (2026)
    // We iterate client map again? No, just iterate salesData for this year is easier or use clientMap
    // Use clientMap aggregated 2026
    Object.values(clientMap).forEach(data => {
        // Full months before current
        for (let m = 0; m < currentMonthIndex; m++) ytdActual += data[currentYear][m]
        // Current month (prorated? No, actual is actual)
        ytdActual += data[currentYear][currentMonthIndex]
    })

    // Calculate Expected Target YTD
    for (let m = 0; m < currentMonthIndex; m++) {
        ytdTarget += predictedMonthlyBase[m]
    }
    // Prorate Target for current month
    const daysInMonth = new Date(currentYear, currentMonthIndex + 1, 0).getDate()
    const prorationRatio = Math.min(Math.max(currentDay / daysInMonth, 0.05), 1.0) // min 5% to avoid div/0 issues
    ytdTarget += (predictedMonthlyBase[currentMonthIndex] * prorationRatio)

    // Calculate Scale Factor
    let scaleFactor = 1.0
    // GUARDRAIL 1: Missing Data Check
    // If YTD Actual is unexpectedly low (e.g. < 10% of Target), assume Data Missing
    if (ytdTarget > 10000000 && ytdActual < (ytdTarget * 0.1)) {
        scaleFactor = 1.0
        calibrationMessage = "Detected missing YTD data. Ignoring 2026 drop."
    } else {
        scaleFactor = ytdTarget > 0 ? ytdActual / ytdTarget : 1.0
    }

    // GUARDRAIL 2: Clamp Extreme Scaling
    // Established biz shouldn't swing +/- 20% just based on Jan partial data
    scaleFactor = Math.min(Math.max(scaleFactor, 0.8), 1.2)
    if (Math.abs(scaleFactor - 1.0) > 0.01 && !calibrationMessage) {
        calibrationMessage = `Calibrated by YTD performance (x${scaleFactor.toFixed(2)}).`
    }

    // Apply Calibration
    const finalMonthlyData = []
    let totalForecastFinal = 0

    for (let i = 0; i < 12; i++) {
        const baseVal = predictedMonthlyBase[i]
        const calibratedVal = baseVal * scaleFactor

        // Past/Current: Use Actuals? 
        // Spec says: "2026-01 is for correction only". But usually UI shows actuals for past.
        // Let's show ACTUAL for full past months, and FORECAST for future.
        // Current month: Show FORECAST (since actual might be partial) OR Adjusted Actual?
        // User request: "2026-01 prioritize complete past data". 
        // Let's show Forecast for current month to avoid "drop" visual.

        let displayVal = Math.round(calibratedVal)
        let isForecast = true
        let actualVal = 0

        if (i < currentMonthIndex) {
            // Past full months -> Show Actuals
            // We need to sum actuals for month i
            let monthlyAct = 0
            Object.values(clientMap).forEach(d => monthlyAct += d[currentYear][i])
            actualVal = monthlyAct
            displayVal = monthlyAct // Override with actual
            isForecast = false
        } else if (i === currentMonthIndex) {
            // Current month -> Show Forecast (to be safe against partial data)
            // But keep actual for tooltip
            let monthlyAct = 0
            Object.values(clientMap).forEach(d => monthlyAct += d[currentYear][i])
            actualVal = monthlyAct
            // displayVal stays as calibrated forecast
        }

        finalMonthlyData.push({
            month: i + 1,
            actual: actualVal,
            forecast: displayVal,
            isForecast: isForecast
        })
        totalForecastFinal += displayVal
    }

    // Growth Rate calculation (vs Total 2025)
    let total2025All = 0
    Object.values(clientMap).forEach(d => total2025All += sum(d[yearPrev]))

    const growthRate = total2025All > 0
        ? ((totalForecastFinal - total2025All) / total2025All * 100).toFixed(1)
        : 0

    const summary = `Analyzed ${Object.keys(clientMap).length} clients. ${calibrationMessage} Segments: Growing(${segmentForecasts.Growing.count}), Stable(${segmentForecasts.Stable.count}), New(${segmentForecasts.New.count}).`

    return {
        forecastYear: currentYear,
        total_amount: totalForecastFinal,
        monthlyData: finalMonthlyData,
        growth_rate: growthRate,
        analysis_summary: summary,
        calculatedAt: new Date().toISOString(),
        segments: { // Optional: return logic details for debug
            growing: segmentForecasts.Growing.amount,
            new: segmentForecasts.New.amount
        }
    }
}
