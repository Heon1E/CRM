/**
 * AI Revenue Forecast Logic Engine (Advanced v3)
 * 
 * Revisions:
 * - v3: Added "Day-level Proration" for current month comparisons to fix fake YTD drops.
 * - v3: Added "Fall-from-Cliff Guardrail" to prevent unrealistic drops (>30%) for established biz.
 * 
 * Strategy:
 * - Strategy A (Seasonality): Data >= 12 months.
 * - Strategy B (Damped Linear): Data 4-11 months.
 * - Strategy C (Moving Avg): Data < 4 months.
 */

// Helper: Calculate Linear Regression (y = mx + c)
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

    // Configuration
    const today = new Date()
    // For testing/simulation, we might override currentYear, but usually it matches today
    // If currentYear is explicitly passed (e.g. simulation), we try to respect it, 
    // but day-level logic relies on 'today's date within the month. 
    // We assume currentYear == today.getFullYear() for the proration logic.
    const currentMonthIndex = today.getMonth()
    const currentDay = today.getDate()

    // 1. Data Structuring
    // salesData: { date, amount }
    const sales = salesData.map(s => ({
        date: new Date(s.sale_date || s.date),
        amount: Number(s.totalAmount || s.total_amount || 0)
    })).sort((a, b) => a.date - b.date)

    const thisYear = currentYear
    const lastYear = currentYear - 1

    // Monthly buckets for full stats
    const monthlyActuals = Array(12).fill(0).map(() => ({ thisYear: 0, lastYear: 0 }))

    // For Day-Adjusted comparison of determining "Trend"
    // We need to compare "This Year (Jan 1 ~ Current Day)" vs "Last Year (Jan 1 ~ Same Day)"
    let ytdThisYearProrated = 0
    let ytdLastYearProrated = 0
    let totalLastYearFull = 0 // Full 12 months sum of last year

    sales.forEach(s => {
        const year = s.date.getFullYear()
        const month = s.date.getMonth()
        const day = s.date.getDate()

        if (year === thisYear) {
            monthlyActuals[month].thisYear += s.amount
            // Ptd logic: simple accumulation for this year (since it is incomplete)
            ytdThisYearProrated += s.amount
        }
        else if (year === lastYear) {
            monthlyActuals[month].lastYear += s.amount
            totalLastYearFull += s.amount

            // Prorated Last Year Accumulation
            // Include full months before current month
            if (month < currentMonthIndex) {
                ytdLastYearProrated += s.amount
            }
            // Include current month ONLY up to current day
            else if (month === currentMonthIndex && day <= currentDay) {
                ytdLastYearProrated += s.amount
            }
        }
    })

    // 2. Select Strategy
    let strategy = 'Moving Average'
    const hasLastYearData = totalLastYearFull > 0
    // Count active months in this year
    const dataMonthsCount = currentMonthIndex + 1

    if (hasLastYearData) {
        strategy = 'Seasonal Ratio' // Strategy A
    } else if (dataMonthsCount >= 4) {
        strategy = 'Damped Linear' // Strategy B
    }

    // 3. Execution
    let finalMonthlyData = []
    let forecastGrowthRate = 0
    let analysisSummary = ""

    // --- Strategy A: Seasonal Ratio Projection ---
    if (strategy === 'Seasonal Ratio') {
        // Calculate Scale Factor using PRORATED values
        // "How is this year performing compared to the EXACT same period last year?"

        let scaleFactor = 1.0

        // Edge Case: Very beginning of year (e.g. Jan 1st-5th) -> Prorated comparison is noisy.
        // If we are in first 10 days of Jan, maybe rely on Last Q4 trend or just 1.0
        if (currentMonthIndex === 0 && currentDay < 10) {
            scaleFactor = 1.0
            analysisSummary = "Early Year: Using neutral baseline. "
        } else {
            // Normal Prorated Logic
            scaleFactor = ytdLastYearProrated > 0 ? ytdThisYearProrated / ytdLastYearProrated : 1.0
        }

        // Clamp scale: Max 2x, Min 0.5x
        scaleFactor = Math.min(Math.max(scaleFactor, 0.5), 2.0)

        // Additional Guardrail: Established Business shouldn't drop > 30% without reason
        // If totalLastYearFull was substantial (> 10M KRW) and scaleFactor < 0.7, warn and clamp
        if (totalLastYearFull > 10000000 && scaleFactor < 0.7) {
            analysisSummary += `(Adjusted: Trend was ${scaleFactor.toFixed(2)}, clamped to 0.8 for safety). `
            scaleFactor = 0.8
        }

        forecastGrowthRate = (scaleFactor - 1).toFixed(3)
        analysisSummary += `Based on YTD performance vs same period last year (x${scaleFactor.toFixed(2)}).`

        // Generate Forecast
        for (let idx = 0; idx < 12; idx++) {
            const data = monthlyActuals[idx]

            // Past
            if (idx <= currentMonthIndex) {
                finalMonthlyData.push({ month: idx + 1, actual: data.thisYear, forecast: data.thisYear, isForecast: false })
                continue
            }

            // Future
            let projected = 0
            if (data.lastYear > 0) {
                projected = data.lastYear * scaleFactor
            } else {
                // Gap fill
                const context = finalMonthlyData.slice(-3).map(d => d.forecast)
                projected = context.length > 0 ? context.reduce((a, b) => a + b, 0) / context.length : 0
            }

            finalMonthlyData.push({ month: idx + 1, actual: 0, forecast: Math.round(projected), isForecast: true })
        }
    }
    // --- Strategy B: Damped Linear ---
    else if (strategy === 'Damped Linear') {
        // ... (Same as v2.1)
        const yValues = []
        for (let i = 0; i <= currentMonthIndex; i++) yValues.push(monthlyActuals[i].thisYear)
        const { slope, intercept } = calculateLinearRegression(yValues)
        const phi = 0.9
        analysisSummary = `Extrapolated damped trend (Slope: ${Math.round(slope)}).`

        let currentLevel = intercept + (slope * currentMonthIndex)
        for (let idx = 0; idx < 12; idx++) {
            if (idx <= currentMonthIndex) {
                finalMonthlyData.push({ month: idx + 1, actual: monthlyActuals[idx].thisYear, forecast: monthlyActuals[idx].thisYear, isForecast: false })
                continue
            }
            const k = idx - currentMonthIndex
            let accumulatedTrend = 0
            for (let i = 1; i <= k; i++) accumulatedTrend += slope * Math.pow(phi, i)
            let projected = Math.max(currentLevel + accumulatedTrend, 0)
            finalMonthlyData.push({ month: idx + 1, actual: 0, forecast: Math.round(projected), isForecast: true })
        }
        const firstVal = finalMonthlyData[0].forecast || 1
        const lastVal = finalMonthlyData[11].forecast
        forecastGrowthRate = ((lastVal - firstVal) / firstVal).toFixed(3)
    }
    // --- Strategy C: Moving Average ---
    else {
        // ... (Same as v2)
        let sum = 0, count = 0
        for (let i = 0; i <= currentMonthIndex; i++) {
            if (monthlyActuals[i].thisYear > 0) { sum += monthlyActuals[i].thisYear; count++ }
        }
        const average = count > 0 ? sum / count : 0
        analysisSummary = `Used recent average due to limited data.`
        forecastGrowthRate = 0
        for (let idx = 0; idx < 12; idx++) {
            if (idx <= currentMonthIndex) {
                finalMonthlyData.push({ month: idx + 1, actual: monthlyActuals[idx].thisYear, forecast: monthlyActuals[idx].thisYear, isForecast: false })
                continue
            }
            finalMonthlyData.push({ month: idx + 1, actual: 0, forecast: Math.round(average), isForecast: true })
        }
    }

    // 4. Summarization
    const totalForecast = finalMonthlyData.reduce((sum, m) => sum + m.forecast, 0)

    // Final Growth Rate Calculation based on Total Forecast vs Total Actual Last Year
    const finalYoY = totalLastYearFull > 0
        ? ((totalForecast - totalLastYearFull) / totalLastYearFull * 100).toFixed(1)
        : (Number(forecastGrowthRate) * 100).toFixed(1)

    // 5. Output
    return {
        forecastYear: currentYear,
        total_amount: totalForecast,
        monthlyData: finalMonthlyData,
        growth_rate: finalYoY,
        analysis_summary: analysisSummary,
        calculatedAt: new Date().toISOString()
    }
}
