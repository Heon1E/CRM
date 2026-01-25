import React, { useState, useEffect, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts'
import { useNavigate, Link } from 'react-router-dom'
import {
  Users, Store, DollarSign, BarChart2,
  Phone, Mail, FileText, CheckCircle
} from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useDashboardData } from '../hooks/useDashboardData'
import EditActivityModal from '../components/EditActivityModal'
import RevenueForecastPanel from '../components/RevenueForecastPanel'
import AppInstallGuide from '../components/AppInstallGuide'
import IssueTracker from '../components/IssueTracker'
import { formatCurrency, formatKoreanCurrency } from '../utils/formatters'

const Dashboard = () => {
  const { activities, sales, loading, refreshData, dashboardStats } = useData()
  const {
    user,
    upcomingEvents,
  } = useDashboardData()

  const navigate = useNavigate()
  const [editingActivityId, setEditingActivityId] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState(new Date())

  // Manual Refresh Handler
  const handleRefresh = async () => {
    if (isRefreshing) return
    try {
      setIsRefreshing(true)
      await refreshData()
      await new Promise(resolve => setTimeout(resolve, 300))
      setLastRefreshed(new Date())
    } catch (e) {
      console.error("Refresh failed", e)
    } finally {
      setIsRefreshing(false)
    }
  }

  // --- Weekly Sales Data Calculation ---
  const weeklySalesData = useMemo(() => {
    const data = []
    const now = new Date()
    // Create last 7 days array (including today)
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      d.setHours(0, 0, 0, 0)

      const dateStr = d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) // e.g. "1. 24."
      // For comparison with sales data
      const compDateStart = new Date(d)
      const compDateEnd = new Date(d)
      compDateEnd.setHours(23, 59, 59, 999)

      // Filter and sum sales
      const dayTotal = (sales || []).reduce((sum, s) => {
        const saleDate = new Date(s.sale_date || s.date)
        if (saleDate >= compDateStart && saleDate <= compDateEnd) {
          return sum + (Number(s.totalAmount) || 0)
        }
        return sum
      }, 0)

      data.push({
        name: dateStr,
        value: dayTotal,
        displayValue: formatCurrency(dayTotal)
      })
    }
    return data
  }, [sales])

  // --- Pre-computed Data & Safe Access ---
  const stats = dashboardStats || {
    currentMonthSalesTotal: 0,
    totalClientsCount: 0,
    currentActiveClientsCount: 0,
    currentChurnedCount: 0,
    revenueYoY: '0.0',
    clientGrowthVal: 0,
    aggregatedMonthlyTrend: [],
    top3RevenueClients: [],
    topGrowthClients: []
  }

  const quickMetrics = [
    {
      label: '전체 고객사',
      value: (stats.totalClientsCount || 0).toLocaleString(),
      icon: Users, iconBg: 'bg-pastel-teal', iconColor: 'text-ink-teal', cardBg: 'bg-white',
      trend: stats.clientGrowthVal >= 0 ? 'up' : 'down', trendValue: `${Math.abs(stats.clientGrowthVal)}%`, trendLabel: '전년 대비'
    },
    {
      label: '활성 고객사',
      value: (stats.currentActiveClientsCount || 0).toLocaleString(),
      icon: Store, iconBg: 'bg-pastel-neutral', iconColor: 'text-slate-600', cardBg: 'bg-white',
      trend: 'up', trendValue: '6%', trendLabel: '전년 대비'
    },
    {
      label: '이번달 매출액',
      value: (() => {
        const val = stats.currentMonthSalesTotal || 0
        const major = Math.floor(val / 100000000)
        const minor = Math.round((val % 100000000) / 10000000)
        if (major === 0 && minor === 0) return '0원'
        if (minor > 0) return `${major}억 ${minor}천만원`
        return `${major}억원`
      })(),
      icon: DollarSign, iconBg: 'bg-pastel-green', iconColor: 'text-ink-green', cardBg: 'bg-white',
      trend: Number(stats.revenueYoY) >= 0 ? 'up' : 'down',
      trendValue: `${Math.abs(Number(stats.revenueYoY))}%`,
      trendLabel: '전년 동월 대비'
    },
    {
      label: '최근 7일 매출 추이',
      isChart: true,
      data: weeklySalesData,
      icon: BarChart2, iconBg: 'bg-pastel-purple', iconColor: 'text-ink-purple', cardBg: 'bg-white',
      trend: null // Chart rendering handles context
    },
  ]


  // --- UI Components ---
  const Panel = ({ title, children, className = "" }) => (
    <div className={`oem-panel ${className}`}>
      <div className="oem-panel-header">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-oem-text-secondary">▼</span>
          <span className="uppercase tracking-tight">{title}</span>
        </div>
        <div className="flex gap-1">
          <button className="p-0.5 hover:bg-gray-300 transition-colors">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14" /></svg>
          </button>
        </div>
      </div>
      <div className="oem-panel-content">
        {children}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-oem-bg-app p-6 font-['Noto_Sans_KR',sans-serif] text-oem-text-primary mt-[50px]">
      <div className="max-w-[1600px] mx-auto space-y-6">

        {/* Page Title Section */}
        <div className="flex items-center justify-between border-b border-oem-border pb-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-oem-blue flex items-center gap-2">
              Enterprise Summary
              <span className="text-[10px] bg-oem-bg-header text-oem-text-secondary px-2 py-0.5 rounded-full font-normal">Cloud Control 13c Style</span>
            </h1>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-oem-text-secondary font-medium">
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-oem-green rounded-full"></span> System Healthy</span>
            <span>Last Refreshed: {lastRefreshed ? lastRefreshed.toLocaleTimeString() : 'N/A'}</span>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={`oem-btn-secondary px-2 flex items-center gap-1 ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isRefreshing ? (
                <>
                  <span className="animate-spin h-3 w-3 border-2 border-current border-t-transparent rounded-full" />
                  Refreshing...
                </>
              ) : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Overview KPI Panel - Full Width */}
        <Panel title="Summary" className="bg-[#ffffff]">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-0 py-2 divide-x divide-transparent md:divide-border">
            {quickMetrics.map((metric, idx) => (
              <div key={idx} className={`oem-kpi-item group relative px-2 md:px-4 ${idx > 1 ? 'mt-2 md:mt-0' : ''}`}>
                <span className="oem-kpi-label mb-0.5 md:mb-1 block text-[10px] md:text-[11px] truncate">{metric.label}</span>

                {metric.isChart ? (
                  <div className="h-[35px] md:h-[45px] w-full mt-1 pr-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={metric.data}>
                        <defs>
                          <linearGradient id="colorWeeklySales" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8884d8" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Tooltip
                          cursor={{ stroke: '#8884d8', strokeWidth: 1 }}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-slate-800 text-white text-[10px] py-1 px-2 rounded shadow-lg border border-slate-700">
                                  <p className="font-bold mb-0.5">{payload[0].payload.name}</p>
                                  <p>{payload[0].payload.displayValue}</p>
                                </div>
                              )
                            }
                            return null
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#8884d8"
                          fillOpacity={1}
                          fill="url(#colorWeeklySales)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col md:flex-row md:items-baseline gap-0 md:gap-2">
                      <span className="oem-kpi-value group-hover:text-oem-blue transition-colors text-lg md:text-2xl truncate">{metric.value}</span>
                      <div className={`flex items-center text-[10px] md:text-[11px] font-bold ${metric.trend === 'up' ? 'text-oem-green' : 'text-oem-red'}`}>
                        {metric.trend === 'up' ? '▲' : '▼'} {metric.trendValue}
                      </div>
                    </div>
                    <p className="text-[9px] md:text-[10px] text-oem-text-secondary mt-0.5 md:mt-1 tracking-tight truncate hidden md:block">vs {metric.trendLabel}</p>
                  </>
                )}
              </div>
            ))}
          </div>
        </Panel>

        {/* Main 2-Column Layout - Adjusted to 50:50 split as requested */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

          {/* [Left Column - 50%] */}
          <div className="col-span-12 lg:col-span-6 space-y-6">

            <RevenueForecastPanel />

            {/* Revenue Trend Chart (Changed to Bar Chart) */}
            <Panel title="Revenue Trend (Last 12 Months)">
              <div className="h-[320px] w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.aggregatedMonthlyTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis
                      dataKey="monthStr"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#999999', fontSize: 11 }}
                      tickFormatter={(val) => val.split('-')[1] + 'M'}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#999999', fontSize: 11 }}
                      tickFormatter={(value) => {
                        if (value >= 100000000) return (value / 100000000).toFixed(0) + '억'
                        if (value >= 10000) return (value / 10000).toFixed(0) + '만'
                        return value
                      }}
                    />
                    <Tooltip
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ border: '1px solid #dce1e7', borderRadius: '2px', fontSize: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                      formatter={(value) => [formatKoreanCurrency(value), 'Revenue']}
                    />
                    <Bar
                      dataKey="totalRevenue"
                      fill="#0076ce"
                      radius={[4, 4, 0, 0]}
                      barSize={20}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            {/* Fastest Growing Clients */}
            <Panel title="Fastest Growing Clients (Top Performer)">
              <div className="overflow-x-auto mt-2">
                <table className="oem-table min-w-full table-fixed">
                  <thead>
                    <tr className="border-b border-oem-border bg-oem-bg-app/50">
                      <th className="text-left pl-4 py-2 font-semibold text-[11px] text-oem-text-secondary tracking-tight">CLIENT</th>
                      <th className="text-left py-2 font-semibold text-[11px] text-oem-text-secondary tracking-tight w-[15%]">INDUSTRY</th>
                      <th className="text-center py-2 font-semibold text-[11px] text-oem-text-secondary tracking-tight w-[25%]">CURRENT_MONTH</th>
                      <th className="text-center py-2 font-semibold text-[11px] text-oem-text-secondary tracking-tight w-[15%]">GROWTH</th>
                      <th className="text-center py-2 font-semibold text-[11px] text-oem-text-secondary tracking-tight w-[10%]">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-oem-border">
                    {stats.topGrowthClients.map((client, idx) => (
                      <tr key={idx} className="hover:bg-oem-blue/5 transition-colors">
                        <td className="py-2.5 pl-4 font-bold text-[12px] truncate" title={client.name}>{client.name}</td>
                        <td className="py-2.5 text-[11px] text-oem-text-secondary truncate">{client.role && client.role !== 'Enterprise' ? client.role : '-'}</td>
                        <td className="py-2.5 text-center font-bold text-[12px] tabular-nums text-oem-text-primary">{formatKoreanCurrency(client.amount)}</td>
                        <td className="py-2.5 text-center font-bold text-[12px] tabular-nums">
                          <span className="text-oem-green">+{client.growthRate.toFixed(0)}%</span>
                        </td>
                        <td className="py-2.5 text-center">
                          {client.isTrueNew ? (
                            <span className="inline-block px-1.5 py-0.5 rounded-[2px] bg-oem-green/10 border border-oem-green/20 text-oem-green text-[10px] font-bold leading-none">NEW</span>
                          ) : (
                            <span className="inline-block px-1.5 py-0.5 rounded-[2px] bg-oem-blue/10 border border-oem-blue/20 text-oem-blue text-[10px] font-bold leading-none">UP</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

          </div>

          {/* [Right Column - 50%] */}
          <div className="col-span-12 lg:col-span-6 space-y-6">

            {/* Top Revenue Clients */}
            <Panel title="Top Revenue Clients (Historical)">
              <div className="space-y-3 mt-1">
                {stats.top3RevenueClients.map((client, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-white border border-oem-border rounded-oem hover:border-oem-blue transition-colors group cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs ${idx === 0 ? 'bg-amber-400' : idx === 1 ? 'bg-slate-300' : 'bg-orange-400'
                        }`}>
                        {idx + 1}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-oem-text-primary group-hover:text-oem-blue transition-colors">
                          {client.name}
                        </p>
                        <p className="text-[10px] text-oem-text-secondary font-medium uppercase tracking-tight">Main Contributor</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-oem-text-primary">{formatKoreanCurrency(client.total)}</p>
                      <p className="text-[10px] text-oem-green font-bold">LIFETIME_HIGH</p>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => navigate('/clients')} className="w-full mt-4 oem-btn-secondary text-[11px] font-bold py-1.5 hover:bg-oem-bg-header transition-colors">
                VIEW_ALL_CLIENTS
              </button>
            </Panel>

            {/* [NEW] Issue Tracker Panel */}
            <Panel title="Issue Tracker">
              <div className="pt-2">
                <IssueTracker maxItems={3} />
              </div>
            </Panel>

            <Panel title="My Activities (Timeline)">
              <div className="space-y-4 py-2 mt-2">
                {(activities || [])
                  .sort((a, b) => new Date(b.date) - new Date(a.date)) // Sort by date descending
                  .slice(0, 5)
                  .map((act) => {
                    // Icon Mapping
                    let Icon = Users
                    let iconBg = 'bg-blue-100'
                    let iconColor = 'text-blue-600'

                    switch (act.type) {
                      case '전화': Icon = Phone; iconBg = 'bg-green-100'; iconColor = 'text-green-600'; break;
                      case '이메일': Icon = Mail; iconBg = 'bg-purple-100'; iconColor = 'text-purple-600'; break;
                      case '제안서': Icon = FileText; iconBg = 'bg-orange-100'; iconColor = 'text-orange-600'; break;
                      case '견적': Icon = DollarSign; iconBg = 'bg-amber-100'; iconColor = 'text-amber-600'; break;
                      case '계약': Icon = CheckCircle; iconBg = 'bg-teal-100'; iconColor = 'text-teal-600'; break;
                      default: break; // '미팅' defaults
                    }

                    return (
                      <div
                        key={act.id}
                        className="relative flex gap-3 group cursor-pointer p-2 rounded hover:bg-gray-50 transition-colors border-l-2 border-transparent hover:border-l-oem-blue pl-2"
                        onClick={() => setEditingActivityId(act.id)}
                      >
                        {/* Icon Box */}
                        <div className={`mt-0.5 w-8 h-8 rounded flex-shrink-0 flex items-center justify-center ${iconBg} ${iconColor}`}>
                          <Icon className="w-4 h-4" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                            <span className="text-[10px] font-bold text-oem-text-secondary uppercase tracking-wider bg-gray-100 px-1.5 py-0.5 rounded">
                              {act.type || 'Activity'}
                            </span>
                            <span className="text-[10px] text-oem-text-secondary whitespace-nowrap ml-2">
                              {new Date(act.date).toLocaleDateString()}
                            </span>
                          </div>

                          <p className="text-sm font-bold text-oem-text-primary mt-1 line-clamp-1 group-hover:text-oem-blue transition-colors">
                            {act.title || act.clientName}
                          </p>

                          {/* Client Name & Desc */}
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[11px] text-oem-text-secondary font-medium truncate">@{act.clientName}</span>
                          </div>

                          <p className="text-[11px] text-gray-500 mt-1.5 line-clamp-2 leading-relaxed">
                            {act.description || "No details provided."}
                          </p>
                        </div>
                      </div>
                    )
                  })}

                {(activities || []).length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-xs italic">
                    No recent activities found.
                  </div>
                )}
              </div>
              <Link to="/activities" className="block text-center text-[11px] font-bold text-oem-text-link mt-4 pt-4 border-t border-dashed border-gray-200 hover:underline">
                OPEN_FULL_TIMELINE →
              </Link>
            </Panel>

          </div>

        </div>
      </div>

      <EditActivityModal
        isOpen={editingActivityId !== null}
        onClose={() => setEditingActivityId(null)}
        activityId={editingActivityId}
      />
      <AppInstallGuide />
    </div>
  )
}

export default Dashboard
