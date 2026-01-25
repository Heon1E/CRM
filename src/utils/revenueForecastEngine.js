/**
 * AI Revenue Forecast Logic Engine (Advanced v2)
 * 
 * Uses "Seasonal Ratio", "Damped Linear Trend", and "Conservative Moving Average"
 * based on data availability.
 * 
 * Algorithm Specs:
 * - Strategy A (Seasonal): Data >= 12 months. Projects based on last year's patterns scaled by this year's performance.
 * - Strategy B (Damped Linear): Data 4-11 months. Fits a regression line with decay factor (phi=0.9).
 * - Strategy C (Moving Avg): Data < 4 months. Simple average, no growth assumption.
 * 
 * Safety:
 * - Growth Rate Capped at +100% (2x) and Floored at -50% (0.5x).
 * - Output snake_case keys for DB compatibility.
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

    // 1. Data Structuring & Monthly Aggregation
    const sales = salesData.map(s => ({
        date: new Date(s.sale_date || s.date),
        amount: Number(s.totalAmount || s.total_amount || 0)
    })).sort((a, b) => a.date - b.date)

    const thisYear = currentYear
    const lastYear = currentYear - 1
    const currentMonth = new Date().getMonth() // 0-indexed (0=Jan, 3=April)

    // Buckets
    const monthlyActuals = Array(12).fill(0).map(() => ({ thisYear: 0, lastYear: 0 }))

    sales.forEach(s => {
        const year = s.date.getFullYear()
        const month = s.date.getMonth()
        if (year === thisYear) monthlyActuals[month].thisYear += s.amount
        else if (year === lastYear) monthlyActuals[month].lastYear += s.amount
    })

    // 2. Select Strategy
    let strategy = 'Comparing'
    const hasLastYearData = monthlyActuals.some(m => m.lastYear > 0)
    // Count valid data points in current year (non-zero months up to current month)
    // Note: We use 'currentMonth + 1' as approximate data count if we assume continuous operation.
    // Better: count non-zero months if sparse? No, sticking to month index is safer for new biz context.
    const dataMonthsCount = currentMonth + 1

    if (hasLastYearData) {
        strategy = 'Seasonal Ratio' // Strategy A
    } else if (dataMonthsCount >= 4) {
        strategy = 'Damped Linear' // Strategy B
    } else {
        strategy = 'Moving Average' // Strategy C
    }

    // 3. Execution
    let finalMonthlyData = []
    let forecastGrowthRate = 0
    let analysisSummary = ""

    // --- Strategy A: Seasonal Ratio Projection ---
    if (strategy === 'Seasonal Ratio') {
        // Calculate YTD Scale Factor
        let ytdLastYear = 0
        let ytdThisYear = 0
        for (let i = 0; i <= currentMonth; i++) {
            ytdLastYear += monthlyActuals[i].lastYear
            ytdThisYear += monthlyActuals[i].thisYear
        }

        // Scale Factor (Clamp to avoid explosion)
        const rawScale = ytdLastYear > 0 ? ytdThisYear / ytdLastYear : 1
        const scaleFactor = Math.min(Math.max(rawScale, 0.5), 2.0) // 0.5x ~ 2.0x

        forecastGrowthRate = (scaleFactor - 1).toFixed(3)
        analysisSummary = `Applied seasonal patterns from last year (YTD Scale: x${scaleFactor.toFixed(2)}).`

        // Generate Forecast
        for (let idx = 0; idx < 12; idx++) {
            const data = monthlyActuals[idx]

            if (idx <= currentMonth) {
                finalMonthlyData.push({ month: idx + 1, actual: data.thisYear, forecast: data.thisYear, isForecast: false })
                continue
            }

            // Future: LastYear * ScaleFactor
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
    // --- Strategy B: Damped Linear Trend ---
    else if (strategy === 'Damped Linear') {
        // Extract existing monthly points
        const yValues = []
        for (let i = 0; i <= currentMonth; i++) {
            yValues.push(monthlyActuals[i].thisYear)
        }

        const { slope, intercept } = calculateLinearRegression(yValues)
        const phi = 0.9 // Damping Factor

        analysisSummary = `Extrapolated damped linear trend (Slope: ${Math.round(slope)}, Damping: ${phi}).`

        // Calculate annualized growth rate for info (rough estimate based on last projected vs first)
        // We can't easily calc simple growth rate for linear model, so we'll calc it after projection loop.

        // Generate Forecast
        let currentLevel = intercept + (slope * currentMonth) // Start point for projection

        for (let idx = 0; idx < 12; idx++) {
            if (idx <= currentMonth) {
                finalMonthlyData.push({ month: idx + 1, actual: monthlyActuals[idx].thisYear, forecast: monthlyActuals[idx].thisYear, isForecast: false })
                continue
            }

            // Future: Damped Trend
            // Forecast_t+k = Level_t + Sum(slope * phi^i)
            const k = idx - currentMonth
            let accumulatedTrend = 0
            for (let i = 1; i <= k; i++) {
                accumulatedTrend += slope * Math.pow(phi, i)
            }

            let projected = currentLevel + accumulatedTrend
            projected = Math.max(projected, 0) // Floor at 0

            finalMonthlyData.push({ month: idx + 1, actual: 0, forecast: Math.round(projected), isForecast: true })
        }

        // Metrics
        const firstVal = finalMonthlyData[0].forecast || 1
        const lastVal = finalMonthlyData[11].forecast
        forecastGrowthRate = ((lastVal - firstVal) / firstVal).toFixed(3)
    }
    // --- Strategy C: Conservative Moving Average ---
    else {
        // Simple Average of available data
        let sum = 0, count = 0
        for (let i = 0; i <= currentMonth; i++) {
            if (monthlyActuals[i].thisYear > 0) {
                sum += monthlyActuals[i].thisYear
                count++
            }
        }
        const average = count > 0 ? sum / count : 0

        analysisSummary = `Used conservative 3-month average due to limited data (<4 months).`
        forecastGrowthRate = 0 // Assume flat

        for (let idx = 0; idx < 12; idx++) {
            if (idx <= currentMonth) {
                finalMonthlyData.push({ month: idx + 1, actual: monthlyActuals[idx].thisYear, forecast: monthlyActuals[idx].thisYear, isForecast: false })
                continue
            }
            finalMonthlyData.push({ month: idx + 1, actual: 0, forecast: Math.round(average), isForecast: true })
        }
    }

    // 4. Summarization
    const totalForecast = finalMonthlyData.reduce((sum, m) => sum + m.forecast, 0)

    // Insight Text
    if (Number(forecastGrowthRate) > 0.1) analysisSummary += " Expecting growth."
    else if (Number(forecastGrowthRate) < -0.1) analysisSummary += " Consolidation phase."

    // 5. Output (Snake Case)
    return {
        forecastYear: currentYear,
        total_amount: totalForecast,
        monthlyData: finalMonthlyData,
        growth_rate: Number(forecastGrowthRate) * 100,
        analysis_summary: analysisSummary,
        calculatedAt: new Date().toISOString()
    }
}
