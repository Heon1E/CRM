import React, { useState, useMemo } from 'react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    Cell, ReferenceLine, ResponsiveContainer
} from 'recharts'
import { Target, TrendingUp, Users, UserPlus, MapPin } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useI18n } from '../contexts/I18nContext'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getISOWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.round((d - yearStart) / (7 * 24 * 60 * 60 * 1000)) + 1
}

const totalWeeks = 52

// ---------------------------------------------------------------------------
// Grade helper
// ---------------------------------------------------------------------------
function getGradeInfo(percent) {
    const p = Number(percent) || 0
    if (p >= 110) return { grade: 'S', color: '#6D28D9', barColor: '#8B5CF6', bgColor: '#EDE9FE' }
    if (p >= 100) return { grade: 'A', color: '#B91C1C', barColor: '#DC2626', bgColor: '#FEF2F2' }
    if (p >= 80) return { grade: 'B', color: '#1D4ED8', barColor: '#3B82F6', bgColor: '#DBEAFE' }
    if (p >= 60) return { grade: 'C', color: '#B45309', barColor: '#F59E0B', bgColor: '#FEF3C7' }
    return { grade: 'D', color: '#B91C1C', barColor: '#EF4444', bgColor: '#FEE2E2' }
}

// Check monthly revenue >= 2M KRW
/**
 * KPI 인정 실적 기준
 *
 * 신규고객 발굴 / 단절고객 편입 모두 이 기준을 통과해야 건수로 인정된다.
 * 반기 1천만원 = 연 2천만원과 같은 속도이므로, 둘 중 하나만 넘으면 인정한다.
 * (예: 상반기에 1천만원을 채웠다면 연말까지 기다리지 않고 그 시점에 인정)
 *
 * 기준이 바뀌면 여기만 고치면 된다.
 */
export const KPI_REVENUE_QUALIFY = {
    HALF_YEAR: 10_000_000, // 반기 1천만원
    ANNUAL: 20_000_000,    // 연 2천만원
}

/**
 * 해당 거래처가 그 해에 KPI 인정 실적을 냈는지 판정한다.
 * 예전에는 '어느 한 달이라도 200만원'이었는데 실제 평가 기준과 달랐다.
 */
const checkQualifyingRevenue = (clientId, salesData, year) => {
    let h1 = 0
    let h2 = 0

    ;(salesData || []).forEach(s => {
        if ((s.client_id || s.clientId) !== clientId) return
        const d = new Date(s.sale_date || s.date)
        if (isNaN(d.getTime()) || d.getFullYear() !== year) return
        const amt = Number(s.total_amount ?? s.totalAmount ?? 0) || 0
        if (d.getMonth() < 6) h1 += amt
        else h2 += amt
    })

    return Math.max(h1, h2) >= KPI_REVENUE_QUALIFY.HALF_YEAR
        || (h1 + h2) >= KPI_REVENUE_QUALIFY.ANNUAL
}

/**
 * 단절 판정 기준
 *
 * "거의 매월 주문하던 업체가 3개월 이상 주문이 없으면 단절"
 * '거의 매월'을 어떻게 볼지는 REGULAR_WINDOW / REGULAR_MIN으로 정한다.
 * (기본: 직전 6개월 중 4개월 이상 주문했으면 단골로 본다)
 */
export const CHURN_RULE = {
    GAP_MONTHS: 3,      // 마지막 주문 후 3개월 이상 주문 없음 -> 단절
    REGULAR_WINDOW: 6,  // 단절 직전 6개월을 보고
    REGULAR_MIN: 4,     // 그 중 4개월 이상 주문했으면 '거의 매월'
}

/** 연/월을 하나의 정수로 (2026년 3월 -> 2026*12+2) */
const monthIndex = (d) => d.getFullYear() * 12 + d.getMonth()

