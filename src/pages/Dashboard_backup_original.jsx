import React, { useState, useEffect, useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
  Sector,
} from 'recharts'
import { useNavigate } from 'react-router-dom'
import {
  Calendar,
  Phone,
  Mail,
  MessageCircle,
  DollarSign,
  RefreshCw,
  Users,
  Store,
  Lock,
  Unlock,
  TrendingUp,
  TrendingDown,
  CheckCircle,
} from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useDashboardData } from '../hooks/useDashboardData'
import { supabase } from '../lib/supabase'
import MetricCard from '../components/MetricCard'
import EditActivityModal from '../components/EditActivityModal'
import AppInstallGuide from '../components/AppInstallGuide'
import { formatActivityText, formatActivityTitle } from '../utils/koreanJosa'
import { formatDate, formatCurrency, formatKoreanCurrency } from '../utils/formatters'
import * as clientStatus from '../utils/clientStatus'
import ctaIllustration from '../assets/illustrations/cta-premium.svg'
import placeholderIllustration from '../assets/illustrations/placeholder-illustration.svg'
import emptyStateIllustration from '../assets/illustrations/empty-state.svg'
import kakaoRyan from '../assets/kakao-ryan.png'
import kakaoMuzi from '../assets/kakao-muzi.png'
import kakaoApeach from '../assets/kakao-apeach.png'
import kakaoChunsi from '../assets/kakao-chunsik.png'
import kakaoFrodo from '../assets/kakao-frodo.png'
import kakaoNeo from '../assets/kakao-neo.png'
import kakaoTube from '../assets/kakao-tube.png'
import kakaoJayG from '../assets/kakao-jayg.png'

