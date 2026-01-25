/**
 * AI Revenue Forecast Logic Engine (Advanced v4 - Robust)
 * 
 * Revisions:
 * - v4: Added "Missing Data Imputation" for current month.
 *       If current month's actual is 0 (likely data delay), we estimate it to prevent crash.
 * 
 * Strategy:
 * - Strategy A (Seasonality): Data >= 12 months.
 * - Strategy B (Damped Linear): Data 4-11 months.
 * - Strategy C (Moving Avg): Data < 4 months.
 */

// Helper: Calculate Linear Regression
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

    // 1. Data Structuring
    const sales = salesData.map(s => ({
        date: new Date(s.sale_date || s.date),
        amount: Number(s.totalAmount || s.total_amount || 0)
    })).sort((a, b) => a.date - b.date)

    const thisYear = currentYear
    const lastYear = currentYear - 1

    // Buckets
    const monthlyActuals = Array(12).fill(0).map(() => ({ thisYear: 0, lastYear: 0 }))
    let totalLastYearFull = 0

    sales.forEach(s => {
        const year = s.date.getFullYear()
        const month = s.date.getMonth()
        if (year === thisYear) monthlyActuals[month].thisYear += s.amount
        else if (year === lastYear) {
            monthlyActuals[month].lastYear += s.amount
            totalLastYearFull += s.amount
        }
    })

    // --- v4 Fix: Missing Data Imputation ---
    // If current month has 0 actual revenue, but we have historical data, 
    // it's likely a data sync delay, not a business collapse.
    // We IMPUTE the missing current month data to allow proper forecasting.
    let imputedMessage = ""
    if (monthlyActuals[currentMonthIndex].thisYear === 0 && totalLastYearFull > 0) {
        // Method: Use Last Year Same Month * 1.0 (Neutral assumption) 
        // Or if last year same month is 0, use Last Month's actual.
        let imputedValue = monthlyActuals[currentMonthIndex].lastYear

        if (imputedValue === 0) {
            // Fallback to last month (Dec of last year) or Nov
            imputedValue = monthlyActuals[(currentMonthIndex + 11) % 12].lastYear
        }

        // Apply imputation only for calculation purposes
        if (imputedValue > 0) {
            monthlyActuals[currentMonthIndex].thisYear = imputedValue
            imputedMessage = " (Note: Current month data missing, estimated based on history)"
        }
    }

    // 2. Calculate Prorated Recalculation after Imputation
    let ytdThisYearProrated = 0
    let ytdLastYearProrated = 0

    // Re-scan buckets to calc YTD (faster than re-scanning raw sales)
    for (let m = 0; m <= currentMonthIndex; m++) {
        const isCurrentMonth = m === currentMonthIndex

        // This Year YTD
        if (isCurrentMonth) {
            // If we imputed, we assume it's "Full Month Equivalent" roughly, 
            // but to be safe for proration, if it's day 25, we should scale it? 
            // No, simpler: if we imputed, we treat it as "up to now" value matches "last year up to now".
            // Actually, if we imputed using "Full Last Year Month", we should adjust for day.
            // Imputation Strategy B: Just use Last Year Prorated value as This Year Prorated Value.
            if (imputedMessage) {
                // Force match to neutralize distortion
                // But we need to calculate Last Year Prorated first.
            } else {
                ytdThisYearProrated += monthlyActuals[m].thisYear
            }
        } else {
            ytdThisYearProrated += monthlyActuals[m].thisYear
        }

        // Last Year YTD Comparison
        if (isCurrentMonth) {
            // For Last Year, we need day-level granularity.
            // Since we aggregated to months, we can estimate proration: (Total / DaysInMonth) * CurrentDay
            // This is an approximation but robust enough.
            const daysInMonth = new Date(lastYear, m + 1, 0).getDate()
            const ratio = Math.min(currentDay / daysInMonth, 1.0)
            ytdLastYearProrated += (monthlyActuals[m].lastYear * ratio)

            if (imputedMessage) {
                // If we imputed, set this year's prorated to match last year's prorated * 1.0
                // ensuring ratio is 1.0 for this month, preventing drop.
                ytdThisYearProrated += (monthlyActuals[m].lastYear * ratio)
            }
        } else {
            ytdLastYearProrated += monthlyActuals[m].lastYear
        }
    }


    // 3. Select Strategy
    let strategy = 'Moving Average'
    if (totalLastYearFull > 0) strategy = 'Seasonal Ratio'
    else if ((currentMonthIndex + 1) >= 4) strategy = 'Damped Linear'

    // 4. Execution
    let finalMonthlyData = []
    let forecastGrowthRate = 0
    let analysisSummary = ""

    // --- Strategy A: Seasonal Ratio ---
    if (strategy === 'Seasonal Ratio') {
        let scaleFactor = ytdLastYearProrated > 0 ? ytdThisYearProrated / ytdLastYearProrated : 1.0
        scaleFactor = Math.min(Math.max(scaleFactor, 0.5), 2.0)

        // Guardrail
        if (totalLastYearFull > 10000000 && scaleFactor < 0.7) {
            analysisSummary += `(Adjusted: Trend clamped to 0.8). `
            scaleFactor = 0.8
        }

        forecastGrowthRate = (scaleFactor - 1).toFixed(3)
        analysisSummary += `Based on YTD vs Last Year (x${scaleFactor.toFixed(2)}).` + imputedMessage

        for (let idx = 0; idx < 12; idx++) {
            const data = monthlyActuals[idx]

            // Render Past
            if (idx <= currentMonthIndex) {
                // If it was imputed, show the IMPUTED value as forecast, but actual as 0?
                // Or show imputed as actual?
                // Showing 0 actual + Non-zero Forecast for current month is best UI.
                const isImputedMonth = (idx === currentMonthIndex && imputedMessage !== "")

                finalMonthlyData.push({
                    month: idx + 1,
                    actual: isImputedMonth ? 0 : data.thisYear, // Keep 0 if missing in DB
                    forecast: data.thisYear, // Show what we think it is
                    isForecast: isImputedMonth // Highlight as forecast
                })
                continue
            }

            // Future
            let projected = 0
            if (data.lastYear > 0) projected = data.lastYear * scaleFactor
            else {
                const context = finalMonthlyData.slice(-3).map(d => d.forecast)
                projected = context.length > 0 ? context.reduce((a, b) => a + b, 0) / context.length : 0
            }
            finalMonthlyData.push({ month: idx + 1, actual: 0, forecast: Math.round(projected), isForecast: true })
        }
    }
    // --- Strategy B: Damped Linear --- 
    else if (strategy === 'Damped Linear') {
        // ... (Same logic, but respecting imputed values in regression)
        const yValues = []
        for (let i = 0; i <= currentMonthIndex; i++) yValues.push(monthlyActuals[i].thisYear)

        const { slope, intercept } = calculateLinearRegression(yValues)
        const phi = 0.9
        analysisSummary = `Extrapolated damped trend.` + imputedMessage

        let currentLevel = intercept + (slope * currentMonthIndex)
        for (let idx = 0; idx < 12; idx++) {
            if (idx <= currentMonthIndex) {
                const isImputed = (idx === currentMonthIndex && imputedMessage !== "")
                finalMonthlyData.push({ month: idx + 1, actual: isImputed ? 0 : monthlyActuals[idx].thisYear, forecast: monthlyActuals[idx].thisYear, isForecast: isImputed })
                continue
            }
            const k = idx - currentMonthIndex
            let accumulatedTrend = 0
            for (let i = 1; i <= k; i++) accumulatedTrend += slope * Math.pow(phi, i)
            finalMonthlyData.push({ month: idx + 1, actual: 0, forecast: Math.round(Math.max(currentLevel + accumulatedTrend, 0)), isForecast: true })
        }
        const firstVal = finalMonthlyData[0].forecast || 1
        const lastVal = finalMonthlyData[11].forecast
        forecastGrowthRate = ((lastVal - firstVal) / firstVal).toFixed(3)
    }
    // --- Strategy C ---
    else {
        // ... (Same logic)
        let sum = 0, count = 0
        for (let i = 0; i <= currentMonthIndex; i++) { if (monthlyActuals[i].thisYear > 0) { sum += monthlyActuals[i].thisYear; count++ } }
        const avg = count > 0 ? sum / count : 0
        analysisSummary = `Conservative average.` + imputedMessage
        forecastGrowthRate = 0
        for (let idx = 0; idx < 12; idx++) {
            if (idx <= currentMonthIndex) {
                const isImputed = (idx === currentMonthIndex && imputedMessage !== "")
                finalMonthlyData.push({ month: idx + 1, actual: isImputed ? 0 : monthlyActuals[idx].thisYear, forecast: monthlyActuals[idx].thisYear, isForecast: isImputed })
                continue
            }
            finalMonthlyData.push({ month: idx + 1, actual: 0, forecast: Math.round(avg), isForecast: true })
        }
    }

    const totalForecast = finalMonthlyData.reduce((sum, m) => sum + m.forecast, 0)
    const finalYoY = totalLastYearFull > 0
        ? ((totalForecast - totalLastYearFull) / totalLastYearFull * 100).toFixed(1)
        : (Number(forecastGrowthRate) * 100).toFixed(1)

    return {
        forecastYear: currentYear,
        total_amount: totalForecast,
        monthlyData: finalMonthlyData,
        growth_rate: finalYoY,
        analysis_summary: analysisSummary,
        calculatedAt: new Date().toISOString()
    }
}
