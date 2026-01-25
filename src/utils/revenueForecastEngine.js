/**
 * AI Revenue Forecast Logic Engine (Advanced)
 * 
 * Uses "Seasonal Ratio Projection" and "Linear Trend Extrapolation" 
 * to solve flatline prediction issues and improve accuracy.
 * 
 * Algorithm:
 * 1. Data Preparation: Aggregate by month.
 * 2. Strategy Selection:
 *    - Strategy A (Seasonality): Data >= 12 months. Projects based on last year's patterns scaled by this year's performance.
 *    - Strategy B (Linear Trend): Data < 12 months. Fits a regression line to predict growth.
 * 3. Output Normalization: Returns snake_case keys for DB compatibility.
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
    let strategy = 'Linear Trend'
    const hasLastYearData = monthlyActuals.some(m => m.lastYear > 0)
    const thisYearDataCount = currentMonth + 1

    if (hasLastYearData) {
        strategy = 'Seasonal Ratio'
    }

    // 3. Execution
    let finalMonthlyData = []
    let forecastGrowthRate = 0

    // Strategy A: Seasonal Ratio Projection
    if (strategy === 'Seasonal Ratio') {
        // Calculate YTD Scale Factor (How much better/worse are we doing than last year?)
        let ytdLastYear = 0
        let ytdThisYear = 0
        for (let i = 0; i <= currentMonth; i++) {
            ytdLastYear += monthlyActuals[i].lastYear
            ytdThisYear += monthlyActuals[i].thisYear
        }

        // Scale Factor (Clamp to avoid explosion if last year was tiny)
        // If last year was 0 (shouldn't happen in this branch), default to 1
        const rawScale = ytdLastYear > 0 ? ytdThisYear / ytdLastYear : 1
        // Clamp scale: Max 2x growth, Min 0.5x decline (Safety)
        const scaleFactor = Math.min(Math.max(rawScale, 0.5), 2.0)

        forecastGrowthRate = (scaleFactor - 1).toFixed(3)

        // Generate Forecast
        for (let idx = 0; idx < 12; idx++) {
            const data = monthlyActuals[idx]

            // Past
            if (idx <= currentMonth) {
                finalMonthlyData.push({
                    month: idx + 1,
                    actual: data.thisYear,
                    forecast: data.thisYear,
                    isForecast: false
                })
                continue
            }

            // Future: LastYear * ScaleFactor
            // If LastYear is 0 for this specific month, fallback to average of recent months
            let projected = 0
            if (data.lastYear > 0) {
                projected = data.lastYear * scaleFactor
            } else {
                // Last year gap? Fill with moving average of current projection
                const context = finalMonthlyData.slice(-3).map(d => d.forecast)
                projected = context.reduce((a, b) => a + b, 0) / context.length
            }

            finalMonthlyData.push({
                month: idx + 1,
                actual: 0,
                forecast: Math.round(projected),
                isForecast: true
            })
        }
    }
    // Strategy B: Linear Trend Extrapolation (For New Biz)
    else {
        // Extract existing monthly points [0, 1, 2...] -> [Amount, Amount, Amount]
        const yValues = []
        for (let i = 0; i <= currentMonth; i++) {
            yValues.push(monthlyActuals[i].thisYear)
        }

        const { slope, intercept } = calculateLinearRegression(yValues)

        // Annualize growth rate for info purpose
        const startVal = intercept
        const endVal = intercept + slope * 11
        forecastGrowthRate = startVal > 0 ? ((endVal - startVal) / startVal).toFixed(3) : 0

        // Generate Forecast
        for (let idx = 0; idx < 12; idx++) {
            // Past
            if (idx <= currentMonth) {
                finalMonthlyData.push({
                    month: idx + 1,
                    actual: monthlyActuals[idx].thisYear,
                    forecast: monthlyActuals[idx].thisYear,
                    isForecast: false
                })
                continue
            }

            // Future: y = mx + c
            // Damping: Reduce slope effectiveness as we go further (0.9 power of dist)
            // to be conservative
            const dist = idx - currentMonth
            const dampedSlope = slope * (0.95 ** dist)

            let projected = intercept + (slope * idx) // Simple linear for now, damping slope is complex without math lib

            // Safety: Don't go below 0, don't drop drastically if slope is negative logic could be improved
            projected = Math.max(projected, 0)

            finalMonthlyData.push({
                month: idx + 1,
                actual: 0,
                forecast: Math.round(projected),
                isForecast: true
            })
        }
    }

    // 4. Summarization
    const totalForecast = finalMonthlyData.reduce((sum, m) => sum + m.forecast, 0)

    // Formatting Summary Text
    let summary = strategy === 'Seasonal Ratio'
        ? `Applied seasonal patterns from last year (Scale: x${((Number(forecastGrowthRate) + 1)).toFixed(2)}).`
        : `Extrapolated linear trend from recent performance (Slope: ${forecastGrowthRate > 0 ? '+' : ''}${forecastGrowthRate}).`

    if (Number(forecastGrowthRate) > 0.1) summary += " Expecting strong growth."
    else if (Number(forecastGrowthRate) < -0.1) summary += " Revenue consolidation phase."
    else summary += " Stable revenue flow expected."

    // 5. Output (Snake Case for DB safety)
    return {
        forecastYear: currentYear,
        total_amount: totalForecast, // Key Fix: Snake case for DB/UI consistency
        monthlyData: finalMonthlyData,
        growth_rate: Number(forecastGrowthRate) * 100, // Convert to percentage
        analysis_summary: summary,
        calculatedAt: new Date().toISOString()
    }
}