const Dashboard = () => {
  const { activities, clients, getStats, getWeeklySalesData, loading } = useData()
  const {
    user,
    getUserSalesRep,
    myAccounts,
    myMonthlySales,
    myWeeklySalesData,
    rawSalesData,
    salesLoading,
    upcomingEvents,
    // totalClientsCount, // Removed to avoid conflict with locally calculated totalClientsCount
    topClients
  } = useDashboardData()

  const navigate = useNavigate()
  const [editingActivityId, setEditingActivityId] = useState(null)
  const [activeSalesTab, setActiveSalesTab] = useState('revenue')
  const [activePipelineSlice, setActivePipelineSlice] = useState(0)
  const [isPipelineLocked, setIsPipelineLocked] = useState(false)
  const bentoCardClass =
    'card bg-white shadow-sm rounded-2xl border border-slate-100 hover:shadow-md transition-all duration-300'

  useEffect(() => {
    if (!getUserSalesRep) {
      setActiveSalesTab('revenue')
    }
  }, [getUserSalesRep])


  const averageDeal = rawSalesData && rawSalesData.length > 0
    ? Math.round((rawSalesData.reduce((sum, sale) => sum + (Number(sale.total_amount ?? sale.totalAmount ?? 0) || 0), 0) / rawSalesData.length) || 0)
    : 0

  const monthRange = (baseDate) => {
    const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1)
    const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0, 23, 59, 59, 999)
    return { start, end }
  }

  const getTrendPercent = (currentValue, previousValue) => {
    if (previousValue === 0) {
      return currentValue > 0 ? 100 : 0
    }
    return Math.round(((currentValue - previousValue) / previousValue) * 100)
  }

  const now = new Date()

  // 날짜 관련 유틸리티 (단순화: 월 전체 비교)
  const buildYoYRange = (baseDate) => {
    // 해당 월의 1일
    const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1)
    // 해당 월의 마지막 날 (다음달 0일)
    const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0, 23, 59, 59, 999)
    return { start, end }
  }

  const currentRange = buildYoYRange(now)
  const previousYearDate = new Date(now.getFullYear() - 1, now.getMonth(), 1)
  const previousYearRange = buildYoYRange(previousYearDate)

  const isInRange = (dateValue, range) => {
    if (!dateValue) return false
    const parsed = new Date(dateValue)
    if (Number.isNaN(parsed.getTime())) return false
    return parsed >= range.start && parsed <= range.end
  }

  const isActiveClient = (client) => clientStatus.isActiveClientStatus(client?.status)

  // 일반 통계 (stats) 초기화
  const stats = getStats()

  // 매출 데이터 (Sales Data)
  const currentMonthSales = (rawSalesData || []).filter((sale) =>
    isInRange(sale.sale_date || sale.date || sale.created_at, currentRange)
  )
  const previousYearMonthSales = (rawSalesData || []).filter((sale) =>
    isInRange(sale.sale_date || sale.date || sale.created_at, previousYearRange)
  )

  const currentMonthSalesTotal = currentMonthSales.reduce(
    (sum, sale) => sum + (Number(sale.total_amount ?? sale.totalAmount ?? 0) || 0),
    0
  )
  const previousYearSalesTotal = previousYearMonthSales.reduce(
    (sum, sale) => sum + (Number(sale.total_amount ?? sale.totalAmount ?? 0) || 0),
    0
  )
  const salesYoYPercent = getTrendPercent(currentMonthSalesTotal, previousYearSalesTotal)

  const aggregatedMonthlyTrend = useMemo(() => {
    console.log('Processing rawSalesData for chart. Data length:', rawSalesData?.length)
    const points = []
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1) // Last 12 months
    for (let i = 0; i < 12; i += 1) {
      const date = new Date(start.getFullYear(), start.getMonth() + i, 1)
      const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const range = monthRange(date)
      const totalRevenue = (rawSalesData || []).reduce((sum, sale) => {
        const saleDate = sale.sale_date || sale.date || sale.created_at
        if (!isInRange(saleDate, range)) return sum
        return sum + (Number(sale.total_amount ?? sale.totalAmount ?? 0) || 0)
      }, 0)
      points.push({
        monthStr,
        totalRevenue,
      })
    }
    return points
  }, [rawSalesData, now])

  // 1. Total Clients (전체 고객사): 2023년 이후 매출이 1건이라도 있는 고객사
  // Logic: Count unique Client IDs from sales where date >= '2023-01-01'
  const salesSince2023 = (rawSalesData || []).filter((sale) => {
    const d = new Date(sale.sale_date || sale.date || sale.created_at)
    return d >= new Date('2023-01-01')
  })
  const totalClientIds = new Set(salesSince2023.map(s => s.client_id || s.clientId))
  const totalClientsCount = totalClientIds.size

  // YoY for Total Clients (Compare with status 1 year ago, still starting from 2023)
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
  const salesForPrevTotal = salesSince2023.filter(s => {
    const d = new Date(s.sale_date || s.date || s.created_at)
    return d <= oneYearAgo
  })
  const prevTotalClientIds = new Set(salesForPrevTotal.map(s => s.client_id || s.clientId))
  const clientsYoYPercent = getTrendPercent(totalClientsCount, prevTotalClientIds.size)


  // 2. Active Clients (활성 고객사): 최근 1년간 매출이 1건이라도 발생한 고객사
  const oneYearAgoDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
  const activeSales = (rawSalesData || []).filter((sale) => {
    const d = new Date(sale.sale_date || sale.date || sale.created_at)
    return d >= oneYearAgoDate && d <= now
  })
  const activeClientIds = new Set(activeSales.map(s => s.client_id || s.clientId))
  const currentActiveClientsCount = activeClientIds.size

  // YoY for Active Clients (Active count at 1 year ago = Sales in [Now-2y, Now-1y])
  const twoYearsAgoDate = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate())
  const prevActiveSales = (rawSalesData || []).filter((sale) => {
    const d = new Date(sale.sale_date || sale.date || sale.created_at)
    return d >= twoYearsAgoDate && d <= oneYearAgoDate
  })
  const prevActiveClientIds = new Set(prevActiveSales.map(s => s.client_id || s.clientId))
  const activeClientsYoYPercent = getTrendPercent(currentActiveClientsCount, prevActiveClientIds.size)


  // 4. Churned Clients (단절 고객사): 2023년 이후 매출 있음(Total) AND 최근 1년 매출 없음(Not Active)
  // Logic: Total Set - Active Set
  const churnedClientIds = new Set([...totalClientIds].filter(x => !activeClientIds.has(x)))
  const currentChurnedCount = churnedClientIds.size

  // YoY for Churned (Churned 1 year ago = Total(at 1y ago) - Active(at 1y ago))
  // Total(at 1y ago) is prevTotalClientIds
  // Active(at 1y ago) is prevActiveClientIds
  const prevChurnedClientIds = new Set([...prevTotalClientIds].filter(x => !prevActiveClientIds.has(x)))
  const prevChurnedCount = prevChurnedClientIds.size
  const churnedYoYPercent = getTrendPercent(currentChurnedCount, prevChurnedCount)

  // 3. Revenue is already calculated as salesYoYPercent logic above (Monthly YoY)
  // But we need to rename label later.

  // 4. Deals (Volume) replaced by Churned Logic
  // So we remove deals calculation here.


  const quickMetrics = [
    {
      label: '전체 고객사',
      value: (totalClientsCount || 0).toLocaleString(),
      icon: Users,
      iconBg: 'bg-pastel-teal',
      iconColor: 'text-ink-teal',
      cardBg: 'bg-gradient-to-br from-blue-50/80 to-white',
      trend: {
        direction: clientsYoYPercent !== null && clientsYoYPercent >= 0 ? 'up' : 'down',
        value: clientsYoYPercent !== null ? `${Math.abs(clientsYoYPercent)}%` : '0%',
        note: '전년 대비',
      },
    },
    {
      label: '활성 고객사',
      value: (currentActiveClientsCount || 0).toLocaleString(),
      icon: Store,
      iconBg: 'bg-pastel-neutral',
      iconColor: 'text-slate-600',
      cardBg: 'bg-gradient-to-br from-stone-50/80 to-white',
      trend: {
        direction: activeClientsYoYPercent !== null && activeClientsYoYPercent >= 0 ? 'up' : 'down',
        value: activeClientsYoYPercent !== null ? `${Math.abs(activeClientsYoYPercent)}%` : '0%',
        note: '전년 대비',
      },
    },
    {
      label: '이번달 매출액',
      value: (() => {
        const value = currentMonthSalesTotal || 0
        const major = Math.floor(value / 100000000)
        const minor = Math.round((value % 100000000) / 10000000)
        if (major === 0 && minor === 0) return '0원'
        if (minor > 0) return `${major}억 ${minor}천만원`
        return `${major}억원`
      })(),
      icon: DollarSign,
      iconBg: 'bg-pastel-green',
      iconColor: 'text-ink-green',
      cardBg: 'bg-gradient-to-br from-teal-50/80 to-white',
      trend: {
        direction: salesYoYPercent !== null && salesYoYPercent >= 0 ? 'up' : 'down',
        value: salesYoYPercent !== null ? `${Math.abs(salesYoYPercent).toFixed(1)}%` : '0.0%',
        note: '전년 동월 대비',
      },
    },
    {
      label: '단절 고객사',
      value: `${currentChurnedCount}`,
      icon: CheckCircle, // Changed Icon to CheckCircle or similar
      iconBg: 'bg-pastel-purple',
      iconColor: 'text-ink-purple',
      cardBg: 'bg-gradient-to-br from-purple-50/80 to-white',
      trend: {
        direction: churnedYoYPercent !== null && churnedYoYPercent >= 0 ? 'up' : 'down',
        value: churnedYoYPercent !== null ? `${Math.abs(churnedYoYPercent)}%` : '0%',
        note: '전년 동기 대비',
      },
    },
  ]

  // Top 3 Revenue Clients (Last 1 Year)
  const top3RevenueClients = useMemo(() => {
    const clientRevenueMap = {}
    // activeSales contains sales from [Now-1y, Now]
    activeSales.forEach(sale => {
      const clientId = sale.client_id || sale.clientId
      const amount = Number(sale.total_amount ?? sale.totalAmount ?? 0) || 0
      if (!clientId) return
      if (!clientRevenueMap[clientId]) {
        const clientObj = (clients || []).find(c => c.id === clientId)
        clientRevenueMap[clientId] = {
          id: clientId,
          name: clientObj?.company || clientObj?.name || 'Unknown Client',
          total: 0
        }
      }
      clientRevenueMap[clientId].total += amount
    })
    return Object.values(clientRevenueMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)
  }, [activeSales, clients])

  // Helper to extract company initial
  const getCompanyInitial = (name) => {
    const cleanName = name.replace(/\(주\)|\(유\)|주식회사|유한회사|\s/g, '')
    return cleanName.charAt(0) || '?'
  }

  // Fastest Growing Clients (MoM)
  const topGrowthClients = useMemo(() => {
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

    const clientStats = {}

    // 1. Reduce all sales data to stats per client
    if (rawSalesData) {
      rawSalesData.forEach(sale => {
        const clientId = sale.client_id || sale.clientId
        if (!clientId) return
        const d = new Date(sale.sale_date || sale.date || sale.created_at)
        const amount = Number(sale.total_amount ?? sale.totalAmount ?? 0) || 0

        if (!clientStats[clientId]) {
          const clientObj = (clients || []).find(c => c.id === clientId)
          clientStats[clientId] = {
            id: clientId,
            name: clientObj?.company || clientObj?.name || 'Unknown',
            role: clientObj?.industry || clientObj?.type || 'Enterprise',
            currentMonth: 0,
            lastMonth: 0,
            historicalBeforeCurrent: 0, // Sales before this month
          }
        }

        if (d >= currentMonthStart) {
          clientStats[clientId].currentMonth += amount
        } else {
          clientStats[clientId].historicalBeforeCurrent += amount
          // Also track last month specifically for MoM calc
          if (d >= lastMonthStart && d <= lastMonthEnd) {
            clientStats[clientId].lastMonth += amount
          }
        }
      })
    }

    const growthList = Object.values(clientStats)
      .filter(c => c.currentMonth > 0) // Must have sales this month
      .map(c => {
        // True New Client: Has sales this month, but ZERO historical sales before this month
        const isTrueNew = c.historicalBeforeCurrent === 0

        let growthRate = 0
        if (c.lastMonth > 0) {
          growthRate = ((c.currentMonth - c.lastMonth) / c.lastMonth) * 100
        } else if (!isTrueNew && c.lastMonth === 0) {
          // Resurrection (had sales long ago, none last month, sales now)
          // Treat as 100% or high number, but lower priority than True New?
          // User asked for "True New" to be specifically "No historical sales"
          growthRate = 100
        }

        return {
          ...c,
          isTrueNew,
          growthRate,
          amount: c.currentMonth
        }
      })
      .sort((a, b) => {
        // Priority 1: True New Clients (Sort by Amount Desc)
        if (a.isTrueNew && !b.isTrueNew) return -1
        if (!a.isTrueNew && b.isTrueNew) return 1
        if (a.isTrueNew && b.isTrueNew) return b.amount - a.amount

        // Priority 2: High Growth Rate Desc
        return b.growthRate - a.growthRate
      })
      .slice(0, 4)

    return growthList
  }, [rawSalesData, clients, now])

  // My Activities Logic
  const upcomingActivities = useMemo(() => {
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)

    // 1. Next Scheduled Events (from upcomingEvents)
    const nextSchedules = (upcomingEvents || []).map(e => ({
      ...e,
      displayDate: new Date(e.scheduleDate),
      isNextSchedule: true
    })).filter(e => e.displayDate >= startOfToday)

    // 2. Future/Today Logged Activities (from activities)
    const futureLogs = (activities || []).filter(a => {
      const d = new Date(a.date)
      return a.status !== 'Done' && d >= startOfToday
    }).map(a => ({
      ...a,
      displayDate: new Date(a.date),
      isNextSchedule: false
    }))

    // Combine and Sort
    return [...nextSchedules, ...futureLogs]
      .sort((a, b) => a.displayDate - b.displayDate)
      .slice(0, 3)
  }, [activities, upcomingEvents, now])

  const recentHistoryActivities = useMemo(() => {
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)

    return (activities || [])
      .filter(a => {
        const d = new Date(a.date)
        // Done OR Date is Past
        return a.status === 'Done' || d < startOfToday
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 3)
  }, [activities, now])

  const getActivityIcon = (type) => {
    switch (type) {
      case 'Call': return Phone
      case 'Meeting': return Users
      case 'Email': return Mail
      default: return Calendar
    }
  }

  const RenderActivityItem = ({ activity, isHistory = false }) => {
    const Icon = getActivityIcon(activity.type)
    const date = activity.displayDate || new Date(activity.date)
    const today = new Date(now)
    const isToday = date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    const isNextSchedule = activity.isNextSchedule

    const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`

    return (
      <div
        key={`${activity.id}-${isNextSchedule ? 'next' : 'log'}`}
        onClick={() => setEditingActivityId(activity.id)}
        className={`flex items-start gap-3 border-b border-stone-100 last:border-0 pb-3 last:pb-0 cursor-pointer hover:bg-slate-50 transition-colors ${isToday && !isHistory ? 'bg-amber-50/60 -mx-3 px-3 py-2.5 rounded-xl border-none shadow-sm ring-1 ring-amber-100/50 hover:bg-amber-100/60' : ''}`}
      >
        <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isHistory ? 'bg-slate-100 text-slate-400' : isToday ? 'bg-amber-100 text-amber-600' : 'bg-indigo-50 text-indigo-600'}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold truncate ${isHistory ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                {activity.title}
              </span>
              {isToday && !isHistory && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-600 animate-pulse">TODAY</span>
              )}
            </div>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${activity.status === 'Done' && !isNextSchedule ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
              }`}>
              {isNextSchedule ? '예정' : activity.status}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className={isToday && !isHistory ? 'text-amber-700 font-bold' : ''}>{dateStr}</span>
            <span>•</span>
            <span className="truncate">{activity.clientName || 'No Client'}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden">
      {/* Decorative KakaoTalk Characters - Top Right */}
      <img
        src={kakaoCharacters}
        alt=""
        className="absolute top-4 right-4 w-24 h-24 md:w-32 md:h-32 opacity-20 pointer-events-none z-0 animate-pulse"
        style={{ animationDuration: '3s' }}
      />

      {/* Decorative KakaoTalk Characters - Bottom Left */}
      <img
        src={kakaoCharacters}
        alt=""
        className="absolute bottom-20 left-8 w-20 h-20 md:w-28 md:h-28 opacity-15 pointer-events-none z-0"
        style={{ transform: 'rotate(-15deg)' }}
      />

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto relative z-10">
        {/* Header removed as per user request to save space */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end md:hidden">
          <AppInstallGuide />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {quickMetrics.map((metric) => {
            const Icon = metric.icon
            return (
              <div
                key={metric.label}
                className={`${metric.cardBg} rounded-3xl shadow-card p-6 flex items-center gap-4`}
              >
                <div className={`w-12 h-12 rounded-xl ${metric.iconBg} ${metric.iconColor} flex items-center justify-center`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm text-slate-500 font-medium">{metric.label}</p>
                  <p className="text-4xl font-extrabold text-slate-900">{metric.value}</p>
                  <div className="mt-3 text-xs font-medium text-slate-500 flex items-center gap-1.5">
                    <span className={metric.trend.direction === 'up' ? 'text-red-500 font-bold' : 'text-blue-500 font-bold'}>
                      {metric.trend.direction === 'up' ? '▲' : '▼'} {metric.trend.value}
                    </span>
                    <span className="text-slate-400">{metric.trend.note}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="grid grid-cols-12 gap-6 items-stretch">
          <div className="col-span-12 lg:col-span-8">
            <div className="h-[400px] bg-white rounded-3xl p-6 shadow-card flex flex-col relative overflow-hidden">
              {/* Character decoration in chart */}
              <img
                src={kakaoCharacters}
                alt=""
                className="absolute bottom-2 right-2 w-16 h-16 opacity-10 pointer-events-none"
              />
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-[0.2em]">Revenue</p>
                  <h3 className="text-base md:text-lg font-bold text-slate-800">Revenue Trend</h3>
                  <p className="text-xs text-slate-500 font-medium mt-1">최근 1년 추이 (Past 12 Months)</p>
                </div>
              </div>
              {aggregatedMonthlyTrend.length > 0 ? (
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={aggregatedMonthlyTrend} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                      <defs>
                        <linearGradient id="style5Revenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6CB8B0" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#6CB8B0" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#E2E8F0" vertical={false} />
                      <XAxis
                        dataKey="monthStr"
                        tickFormatter={(value) => {
                          const parsed = value?.toString?.() || ''
                          if (parsed.includes('-')) {
                            // "YYYY-MM" -> "MM월"
                            const [, month] = parsed.split('-')
                            return `${parseInt(month)}월`
                          }
                          return parsed
                        }}
                        stroke="#CBD5E1"
                        tick={{ fill: '#94A3B8', fontSize: 13, fontWeight: 500 }}
                        axisLine={false}
                        tickLine={false}
                        dy={10}
                        interval={0}
                      />
                      <YAxis
                        stroke="#CBD5E1"
                        tick={{ fill: '#94A3B8', fontSize: 12 }}
                        tickFormatter={(value) => formatCurrency(value)}
                        width={70}
                        domain={[0, 'auto']}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#FFFFFF',
                          border: '1px solid #E2E8F0',
                          borderRadius: '8px',
                          fontSize: '14px',
                          padding: '8px 12px',
                          color: '#1F2937',
                        }}
                        formatter={(value) => [formatCurrency(Number(value)), '매출']}
                        labelStyle={{ fontWeight: 'bold', marginBottom: '4px', color: '#1F2937' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="totalRevenue"
                        stroke="#6CB8B0"
                        strokeWidth={3}
                        fill="url(#style5Revenue)"
                        fillOpacity={1}
                        name="매출"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center text-slate-500 text-sm md:text-base gap-3">
                  <img
                    src={emptyStateIllustration}
                    alt="No data"
                    className="w-full max-w-[220px] h-auto"
                  />
                  <span>이번 달 매출 데이터가 없습니다.</span>
                </div>
              )}
            </div>
          </div>
          <div className="col-span-12 lg:col-span-4">
            <div className="bg-gradient-teal-soft rounded-3xl p-6 shadow-card h-[400px] flex flex-col relative overflow-hidden">
              {/* Character decoration in top clients */}
              <img
                src={kakaoCharacters}
                alt=""
                className="absolute top-3 right-3 w-14 h-14 opacity-15 pointer-events-none"
                style={{ transform: 'rotate(10deg)' }}
              />
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-[0.2em]">Top Revenue Clients</p>
                  <h3 className="text-base md:text-lg font-bold text-slate-800">
                    최근 1년 매출 Top 3
                  </h3>
                </div>
              </div>
              <div className="flex flex-col flex-1 justify-center gap-4">
                {top3RevenueClients.length > 0 ? (
                  top3RevenueClients.map((client, index) => (
                    <div key={client.id} className="flex items-center justify-between p-3 bg-white/50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm ${index === 0 ? 'bg-amber-400' : index === 1 ? 'bg-slate-400' : 'bg-orange-700'
                          }`}>
                          {index + 1}
                        </div>
                        <span className="font-bold text-slate-700 text-sm truncate max-w-[120px]">
                          {client.name}
                        </span>
                      </div>
                      <span className="font-bold text-slate-900 text-sm">
                        {formatKoreanCurrency(client.total)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-slate-500 text-sm">
                    데이터가 없습니다.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-7">
            <div className="bg-gradient-to-br from-stone-50/70 to-white rounded-3xl p-6 shadow-card">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-[0.2em]">Growth</p>
                  <h3 className="text-base md:text-lg font-bold text-slate-800">Fastest Growing Clients</h3>
                </div>
              </div>
              <div className="space-y-4">
                {topGrowthClients.length > 0 ? (
                  topGrowthClients.map((client, index) => (
                    <div
                      key={client.id || index}
                      className="flex items-center justify-between border-b border-stone-200/70 py-4 last:border-b-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg font-bold">
                          {getCompanyInitial(client.name)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold text-slate-900">{client.name}</div>
                            {client.isTrueNew && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-600">NEW</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 font-medium">{client.role}</div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-sm font-bold text-slate-900">
                          {formatKoreanCurrency(client.amount)}
                        </span>
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${client.growthRate > 0 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                            }`}
                        >
                          {client.isTrueNew ? '신규진입' : `+${client.growthRate.toFixed(1)}%`}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center text-center text-slate-500 text-sm gap-3 py-6">
                    <img
                      src={emptyStateIllustration}
                      alt="No clients"
                      className="w-full max-w-[200px] h-auto"
                    />
                    <span>데이터가 없습니다.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="col-span-12 lg:col-span-5">
            <div className="bg-gradient-to-br from-amber-50/40 to-white rounded-3xl shadow-card overflow-hidden h-full relative">
              {/* Character decoration in activities */}
              <img
                src={kakaoCharacters}
                alt=""
                className="absolute bottom-4 right-4 w-20 h-20 opacity-10 pointer-events-none"
                style={{ transform: 'rotate(-10deg)' }}
              />
              <div className="bg-gradient-peach-soft px-6 py-5">
                <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-[0.2em]">Activity</p>
                <h3 className="text-base md:text-lg font-bold text-slate-800">나의 활동 (My Activities)</h3>
              </div>
              <div className="px-6 py-4 space-y-6 overflow-y-auto max-h-[400px]">
                {/* Upcoming */}
                <div>
                  <h4 className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-3">예정된 일정</h4>
                  <div className="space-y-3">
                    {upcomingActivities.length > 0 ? (
                      upcomingActivities.map(activity => <RenderActivityItem key={activity.id} activity={activity} />)
                    ) : (
                      <p className="text-xs text-slate-400 py-2">예정된 일정이 없습니다.</p>
                    )}
                  </div>
                </div>

                {/* History */}
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">최근 활동 이력</h4>
                  <div className="space-y-3">
                    {recentHistoryActivities.length > 0 ? (
                      recentHistoryActivities.map(activity => <RenderActivityItem key={activity.id} activity={activity} isHistory={true} />)
                    ) : (
                      <p className="text-xs text-slate-400 py-2">완료된 활동이 없습니다.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <EditActivityModal
        isOpen={editingActivityId !== null}
        onClose={() => setEditingActivityId(null)}
        activityId={editingActivityId}
      />
    </div>
  )
}

export default Dashboard


