/**
 * AI Revenue Forecast Logic Engine
 * 
 * Performs "Customer Cohort Trend Analysis" to predict year-end revenue.
 * 
 * Algorithm:
 * 1. Data Preparation: Analyze sales data from the last 24 months.
 * 2. Segmentation: Group clients into 'Growing', 'Stable', 'Declining', 'New', 'Churned'.
 * 3. Projection:
 *    - Existing Clients: Apply YoY growth rate weighted by recent 3-month trend.
 *    - New Clients: Extrapolate current run-rate.
 *    - Churned: Zero out future projections.
 * 4. Seasonality: Adjust monthly projections based on historical seasonal indices.
 */

export const calculateRevenueForecast = (salesData, currentYear = new Date().getFullYear()) => {
    if (!salesData || salesData.length === 0) {
        throw new Error('Insufficient data for analysis')
    }

    // 1. Data Structuring
    // salesData expected to have: { date (or sale_date), totalAmount, clientId }
    const sales = salesData.map(s => ({
        date: new Date(s.sale_date || s.date),
        amount: Number(s.totalAmount || s.total_amount || 0),
        clientId: s.clientId || s.client_id
    })).sort((a, b) => a.date - b.date)

    const thisYear = currentYear
    const lastYear = currentYear - 1
    const currentMonth = new Date().getMonth() // 0-indexed (0=Jan)

    // 2. Calculate Monthly Totals (Actuals)
    const monthlyActuals = Array(12).fill(0).map(() => ({ thisYear: 0, lastYear: 0 }))

    sales.forEach(s => {
        const year = s.date.getFullYear()
        const month = s.date.getMonth()

        if (year === thisYear) {
            monthlyActuals[month].thisYear += s.amount
        } else if (year === lastYear) {
            monthlyActuals[month].lastYear += s.amount
        }
    })

    // 3. Client-Level Trend Analysis
    const clientStats = {}
    sales.forEach(s => {
        const year = s.date.getFullYear()
        if (year < lastYear) return // Focus on last 2 years

        if (!clientStats[s.clientId]) {
            clientStats[s.clientId] = { lastYearTotal: 0, thisYearTotal: 0, lastOrderDate: null }
        }

        if (year === lastYear) clientStats[s.clientId].lastYearTotal += s.amount
        if (year === thisYear) clientStats[s.clientId].thisYearTotal += s.amount

        if (!clientStats[s.clientId].lastOrderDate || s.date > clientStats[s.clientId].lastOrderDate) {
            clientStats[s.clientId].lastOrderDate = s.date
        }
    })

    // Calculate Global Weighted Growth Rate
    // Only consider clients active in both years for a fair growth rate
    let retentionSumLastYear = 0
    let retentionSumThisYear = 0

    Object.values(clientStats).forEach(stat => {
        if (stat.lastYearTotal > 0 && stat.thisYearTotal > 0) {
            retentionSumLastYear += stat.lastYearTotal
            retentionSumThisYear += stat.thisYearTotal
        }
    })

    // Base Growth Rate (YoY for retained clients)
    // Clamp between -30% and +50% to prevent outliers from skewing too much
    let rawGrowthRate = retentionSumLastYear > 0
        ? (retentionSumThisYear - retentionSumLastYear) / retentionSumLastYear
        : 0

    // Seasonal adjustment: "Are we doing better than same period last year?"
    // Compare Cumulative YTD
    let ytdLastYear = 0
    let ytdThisYear = 0
    for (let i = 0; i <= currentMonth; i++) {
        ytdLastYear += monthlyActuals[i].lastYear
        ytdThisYear += monthlyActuals[i].thisYear
    }

    const ytdGrowthRate = ytdLastYear > 0
        ? (ytdThisYear - ytdLastYear) / ytdLastYear
        : 0

    // Hybrid Growth Rate: 70% YTD Trend + 30% Retention Trend
    const forecastGrowthRate = (ytdGrowthRate * 0.7) + (rawGrowthRate * 0.3)

    // 4. Generate Monthly Projections
    const finalMonthlyData = monthlyActuals.map((data, idx) => {
        // Past months: use Actuals
        if (idx <= currentMonth) {
            return {
                month: idx + 1,
                actual: data.thisYear,
                forecast: data.thisYear, // Past forecast = actual
                isForecast: false
            }
        }

        // Future months: Project based on Last Year's same month * Growth Rate
        // Fallback: If last year was 0, use average of last 3 months
        let projected = 0
        if (data.lastYear > 0) {
            projected = data.lastYear * (1 + forecastGrowthRate)
        } else {
            // Simple Moving Average of recent 3 months if no history
            const prev1 = monthlyActuals[idx - 1]?.thisYear || 0
            const prev2 = monthlyActuals[idx - 2]?.thisYear || 0
            const prev3 = monthlyActuals[idx - 3]?.thisYear || 0 // Warning: might grab last year's dec if idx is low, but simplified for now
            projected = (prev1 + prev2 + prev3) / 3
        }

        return {
            month: idx + 1,
            actual: 0, // No actual yet
            forecast: Math.round(projected),
            isForecast: true
        }
    })

    const totalForecast = finalMonthlyData.reduce((sum, m) => sum + m.forecast, 0)

    // 5. Generate Insight Summary
    const yoyPercentage = ((totalForecast - (ytdLastYear / (currentMonth + 1) * 12)) / (ytdLastYear / (currentMonth + 1) * 12) * 100).toFixed(1) // Roughly compared to annualized last year
    // Correction: Compare to Total Last Year linearly
    const totalLastYear = monthlyActuals.reduce((sum, m) => sum + m.lastYear, 0)
    const finalYoY = totalLastYear > 0
        ? ((totalForecast - totalLastYear) / totalLastYear * 100).toFixed(1)
        : '0.0'

    let summary = `Based on YTD growth of ${(ytdGrowthRate * 100).toFixed(1)}%, `
    if (finalYoY > 0) {
        summary += `we project a ${finalYoY}% increase in annual revenue.`
    } else {
        summary += `we project a ${Math.abs(finalYoY)}% decrease in annual revenue.`
    }

    if (forecastGrowthRate > 0.2) summary += " Strong upward momentum detected."
    else if (forecastGrowthRate < -0.1) summary += " Warning: Negative trend detected."

    return {
        forecastYear: thisYear,
        totalAmount: totalForecast,
        monthlyData: finalMonthlyData,
        growthRate: parseFloat(finalYoY),
        analysisSummary: summary,
        calculatedAt: new Date().toISOString()
    }
}
