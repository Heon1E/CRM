/**
 * AI Revenue Forecast Logic Engine (v6.0 - Client Contribution Tuning)
 * 
 * Enhancements:
 * - "High Potential New": Detects accelerating new clients (H2 > H1 * 1.5).
 * - "Sharp Decline": Detects clients who dropped > 70% from peak.
 * - "Contribution Report": Generates detailed segment breakdown for validation.
 */

const sum = (arr) => arr.reduce((a, b) => a + b, 0)
const safeNum = (v, def = 0) => (isNaN(v) || !isFinite(v) ? def : v)

export const calculateRevenueForecast = (salesData, currentYear = new Date().getFullYear()) => {
    // --- 1. Audit ---
    const audit = { totalRecords: salesData ? salesData.length : 0, rawTotal2025: 0, rawTotal2026: 0 }
    if (!audit.totalRecords) throw new Error('No data')

    // --- 2. Aggregation ---
    const clientMap = {}
    const years = [currentYear - 3, currentYear - 2, currentYear - 1, currentYear]

    // Helper to init structure
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

            if (y === currentYear - 1) audit.rawTotal2025 += amt
            if (y === currentYear) audit.rawTotal2026 += amt
        }
    })

    // --- 3. Segmentation & Forecast ---
    // Reporting Structures
    const contribution = {
        Growing: { count: 0, rev2025: 0, forecast2026: 0 },
        Stable: { count: 0, rev2025: 0, forecast2026: 0 },
        Declining: { count: 0, rev2025: 0, forecast2026: 0 },
        Churned: { count: 0, rev2025: 0, forecast2026: 0 },
        New: { count: 0, rev2025: 0, forecast2026: 0 },
        HighPotential: { count: 0, rev2025: 0, forecast2026: 0 } // Sub-segment of New/Growing
    }

    const debugLists = {
        stoppedClients: [],      // Clients who dropped > 70%
        highPotentialClients: [] // Clients who accelerated in H2
    }

    const yearPrev = currentYear - 1 // 2025
    const yearPrior = currentYear - 2 // 2024

    let predictedMonthlyBase = Array(12).fill(0)

    Object.entries(clientMap).forEach(([cid, data]) => {
        const total2023 = sum(data[currentYear - 3])
        const total2024 = sum(data[yearPrior])
        const total2025 = sum(data[yearPrev])
        const monthly2025 = data[yearPrev]

        let segment = 'Stable'
        let clientForecastMonthly = Array(12).fill(0)

        // --- Logic: Classification ---

        // 1. Churned / Sharp Decline detection
        const peakHistory = Math.max(total2023, total2024)
        if (peakHistory > 100000 && total2025 <= 0.3 * peakHistory) {
            segment = 'Churned' // or "Sharp Decline"
            if (total2025 < 100000) {
                // True Churn (Near Zero)
                debugLists.stoppedClients.push({ cid, total2024, total2025, type: 'Stopped' })
            } else {
                // Sharp Reduction
                debugLists.stoppedClients.push({ cid, total2024, total2025, type: 'Reduced' })
            }
        }
        // 2. New Client detection
        else if (total2023 === 0 && (total2024 > 0 || total2025 > 0)) {
            segment = 'New'
            // Check High Potential (H2 vs H1 in 2025)
            const h1 = sum(monthly2025.slice(0, 6))
            const h2 = sum(monthly2025.slice(6, 12))
            if (h2 > h1 * 1.5 && h2 > 1000000) { // Threshold 1M KRW to filter noise
                segment = 'HighPotential'
                debugLists.highPotentialClients.push({ cid, h1, h2, growth: (h2 / h1).toFixed(1) })
            }
        }
        // 3. Established
        else {
            const base = total2024 > 0 ? total2024 : 1
            const growthRate = (total2025 - total2024) / base
            if (growthRate >= 0.10) segment = 'Growing'
            else if (growthRate <= -0.10) segment = 'Declining'
            else segment = 'Stable'
        }

        // --- Logic: Forecast Calculation ---

        if (segment === 'Churned') {
            // If sharp reduction (not zero), keep flat at low level. If zero, stay zero.
            const residual = total2025 > 100000 ? total2025 : 0
            clientForecastMonthly.fill(safeNum(residual / 12))
        }
        else if (segment === 'HighPotential') {
            // Aggressive: Extrapolate H2 run-rate
            const h2Avg = sum(monthly2025.slice(6, 12)) / 6
            // Assume they continue at H2 pace + 10%
            const projected = h2Avg * 1.1
            clientForecastMonthly.fill(safeNum(projected))
        }
        else if (segment === 'New') {
            // Standard New: Average of active months
            const activeMonths = monthly2025.filter(v => v > 0).length
            const avg = activeMonths > 0 ? total2025 / activeMonths : 0
            clientForecastMonthly.fill(safeNum(avg))
        }
        else if (segment === 'Growing') {
            // Cap growth at +30% to be realistic (unless HighPotential)
            const rate = (total2025 - total2024) / (total2024 || 1)
            const applied = Math.min(rate, 0.3)
            const annual = total2025 * (1 + applied)
            // Distribute via seasonality
            const seasonality = total2025 > 0 ? monthly2025.map(v => v / total2025) : Array(12).fill(1 / 12)
            for (let i = 0; i < 12; i++) clientForecastMonthly[i] = annual * seasonality[i]
        }
        else if (segment === 'Declining') {
            // Continue decline but floor at -20%
            const rate = (total2025 - total2024) / (total2024 || 1)
            const applied = Math.max(rate, -0.2)
            const annual = total2025 * (1 + applied)
            const seasonality = total2025 > 0 ? monthly2025.map(v => v / total2025) : Array(12).fill(1 / 12)
            for (let i = 0; i < 12; i++) clientForecastMonthly[i] = annual * seasonality[i]
        }
        else { // Stable
            const avg = (total2024 + total2025) / 2
            const seasonality = total2025 > 0 ? monthly2025.map(v => v / total2025) : Array(12).fill(1 / 12)
            for (let i = 0; i < 12; i++) clientForecastMonthly[i] = avg * seasonality[i]
        }

        // Aggregate
        const cForecast = sum(clientForecastMonthly)

        // Map 'HighPotential' back to 'New' or 'Growing' for standard buckets if needed, 
        // but keeping separate for reporting is better.
        // Let's add HighPotential to 'New' bucket for summary if UI doesn't support it,
        // or keep separate. The user asked for specific analysis.
        const summarySegment = segment === 'HighPotential' ? 'New' : segment

        contribution[summarySegment].count++
        contribution[summarySegment].rev2025 += total2025
        contribution[summarySegment].forecast2026 += cForecast

        // Also track HighPotential separately if mapped
        if (segment === 'HighPotential') {
            contribution.HighPotential.count++
            contribution.HighPotential.rev2025 += total2025
            contribution.HighPotential.forecast2026 += cForecast
        }

        for (let i = 0; i < 12; i++) predictedMonthlyBase[i] += clientForecastMonthly[i]
    })

    // --- 4. Calibration (YTD) ---
    // Same logic as before
    const today = new Date()
    const currentMonthIndex = today.getMonth()
    let ytdTarget = 0
    for (let i = 0; i < currentMonthIndex; i++) ytdTarget += predictedMonthlyBase[i]
    // Prorate
    const daysInMonth = new Date(currentYear, currentMonthIndex + 1, 0).getDate()
    ytdTarget += (predictedMonthlyBase[currentMonthIndex] * (today.getDate() / daysInMonth))

    let scaleFactor = 1.0
    if (ytdTarget > 0 && audit.rawTotal2026 > 0) {
        scaleFactor = audit.rawTotal2026 / ytdTarget
    }
    // Guardrail
    scaleFactor = Math.min(Math.max(scaleFactor, 0.8), 1.2)

    // Apply Scale
    const finalMonthlyData = []
    let totalForecastFinal = 0

    for (let i = 0; i < 12; i++) {
        let val = predictedMonthlyBase[i] * scaleFactor
        let isForecast = true
        let actual = 0

        if (i < currentMonthIndex) {
            // Actuals
            Object.values(clientMap).forEach(d => actual += d[currentYear][i])
            val = actual
            isForecast = false
        } else if (i === currentMonthIndex) {
            Object.values(clientMap).forEach(d => actual += d[currentYear][i])
            isForecast = true // Show forecast for current month
        }

        finalMonthlyData.push({ month: i + 1, actual, forecast: Math.round(val), isForecast })
        totalForecastFinal += Math.round(val)
    }

    const growthRate = audit.rawTotal2025 > 0
        ? ((totalForecastFinal - audit.rawTotal2025) / audit.rawTotal2025 * 100).toFixed(1)
        : 0

    const analysisSummary = `Analyzed ${Object.keys(clientMap).length} clients. Raw'25: ${(audit.rawTotal2025 / 100000000).toFixed(1)}억. Forecast: ${(totalForecastFinal / 100000000).toFixed(1)}억. HighPotential: ${contribution.HighPotential.count} clients.`

    return {
        forecastYear: currentYear,
        total_amount: totalForecastFinal,
        monthlyData: finalMonthlyData,
        growth_rate: growthRate,
        analysis_summary: analysisSummary,
        calculatedAt: new Date().toISOString(),
        debug: {
            audit,
            contribution,
            stoppedClients: debugLists.stoppedClients.slice(0, 10), // Limit list size
            highPotentialClients: debugLists.highPotentialClients.slice(0, 10),
            scaleFactor
        }
    }
}
