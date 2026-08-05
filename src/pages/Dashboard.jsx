import React, { useState, useEffect, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts'
import { useNavigate, Link } from 'react-router-dom'
import {
  BarChart2, Phone, Mail, FileText, CheckCircle, TrendingUp, RefreshCw, ChevronRight,
  Target, Zap, Award
} from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useDashboardData } from '../hooks/useDashboardData'
import EditActivityModal from '../components/EditActivityModal'
import RevenueForecastPanel from '../components/RevenueForecastPanel'
import AppInstallGuide from '../components/AppInstallGuide'
import IssueTracker from '../components/IssueTracker'
import ActivityTimeline from '../components/ActivityTimeline'
import { formatCurrency, formatKoreanCurrency } from '../utils/formatters'

import ActionCenter from '../components/ActionCenter'
import AIHeadline from '../components/AIHeadline'
import KPIWidget from '../components/KPIWidget'


const Dashboard = () => {
  const { activities, sales, loading, refreshData, dashboardStats, clients } = useData()
  const {
    user,
    upcomingEvents,
    rawSalesData,
    myAccounts,
    getUserSalesRep,
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
    // Filter out zero-revenue days (e.g. holidays/weekends) as requested
    return data.filter(d => d.value > 0)
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
    topRevenueClients: [],
    topGrowthClients: []
  }

  // Weekly Trend Data for Chart
  const weeklyData = [
    { name: 'Mon', 매출: 4000 },
    { name: 'Tue', 매출: 3000 },
    { name: 'Wed', 매출: 2000 },
    { name: 'Thu', 매출: 2780 },
    { name: 'Fri', 매출: 1890 },
    { name: 'Sat', 매출: 2390 },
    { name: 'Sun', 매출: 3490 },
  ]; // Placeholder if real data isn't ready, or use weeklySalesData

  const monthlyTrendData = stats.aggregatedMonthlyTrend || []
  const lastUpdatedTime = lastRefreshed ? lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'


  return (
    <div className="dashboard-light min-h-screen p-4 md:p-8 font-['Inter',sans-serif] mt-[56px]" style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)' }}>
      <div className="max-w-[1600px] mx-auto space-y-6">

        {/* Page Title Section */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200">
          <div className="flex flex-col">
            <p className="text-[10px] uppercase tracking-wider font-semibold mb-1 text-slate-500">Home / Dashboard</p>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Dashboard Overview
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 shadow-sm">
              <span className="text-[11px] font-bold text-slate-600">Last Updated: {lastUpdatedTime}</span>
            </div>
            <button
              onClick={handleRefresh}
              className="p-1.5 rounded-lg transition-all bg-white border border-slate-200 hover:bg-slate-50 shadow-sm"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''} text-slate-600`} />
            </button>
          </div>
        </div>

        {/* Global KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Customers', value: stats?.totalClientsCount || 0, sub: `${stats?.clientGrowthVal}%`, icon: <Target className="w-5 h-5 text-slate-700" strokeWidth={1.5} /> },
            { label: 'Active Customers', value: stats?.currentActiveClientsCount || 0, sub: `${((stats?.currentActiveClientsCount / (stats?.totalClientsCount || 1)) * 100).toFixed(0)}%`, icon: <Zap className="w-5 h-5 text-slate-700" strokeWidth={1.5} /> },
            { label: 'Monthly Revenue', value: formatKoreanCurrency(stats?.currentMonthSalesTotal || 0), sub: `${stats?.revenueYoY}%`, icon: <Award className="w-5 h-5 text-slate-700" strokeWidth={1.5} /> }
          ].map((kpi, i) => (
            <div key={i} className="p-5 rounded-xl flex items-start justify-between relative overflow-hidden transition-all bg-white border border-slate-100 shadow-sm hover:shadow-md">
              <div>
                <p className="text-xs font-medium mb-1 text-slate-500">{kpi.label}</p>
                <h3 className="text-2xl font-bold text-slate-900">{kpi.value}</h3>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[10px] font-bold flex items-center gap-1 text-red-600"><TrendingUp className="w-3 h-3" />{kpi.sub}</span>
                  <span className="text-[10px] font-medium text-slate-400">vs last year</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">{kpi.icon}</div>
            </div>
          ))}

          {/* 7-Day Trend */}
          <div className="p-5 rounded-xl flex flex-col justify-between relative overflow-hidden transition-all bg-white border border-slate-100 shadow-sm hover:shadow-md">
            <div className="flex justify-between items-start mb-2">
              <p className="text-xs font-medium text-slate-500">7-Day Trend</p>
              <div className="p-2.5 rounded-xl bg-red-50 text-red-600 border border-red-100"><BarChart2 className="w-5 h-5" strokeWidth={1.5} /></div>
            </div>
            <div className="h-16 w-full relative mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklySalesData.length > 0 ? weeklySalesData : weeklyData}>
                  <defs>
                    <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#DC2626" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="value" stroke="#DC2626" strokeWidth={2} fillOpacity={1} fill="url(#colorTrend)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* KPI Performance Tracker */}
        <KPIWidget
          rawSalesData={rawSalesData}
          clients={clients}
          activities={activities}
          myAccounts={myAccounts}
          salesRepName={getUserSalesRep}
        />

        {/* Middleware Section: AI Coach & Forecast */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <AIHeadline user={user} stats={stats} loading={loading} />
          <RevenueForecastPanel />
        </div>

        {/* Lower Section: Dense Data Grids */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Fastest Growing Clients */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col h-full overflow-hidden">
            <div className="p-5 border-b border-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">Fastest Growing Clients</h3>
                <p className="text-xs text-slate-500 mt-0.5">Top Performers by Growth Rate</p>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 bg-white">
                    <th className="py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Client Name</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sector</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Revenue (Mo)</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Growth</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {stats?.topGrowthClients?.map((client, idx) => (
                    <tr key={idx} className="group hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-sm bg-gray-100 text-[9px] font-bold text-gray-500 flex items-center justify-center border border-gray-200">
                            {client.name.substring(0, 1)}
                          </div>
                          <span className="text-[11px] font-bold text-gray-900">{client.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[10px] text-gray-400 font-medium">{client.role || '-'}</td>
                      <td className="py-3 px-4 text-[11px] font-bold text-gray-900 text-right tabular-nums">
                        {formatKoreanCurrency(client.amount)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="inline-block px-1.5 py-0.5 rounded-sm bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-100">
                          +{client.growthRate?.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Priority Issues */}
          <div className="flex flex-col gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
              <div className="p-5 border-b border-slate-50 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">Priority Issues</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Pending Actions & Alerts</p>
                </div>
              </div>
              <div>
                <IssueTracker maxItems={3} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Timeline & Key Accounts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-20 mt-6">
          <div className="rounded-xl flex flex-col overflow-hidden bg-white border border-slate-100 shadow-sm">
            <div className="p-5 flex items-center justify-between border-b border-slate-50">
              <div>
                <h3 className="font-semibold text-slate-900">Recent Activities</h3>
                <p className="text-xs text-slate-500 mt-0.5">Timeline of Interactions</p>
              </div>
            </div>
            <div className="p-0">
              <ActivityTimeline maxItems={5} />
            </div>
            <div className="p-4 text-center border-t border-slate-50">
              <Link to="/activities" className="text-xs font-medium flex items-center justify-center gap-1 text-slate-500 hover:text-slate-800 transition-colors">
                View Full Timeline <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          <div className="rounded-xl flex flex-col overflow-hidden bg-white border border-slate-100 shadow-sm">
            <div className="p-5 flex items-center justify-between border-b border-slate-50">
              <div>
                <h3 className="font-semibold text-slate-900">Key Accounts</h3>
                <p className="text-xs text-slate-500 mt-0.5">Top Revenue Contributors</p>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse">
                <tbody>
                  {stats?.topRevenueClients?.slice(0, 5).map((client, idx) => (
                    <tr key={idx} className="group hover:bg-slate-50 border-b border-slate-50 last:border-0 transition-colors">
                      <td className="py-4 px-4 w-12 text-center">
                        <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${idx < 3 ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                          {idx + 1}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-[12px] font-semibold block mb-0.5 text-slate-900">{client.name}</span>
                        <span className="text-[10px] uppercase tracking-wider text-slate-400">Total Sales Volume</span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <span className="text-[12px] font-bold block tabular-nums text-slate-900">{formatKoreanCurrency(client.total)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 text-center border-t border-slate-50">
              <Link to="/my-accounts" className="text-xs font-medium flex items-center justify-center gap-1 text-slate-500 hover:text-slate-800 transition-colors">
                Manage All Accounts <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>

        <EditActivityModal
          isOpen={editingActivityId !== null}
          onClose={() => setEditingActivityId(null)}
          activityId={editingActivityId}
        />
      </div>
    </div>
  )
}

export default Dashboard
