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
import SalesCoach from '../components/SalesCoach'
import KPIWidget from '../components/KPIWidget'
import { SALES_REP_OPTIONS, setStoredRep } from '../utils/salesRep'
import ScheduleCalendar from '../components/ScheduleCalendar'


const Dashboard = () => {
  const { activities, sales, loading, refreshData, dashboardStats, clients } = useData()
  const {
    user,
    upcomingEvents,
    rawSalesData,
    totalClientsCount: repClientsCount,
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
  // DataContext(dashboardStats)와 useDashboardData가 각각 따로 데이터를 가져온다.
  // 앞쪽이 비어 상단 카드가 전부 0으로 보이는 일이 있어, 그럴 때는 이미 받아온
  // rawSalesData로 채운다. (근본적으로는 두 벌 조회를 하나로 합쳐야 한다)
  const fallback = useMemo(() => {
    if (!rawSalesData || rawSalesData.length === 0) return null
    const now = new Date()
    const y = now.getFullYear(), m = now.getMonth()
    const amount = (s) => Number(s.total_amount ?? s.totalAmount ?? 0) || 0
    const inMonth = (s, yy, mm) => {
      const d = new Date(s.sale_date || s.date || s.created_at)
      return d.getFullYear() === yy && d.getMonth() === mm
    }
    const thisMonth = rawSalesData.reduce((a, s) => a + (inMonth(s, y, m) ? amount(s) : 0), 0)
    const lastYearMonth = rawSalesData.reduce((a, s) => a + (inMonth(s, y - 1, m) ? amount(s) : 0), 0)
    const activeIds = new Set()
    rawSalesData.forEach((s) => {
      const d = new Date(s.sale_date || s.date || s.created_at)
      if (s.client_id && d >= new Date(y, m - 3, 1)) activeIds.add(s.client_id)
    })
    return {
      currentMonthSalesTotal: thisMonth,
      totalClientsCount: repClientsCount || new Set(rawSalesData.map((s) => s.client_id).filter(Boolean)).size,
      currentActiveClientsCount: activeIds.size,
      revenueYoY: lastYearMonth > 0 ? (((thisMonth / lastYearMonth) - 1) * 100).toFixed(1) : '0.0',
      clientGrowthVal: 0,
      aggregatedMonthlyTrend: [],
      topRevenueClients: [],
      topGrowthClients: []
    }
  }, [rawSalesData, repClientsCount])

  const stats = (dashboardStats && dashboardStats.totalClientsCount > 0)
    ? dashboardStats
    : (fallback || dashboardStats) || {
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

  const ytdRevenue = useMemo(() => {
    const y = new Date().getFullYear()
    return (rawSalesData || []).reduce((a, sale) => {
      const d = new Date(sale.sale_date || sale.date || sale.created_at)
      return d.getFullYear() === y ? a + (Number(sale.total_amount ?? sale.totalAmount ?? 0) || 0) : a
    }, 0)
  }, [rawSalesData])

  // 자료가 실제로 도착했는지. 이게 false면 숫자 대신 '—'를 보여준다.
  const dataReady = !loading && (rawSalesData?.length > 0 || clients?.length > 0)

  const summaryCards = useMemo(() => {
    const yoy = Number(stats?.revenueYoY)
    const yoyText = Number.isFinite(yoy) ? `${yoy > 0 ? '+' : ''}${yoy}% (작년 동월 대비)` : ' '
    return [
      { label: '전체 거래처', value: `${(stats?.totalClientsCount || 0).toLocaleString('ko-KR')}곳`, sub: `내 담당 ${myAccounts?.length || 0}곳` },
      { label: '최근 거래 거래처', value: `${(stats?.currentActiveClientsCount || 0).toLocaleString('ko-KR')}곳`, sub: '최근 3개월 주문' },
      { label: '이번 달 매출', value: formatKoreanCurrency(stats?.currentMonthSalesTotal || 0), sub: yoyText },
      { label: '올해 누적 매출', value: formatKoreanCurrency(ytdRevenue), sub: `${new Date().getFullYear()}년 1월~오늘` },
    ]
  }, [stats, myAccounts, ytdRevenue])
  const lastUpdatedTime = lastRefreshed ? lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'


  return (
    <div className="dashboard-light min-h-screen p-3 md:p-4 mt-[56px]" style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)' }}>
      <div className="max-w-[1600px] mx-auto space-y-3">

        {/* 제목 줄 */}
        <div className="win" style={{ marginBottom: 12 }}>
          <div className="win-title">
            <span>대시보드</span>
            <span className="meta">
              {dataReady ? `${lastUpdatedTime} 기준` : '불러오는 중…'}
            </span>
          </div>
          <div className="toolbar">
            <button className="tb-btn" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} /> 새로고침
            </button>
            <span className="tb-sep" />
            {/* 로그인이 없어 '내가 누구인지'를 앱이 알 수 없다. 여기서 고른 값을
                기기에 저장해 KPI·영업 코치·거래처 정렬이 모두 이 이름을 기준으로 돈다.
                고르지 않으면 '내 담당'이 하나도 안 잡혀 전부 0으로 나온다. */}
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              담당
              <select
                value={getUserSalesRep || ''}
                onChange={(e) => setStoredRep(e.target.value || null)}
                style={{ fontSize: 12 }}
              >
                <option value="">전사 (내 담당 없음)</option>
                {SALES_REP_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>

          {/* 요약 숫자 — 자료가 준비되기 전에는 '—'를 보여준다.
              예전에는 0이나 계산 도중 값이 그대로 떠서, 새로고침을 눌러야
              제대로 나오는 것처럼 보였다. 틀린 숫자보다 빈 칸이 낫다. */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 1, background: 'var(--border)',
            borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)'
          }}>
            {summaryCards.map((c) => (
              <div key={c.label} style={{ background: 'var(--bg-card)', padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{c.label}</div>
                {/* 불러오는 중에는 '—' 대신 자리를 그린다. '—'는 '값이 없다'는
                    뜻으로 읽혀서(매출 0원인 상태와 구별되지 않는다), 기다리는
                    중임을 알리지 못한다. 틀린 숫자를 안 보여주는 원칙은 그대로다. */}
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {dataReady ? c.value : <span className="skeleton" style={{ display: 'block', height: 22, width: '70%', borderRadius: 4 }} />}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {dataReady ? c.sub : <span className="skeleton" style={{ display: 'block', height: 10, width: '45%', borderRadius: 3, marginTop: 4 }} />}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 일정 달력 + 영업 코치 — 매일 여는 화면이라 맨 위에 둔다.
            일정은 텔레그램으로 보낸 것이 바로 뜨고, 코치는 오늘 누구부터
            챙길지 거래처별 매출·접점을 함께 보고 정해 준다. */}
        <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-3">
          <ScheduleCalendar />
          <SalesCoach
            sales={rawSalesData}
            clients={clients}
            activities={activities}
            salesRepName={getUserSalesRep}
          />
        </div>

        {/* KPI Performance Tracker */}
        <div>
          <KPIWidget
            rawSalesData={rawSalesData}
            clients={clients}
            activities={activities}
            myAccounts={myAccounts}
            salesRepName={getUserSalesRep}
          />
        </div>

        <div>
          <RevenueForecastPanel />
        </div>

        {/* Lower Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* 빠르게 크는 거래처 */}
          <div className="win">
            <div className="win-title">
              <span>빠르게 크는 거래처</span>
              <span className="meta">성장률 상위</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="dgrid">
                <thead>
                  <tr>
                    <th className="seq" style={{ width: 36 }}>#</th>
                    <th style={{ minWidth: 160 }}>거래처</th>
                    <th style={{ minWidth: 110, textAlign: 'right' }}>월 매출</th>
                    <th style={{ minWidth: 80, textAlign: 'right' }}>성장률</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats?.topGrowthClients || []).slice(0, 8).map((client, idx) => (
                    <tr key={idx}>
                      <td className="seq">{idx + 1}</td>
                      <td>{client.name}</td>
                      <td className="num">{formatKoreanCurrency(client.amount)}</td>
                      <td className="num" style={{ color: '#1C6B3C', fontWeight: 600 }}>
                        +{client.growthRate?.toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                  {(!stats?.topGrowthClients || stats.topGrowthClients.length === 0) && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: 18, color: 'var(--text-secondary)' }}>
                      {dataReady ? '해당하는 거래처가 없습니다.' : '불러오는 중…'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 최근 활동 */}
        <div className="grid grid-cols-1 gap-3 pb-20">
          <div className="win">
            <div className="win-title">
              <span>최근 활동</span>
              <span className="meta">다녀온 기록</span>
            </div>
            <ActivityTimeline maxItems={5} />
            <div className="statusbar">
              <Link to="/activities" className="tap-box" style={{ color: 'var(--text-secondary)', padding: '0 4px' }}>전체 활동 보기 &rsaquo;</Link>
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