/**
 * 거래처의 '주문이 있었던 월' 목록만으로 단절/편입을 판정한다.
 *
 * @param {Set<number>} orderMonths - monthIndex 집합
 * @param {number} nowMonthIdx      - 오늘이 속한 월
 * @param {number} yearStartMonthIdx- 올해 1월
 * @returns {{churned: boolean, reactivated: boolean}}
 *   churned     : 단골이었는데 지금까지 3개월 이상 주문이 없음 (아직 미복귀)
 *   reactivated : 단골이었다가 3개월 이상 끊겼고, 올해 다시 주문함 (편입 성공)
 */
const analyzeChurn = (orderMonths, nowMonthIdx, yearStartMonthIdx) => {
    const ms = [...orderMonths].sort((a, b) => a - b)
    if (ms.length === 0) return { churned: false, reactivated: false }

    // 특정 시점까지의 직전 구간에서 '거의 매월' 주문했는지
    const wasRegularUntil = (endIdx) => {
        const start = endIdx - CHURN_RULE.REGULAR_WINDOW + 1
        return ms.filter(m => m >= start && m <= endIdx).length >= CHURN_RULE.REGULAR_MIN
    }

    // 편입: 주문이 끊긴 구간이 있고, 재개 시점이 올해이며, 끊기기 전엔 단골이었던 경우
    let reactivated = false
    for (let i = 1; i < ms.length; i++) {
        if (ms[i] - ms[i - 1] >= CHURN_RULE.GAP_MONTHS
            && ms[i] >= yearStartMonthIdx
            && wasRegularUntil(ms[i - 1])) {
            reactivated = true
            break
        }
    }

    // 미복귀 단절: 마지막 주문 이후 3개월 이상 지났고, 그 전엔 단골이었던 경우
    const last = ms[ms.length - 1]
    const churned = (nowMonthIdx - last >= CHURN_RULE.GAP_MONTHS) && wasRegularUntil(last)

    return { churned, reactivated }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const KPIWidget = ({ rawSalesData = [], clients = [], activities = [], myAccounts = [], salesRepName }) => {
    const { sales } = useData()
    const { locale } = useI18n()
    const [expandedKPI, setExpandedKPI] = useState(null)

    // Managed client IDs
    const managedClientIds = useMemo(() => {
        if (myAccounts && myAccounts.length > 0) return myAccounts.map(c => c.id)
        const fallbackIds = (clients || []).filter(c => c.sales_rep === '\uc774\ud5cc\uc77c').map(c => c.id)
        return fallbackIds
    }, [clients, salesRepName, myAccounts])

    // currentWeek is needed both in kpiData useMemo AND in JSX header
    const currentWeek = getISOWeekNumber(new Date())

    const kpiData = useMemo(() => {
        const now = new Date()
        const currentYear = now.getFullYear()
        const previousYear = currentYear - 1

        // 1. Revenue
        const totalRevThisYear = rawSalesData
            .filter(s => new Date(s.sale_date || s.date).getFullYear() === currentYear)
            .reduce((sum, s) => sum + (s.total_amount || s.totalAmount || 0), 0)

        const lastYearSamePeriodEnd = new Date(previousYear, now.getMonth(), now.getDate())
        lastYearSamePeriodEnd.setHours(23, 59, 59, 999)

        const totalRevLastYear = rawSalesData
            .filter(s => new Date(s.sale_date || s.date).getFullYear() === previousYear)
            .reduce((sum, s) => sum + (s.total_amount || s.totalAmount || 0), 0)

        const totalRevLastYearSamePeriod = rawSalesData
            .filter(s => {
                const d = new Date(s.sale_date || s.date)
                return d.getFullYear() === previousYear && d <= lastYearSamePeriodEnd
            })
            .reduce((sum, s) => sum + (s.total_amount || s.totalAmount || 0), 0)

        const revenuePercent = totalRevLastYearSamePeriod > 0
            ? Math.round((totalRevThisYear / totalRevLastYearSamePeriod) * 100)
            : 0

        // 2. My sales growth
        const myClientSalesThisYear = rawSalesData
            .filter(s => managedClientIds.includes(s.client_id) && new Date(s.sale_date || s.date).getFullYear() === currentYear)
            .reduce((sum, s) => sum + (s.total_amount || s.totalAmount || 0), 0)

        const myClientSalesLastYearSamePeriod = rawSalesData
            .filter(s => {
                const d = new Date(s.sale_date || s.date)
                return managedClientIds.includes(s.client_id) && d.getFullYear() === previousYear && d <= lastYearSamePeriodEnd
            })
            .reduce((sum, s) => sum + (s.total_amount || s.totalAmount || 0), 0)

        const salesGrowthRate = myClientSalesLastYearSamePeriod > 0
            ? Math.round(((myClientSalesThisYear - myClientSalesLastYearSamePeriod) / myClientSalesLastYearSamePeriod) * 100)
            : 0
        const salesGrowthPercent = Math.min(Math.max(salesGrowthRate + 100, 0), 150)

        // 3. 단절 / 편입 판정
        //
        // 정의: "거의 매월 주문하던 업체가 3개월 이상 주문이 없으면 단절"
        //
        // [버그 수정 이력]
        // 1) 예전에는 '거의 매월 주문하던' 조건이 아예 없어서, 몇 달 전에 딱 한 번
        //    거래한 곳도 단절고객으로 잡혔다.
        // 2) 또 단절 목록을 만들 때 '최근 거래가 있는 곳'을 미리 제외해 놓고
        //    그 목록에서 다시 '최근 거래가 있는 곳'을 찾았다. 교집합이 정의상
        //    항상 비어 있어 이 KPI는 구조적으로 영원히 0건이었다.
        const nowMonthIdx = monthIndex(now)
        const yearStartMonthIdx = currentYear * 12

        const orderMonthsByClient = {}
        rawSalesData.forEach(s => {
            const cid = s.client_id || s.clientId
            if (!managedClientIds.includes(cid)) return
            const d = new Date(s.sale_date || s.date)
            if (isNaN(d.getTime())) return
            if (!orderMonthsByClient[cid]) orderMonthsByClient[cid] = new Set()
            orderMonthsByClient[cid].add(monthIndex(d))
        })

        const reactivatedIds = []
        let dormantCount = 0

        managedClientIds.forEach(id => {
            const { churned, reactivated } = analyzeChurn(
                orderMonthsByClient[id] || new Set(), nowMonthIdx, yearStartMonthIdx
            )
            if (churned) dormantCount++
            // 편입도 신규고객과 동일한 실적 기준을 통과해야 인정한다
            if (reactivated && checkQualifyingRevenue(id, rawSalesData, currentYear)) {
                reactivatedIds.push(id)
            }
        })

        const reactivatedCount = reactivatedIds.length
        const reactivatedNames = reactivatedIds.map(id => {
            const c = clients.find(cl => cl.id === id)
            return c ? c.company : id
        })
        const clientMgmtPercent = Math.min(reactivatedCount * 20, 120)

        // 4. New qualified clients
        const yearStart = new Date(currentYear, 0, 1)
        const newClientIds = managedClientIds.filter(id => {
            const c = clients.find(cl => cl.id === id)
            if (!c) return false
            const created = new Date(c.created_at || c.createdAt || 0)
            return created >= yearStart
        })
        const qualifiedNewIds = newClientIds.filter(id => checkQualifyingRevenue(id, rawSalesData, currentYear))
        const qualifiedNewCount = qualifiedNewIds.length
        const qualifiedNewNames = qualifiedNewIds.map(id => {
            const c = clients.find(cl => cl.id === id)
            return c ? c.company : id
        })
        const newClientPercent = Math.min(Math.round((qualifiedNewCount / 3) * 100), 130)

        // 5. Visit count
        const visitCount = activities.filter(a => {
            return managedClientIds.includes(a.client_id) &&
                ['visit', '\ubc29\ubb38', '\uc601\uc5c5\ubc29\ubb38', 'meeting', '\ubbf8\ud305'].includes((a.activity_type || a.type || '').toLowerCase())
        }).length
        const visitTarget = Math.round(totalWeeks * 2)
        const weekNum = getISOWeekNumber(now)
        const expectedVisitsByNow = (visitTarget / totalWeeks) * weekNum
        const visitPercent = expectedVisitsByNow > 0 ? Math.min(Math.round((visitCount / expectedVisitsByNow) * 100), 130) : 0

        // Weekly trend
        const weeklyTrendData = []
        let cumulativeRevenue = 0

        for (let w = 1; w <= weekNum; w++) {
            const weekStart = new Date(currentYear, 0, 1)
            weekStart.setDate(weekStart.getDate() + (w - 1) * 7 - weekStart.getDay() + 1)
            const weekMonday = new Date(weekStart)
            const weekSunday = new Date(weekMonday)
            weekSunday.setDate(weekSunday.getDate() + 6)

            const weekRevenue = rawSalesData.filter(s => {
                const d = new Date(s.sale_date || s.date)
                return d >= weekMonday && d <= weekSunday
            }).reduce((sum, s) => sum + (s.total_amount || s.totalAmount || 0), 0)

            cumulativeRevenue += weekRevenue

            const cumulativeTarget = (totalRevLastYear / totalWeeks) * w
            const label = `${weekMonday.getMonth() + 1}/${weekMonday.getDate()}~${weekSunday.getMonth() + 1}/${weekSunday.getDate()}`

            weeklyTrendData.push({
                week: label,
                '주간매출': Math.round(weekRevenue / 10000),
                '누적목표': Math.round(cumulativeTarget / 10000),
                '누적실적': Math.round(cumulativeRevenue / 10000),
                weekNum: w,
            })
        }

        // Add visual dummy data if total cumulative revenue is 0 for demo purposes
        if (cumulativeRevenue === 0) {
            weeklyTrendData.forEach((d, i) => {
                d['주간매출'] = Math.round(Math.random() * 800 + 200) + (i * 100);
            })
        }

        return {
            items: [
                {
                    id: 'revenue', category: '\uc815\ub7c9\ud3c9\uac00', name: '\uc218\uc775\uc131 (\uc5f0\ub9e4\ucd9c)', kpi: '\uc804\ub144 \ub300\ube44 \ub9e4\ucd9c \ub2ec\uc131\uc728', weight: 40, unit: '\uc5b5',
                    actual: Math.round(totalRevThisYear / 100_000_000 * 10) / 10,
                    target: Math.round(totalRevLastYear / 100_000_000 * 10) / 10,
                    percent: revenuePercent, icon: Target,
                    detail: `\uc62c\ud574 \uc5f0\ub9e4\ucd9c: ${(totalRevThisYear / 100_000_000).toFixed(1)}\uc5b5\n\uc804\ub144 \ub9e4\ucd9c: ${(totalRevLastYear / 100_000_000).toFixed(1)}\uc5b5\n\uc804\ub144 \ub3d9\uae30: ${(totalRevLastYearSamePeriod / 100_000_000).toFixed(1)}\uc5b5 \ub300\ube44 ${revenuePercent}%`,
                },
                {
                    id: 'sales_growth', category: '\uc815\ub7c9\ud3c9\uac00', name: '\ubd80\ubb38\uae30\uc5ec (\ud310\ub9e4\ud655\ub300)', kpi: '\ub2f4\ub2f9 \uac70\ub798\uc81c \uc804\ub144 \ub300\ube44', weight: 20, unit: '%',
                    actual: salesGrowthRate, target: 0, percent: salesGrowthPercent, icon: TrendingUp,
                    detail: `\ub2f4\ub2f9 \uac70\ub798\uc81c \uc62c\ud574 \ub9e4\ucd9c: ${(myClientSalesThisYear / 10000).toLocaleString()}\ub9cc\uc6d0\n\uc804\ub144 \ub3d9\uae30 \ub9e4\ucd9c: ${(myClientSalesLastYearSamePeriod / 10000).toLocaleString()}\ub9cc\uc6d0`,
                },
                {
                    id: 'client_mgmt', category: '\uc815\uc131\ud3c9\uac00', name: '\uace0\uac1d\uad00\ub9ac', kpi: '\ub2e8\uc808\uace0\uac1d \ud3b8\uc785', weight: 15, unit: '\uac74',
                    actual: reactivatedCount, target: 0, percent: clientMgmtPercent, icon: Users,
                    detail: (reactivatedNames.length > 0
                        ? `\ud3b8\uc785 \uc131\uacf5: ${reactivatedNames.join(', ')}`
                        : '\ubc18\uae30 1\ucc9c\ub9cc\uc6d0(\ub610\ub294 \uc5f0 2\ucc9c\ub9cc\uc6d0) \uae30\uc900\uc744 \ub118\uc740 \ub2e8\uc808\uace0\uac1d \ud3b8\uc785 \uc2e4\uc801 \uc5c6\uc74c')
                        + `\n\uc544\uc9c1 \ubcf5\uadc0\ud558\uc9c0 \uc54a\uc740 \ub2e8\uc808\uace0\uac1d: ${dormantCount}\uacf3`,
                },
                {
                    id: 'new_clients', category: '\uc815\uc131\ud3c9\uac00', name: '\uc2e0\uaddc\uace0\uac1d \ubc1c\uad74', kpi: '\uc2e0\uaddc \uac70\ub798\ucc98 (\ubc18\uae30 1\ucc9c\ub9cc+)', weight: 10, unit: '\uac74',
                    actual: qualifiedNewCount, target: 3, percent: newClientPercent, icon: UserPlus,
                    detail: qualifiedNewNames.length > 0 ? `KPI \uc778\uc815: ${qualifiedNewNames.join(', ')}` : `\ubc18\uae30 1\ucc9c\ub9cc\uc6d0(\ub610\ub294 \uc5f0 2\ucc9c\ub9cc\uc6d0) \uae30\uc900\uc744 \ub118\uc740 \uc2e0\uaddc \uac70\ub798\ucc98 \uc5c6\uc74c`,
                },
                {
                    id: 'visits', category: '\uc815\uc131\ud3c9\uac00', name: '\uc815\uae30\uc801 \ubc29\ubb38', kpi: '\ubbf8\ud305 \ud69f\uc218 (\uc5f0\uac04)', weight: 10, unit: '\uac74',
                    actual: visitCount, target: visitTarget, percent: visitPercent, icon: MapPin,
                    detail: `${weekNum}\uc8fc\ucc28 \uae30\uc900 \ubaa9\ud45c ${Math.round(expectedVisitsByNow)}\uac74 \uc911 ${visitCount}\uac74 \ub2ec\uc131`,
                }
            ],
            weeklyTrend: weeklyTrendData,
        }
    }, [rawSalesData, clients, activities, managedClientIds])

    const overallScore = useMemo(() => {
        const totalWeight = kpiData.items.reduce((sum, item) => sum + item.weight, 0)
        const weightedSum = kpiData.items.reduce((sum, item) => sum + (item.percent * item.weight), 0)
        return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0
    }, [kpiData])

    const overallGrade = getGradeInfo(overallScore)

    return (
        <div className="rounded-xl overflow-hidden mb-6" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            {/* Header */}
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3">
                    <h2 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>KPI Performance</h2>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: 'var(--text-muted)', backgroundColor: 'var(--border)' }}>
                        Week {currentWeek} / {totalWeeks}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{locale === 'en' ? 'Overall:' : '\uc885\ud569:'}</span>
                    <span className="text-xl font-black" style={{ color: 'var(--text-primary)' }}>{overallScore}%</span>
                    <span
                        className="text-[10px] font-black px-2.5 py-1 rounded-full shadow-sm"
                        style={{ backgroundColor: overallGrade.bgColor, color: overallGrade.color }}
                    >
                        {overallGrade.grade}
                    </span>
                </div>
            </div>

            <div className="p-6 space-y-8">
                {/* KPI Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-6">
                    {kpiData.items.map((item) => {
                        const grade = getGradeInfo(item.percent)
                        const Icon = item.icon
                        const isExpanded = expandedKPI === item.id

                        return (
                            <div
                                key={item.id}
                                onClick={() => setExpandedKPI(isExpanded ? null : item.id)}
                                className={`relative group cursor-pointer rounded-xl p-4 transition-all duration-200 border-t-4 ${isExpanded ? 'shadow-lg' : 'hover:-translate-y-0.5 hover:shadow-lg'}`}
                                style={{
                                    backgroundColor: 'var(--bg-card-hover)',
                                    border: '1px solid var(--border)',
                                    borderTopColor: grade.color,
                                    boxShadow: isExpanded ? `0 0 0 1px ${grade.color}40` : undefined
                                }}
                            >
                                <div className="relative z-10">
                                    {/* Category Badge */}
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                                            {item.category}
                                        </span>
                                        <span className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>Weight: {item.weight}</span>
                                    </div>

                                    {/* Name & Icon */}
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2 rounded-lg" style={{ backgroundColor: `${grade.color}20` }}>
                                            <Icon className="w-4 h-4" style={{ color: grade.color }} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
                                            <p className="text-[10px] mt-0.5 font-medium" style={{ color: 'var(--text-secondary)' }}>{item.kpi}</p>
                                        </div>
                                    </div>

                                    {/* Score */}
                                    <div className="flex items-end justify-between mb-3">
                                        <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{item.percent}%</span>
                                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md"
                                            style={{ backgroundColor: `${grade.color}20`, color: grade.color }}>
                                            {grade.grade}
                                        </span>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="w-full h-1.5 mb-3 overflow-hidden rounded-sm" style={{ backgroundColor: 'var(--border)' }}>
                                        <div
                                            className="h-full transition-all duration-700 ease-out rounded-sm"
                                            style={{ width: `${Math.min(item.percent, 120) / 1.2}%`, backgroundColor: grade.barColor }}
                                        />
                                    </div>

                                    {/* Actual vs Target */}
                                    <div className="flex justify-between text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                                        <span>{locale === 'en' ? 'Actual' : '\uc2e4\uc801'} <b style={{ color: 'var(--text-primary)' }}>{typeof item.actual === 'number' ? item.actual.toLocaleString() : item.actual}{item.unit}</b></span>
                                        {item.target > 0 && <span>{locale === 'en' ? 'Target' : '\ubaa9\ud45c'} {item.target}</span>}
                                    </div>

                                    {/* Expanded Detail */}
                                    {isExpanded && (
                                        <div className="mt-4 pt-3 -mx-4 -mb-4 px-4 pb-4 rounded-b-xl text-[11px] leading-relaxed"
                                            style={{ borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
                                            <p className="whitespace-pre-line">{item.detail}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Weekly Trend Chart */}
                <div className="rounded-lg p-6" style={{ backgroundColor: 'var(--bg-card-hover)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Weekly Revenue Trend</h3>
                            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>vs Annual Target Pace</p>
                        </div>
                        <div className="flex gap-4 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--border-light)' }}></div>Previous</div>
                            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--accent)' }}></div>Current</div>
                        </div>
                    </div>
                    <div className="h-[160px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={kpiData.weeklyTrend} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: '#555E6E', fontSize: 11 }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#555E6E', fontSize: 11 }} tickFormatter={(v) => v >= 10000 ? `${(v / 10000).toFixed(0)}\uc5b5` : `${v.toLocaleString()}`} />
                                <Tooltip
                                    cursor={{ fill: 'rgba(16,185,129,0.06)' }}
                                    contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '12px' }}
                                    formatter={(value, name) => [`${value.toLocaleString()}\ub9cc\uc6d0`, name]}
                                />
                                <Bar dataKey="주간매출" radius={[4, 4, 0, 0]} barSize={40}>
                                    {kpiData.weeklyTrend.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={index === kpiData.weeklyTrend.length - 1 ? '#DC2626' : '#E2E8F0'}
                                        />
                                    ))}
                                </Bar>
                                <ReferenceLine y={0} stroke="var(--border)" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default KPIWidget
