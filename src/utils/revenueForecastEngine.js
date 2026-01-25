/**
 * AI Revenue Forecast Logic Engine (v6.1 - Validation & Tuning)
 * 
 * Changes:
 * - Fixed "Scale Factor: undefined" bug by separating raw vs final variables.
 * - Explicit Logic for HighPotential: Annualized H2 * 1.1, capped at 3x Total 2025.
 * - Explicit Logic for Stopped: <30% of peak -> residual or 0.
 * - Detailed Debug: Added growth ratios and rule descriptions to debug output.
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
    // Reporting Structures with explicit fields for user validation
    const segments = ['Growing', 'Stable', 'Declining', 'Churned', 'New', 'HighPotential']
    const contribution = {}
    segments.forEach(s => {
        contribution[s] = {
            count: 0,
            rev2025: 0,
            forecast2026: 0,
            growthRatio: 0 // to be calculated at end
        }
    })

    const debugLists = {
        stoppedClients: [],
        highPotentialClients: []
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
        let ruleDescription = ""

        // --- Logic: Classification ---
        const peakHistory = Math.max(total2023, total2024)

        // 1. Churned / Sharp Decline
        if (peakHistory > 100000 && total2025 <= 0.3 * peakHistory) {
            segment = 'Churned'
            const type = total2025 < 100000 ? 'Stopped' : 'Reduced'
            if (debugLists.stoppedClients.length < 20) {
                debugLists.stoppedClients.push({
                    cid, total2024, total2025, type, segment
                })
            }
        }
        // 2. New Client detection
        else if (total2023 === 0 && (total2024 > 0 || total2025 > 0)) {
            segment = 'New'
            // Check High Potential (H2 vs H1 in 2025)
            const h1 = sum(monthly2025.slice(0, 6))
            const h2 = sum(monthly2025.slice(6, 12))
            // Criteria: H2 > H1*1.5 AND H2 is significant
            if (h2 > h1 * 1.5 && h2 > 1000000) {
                segment = 'HighPotential'
                // Debug Info
                const growth = h1 > 0 ? (h2 / h1).toFixed(1) : "New(H2)"
                if (debugLists.highPotentialClients.length < 20) {
                    debugLists.highPotentialClients.push({
                        cid, h1, h2, growth
                    })
                }
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
            // Logic: If stopped (<100k), 0. If reduced, keep low residual flat.
            const residual = total2025 > 100000 ? total2025 : 0
            clientForecastMonthly.fill(safeNum(residual / 12))
            ruleDescription = residual === 0 ? "Zeroed (Stopped)" : "Flat Residual (Reduced)"
        }
        else if (segment === 'HighPotential') {
            // Logic: Annualize H2 * 1.1 (Momentum), but Cap at 3x Total 2025 (Safety)
            const h2Avg = sum(monthly2025.slice(6, 12)) / 6
            let annualProjected = h2Avg * 12 * 1.1

            // Cap: Max 300% of 2025 total (e.g. if they started only in Dec, don't exaggerate too much)
            const cap = total2025 * 3.0
            if (annualProjected > cap) {
                annualProjected = cap
                ruleDescription = "H2 RunRate * 1.1 (Capped 3x)"
            } else {
                ruleDescription = "H2 RunRate * 1.1"
            }

            clientForecastMonthly.fill(safeNum(annualProjected / 12))
        }
        else if (segment === 'New') {
            // Avg of active months
            const activeMonths = monthly2025.filter(v => v > 0).length
            const avg = activeMonths > 0 ? total2025 / activeMonths : 0
            clientForecastMonthly.fill(safeNum(avg))
            ruleDescription = "Avg Active Months"
        }
        else if (segment === 'Growing') {
            // Cap growth at +30%
            const rate = (total2025 - total2024) / (total2024 || 1)
            const applied = Math.min(rate, 0.3)
            const annual = total2025 * (1 + applied)

            const seasonality = total2025 > 0 ? monthly2025.map(v => v / total2025) : Array(12).fill(1 / 12)
            for (let i = 0; i < 12; i++) clientForecastMonthly[i] = annual * seasonality[i]
            ruleDescription = `Growth ${(applied * 100).toFixed(0)}% (Capped)`
        }
        else if (segment === 'Declining') {
            // Floor decline at -20%
            const rate = (total2025 - total2024) / (total2024 || 1)
            const applied = Math.max(rate, -0.2)
            const annual = total2025 * (1 + applied)

            const seasonality = total2025 > 0 ? monthly2025.map(v => v / total2025) : Array(12).fill(1 / 12)
            for (let i = 0; i < 12; i++) clientForecastMonthly[i] = annual * seasonality[i]
            ruleDescription = `Decline ${(applied * 100).toFixed(0)}% (Floored)`
        }
        else { // Stable
            const avg = (total2024 + total2025) / 2
            const seasonality = total2025 > 0 ? monthly2025.map(v => v / total2025) : Array(12).fill(1 / 12)
            for (let i = 0; i < 12; i++) clientForecastMonthly[i] = avg * seasonality[i]
            ruleDescription = "Avg '24-'25"
        }

        // Aggregate
        const cForecast = sum(clientForecastMonthly)
        const summarySegment = segment // Keep explicit segments

        contribution[summarySegment].count++
        contribution[summarySegment].rev2025 += total2025
        contribution[summarySegment].forecast2026 += cForecast

        // Update debug list with forecast
        const stoppedIdx = debugLists.stoppedClients.findIndex(c => c.cid === cid)
        if (stoppedIdx !== -1) {
            debugLists.stoppedClients[stoppedIdx].forecast2026 = cForecast
            debugLists.stoppedClients[stoppedIdx].rule = ruleDescription
        }
        const hpIdx = debugLists.highPotentialClients.findIndex(c => c.cid === cid)
        if (hpIdx !== -1) {
            debugLists.highPotentialClients[hpIdx].forecast2026 = cForecast
            debugLists.highPotentialClients[hpIdx].rule = ruleDescription
        }

        for (let i = 0; i < 12; i++) predictedMonthlyBase[i] += clientForecastMonthly[i]
    })

    // Calculate Growth Ratios for Report
    Object.keys(contribution).forEach(k => {
        const item = contribution[k]
        item.growthRatio = item.rev2025 > 0 ? (item.forecast2026 / item.rev2025).toFixed(2) : "N/A"
    })

    // --- 4. Calibration (YTD) ---
    const today = new Date()
    const currentMonthIndex = today.getMonth()
    let ytdTarget = 0
    for (let i = 0; i < currentMonthIndex; i++) ytdTarget += predictedMonthlyBase[i]

    const daysInMonth = new Date(currentYear, currentMonthIndex + 1, 0).getDate()
    ytdTarget += (predictedMonthlyBase[currentMonthIndex] * (today.getDate() / daysInMonth))

    let rawScale = 1.0
    if (ytdTarget > 0 && audit.rawTotal2026 > 0) {
        rawScale = audit.rawTotal2026 / ytdTarget
    }

    // Safety clamp 
    let finalScale = safeNum(rawScale, 1.0)

    // Incomplete data guard (if YTD is < 10% of target, assume missing data and do not scale down)
    let incompleteFlag = false
    if (ytdTarget > 10000000 && audit.rawTotal2026 < (ytdTarget * 0.1)) {
        finalScale = 1.0
        incompleteFlag = true
    } else {
        finalScale = Math.min(Math.max(finalScale, 0.8), 1.2)
    }

    // Apply Final Scale
    const finalMonthlyData = []
    let totalForecastFinal = 0

    for (let i = 0; i < 12; i++) {
        let val = predictedMonthlyBase[i] * finalScale
        let isForecast = true
        let actual = 0

        if (i < currentMonthIndex) {
            Object.values(clientMap).forEach(d => actual += d[currentYear][i])
            val = actual
            isForecast = false
        } else if (i === currentMonthIndex) {
            Object.values(clientMap).forEach(d => actual += d[currentYear][i])
            isForecast = true
        }

        const safeVal = Math.round(safeNum(val))
        finalMonthlyData.push({ month: i + 1, actual, forecast: safeVal, isForecast })
        totalForecastFinal += safeVal
    }

    const growthRate = audit.rawTotal2025 > 0
        ? ((totalForecastFinal - audit.rawTotal2025) / audit.rawTotal2025 * 100).toFixed(1)
        : 0

    const analysisSummary = `Analyzed ${Object.keys(clientMap).length} clients. Raw'25: ${(audit.rawTotal2025 / 100000000).toFixed(1)}억. Forecast: ${(totalForecastFinal / 100000000).toFixed(1)}억. HighPot: ${contribution.HighPotential.count}.`

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
            stoppedClients: debugLists.stoppedClients,
            highPotentialClients: debugLists.highPotentialClients,
            rawScale: rawScale,         // Explicit raw
            clampedScale: finalScale,   // Explicit final
            incompleteFlag
        }
    }
}
