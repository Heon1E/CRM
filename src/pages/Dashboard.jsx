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
} from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import MetricCard from '../components/MetricCard'
import EditActivityModal from '../components/EditActivityModal'
import AppInstallGuide from '../components/AppInstallGuide'
import { formatActivityText, formatActivityTitle } from '../utils/koreanJosa'
import { formatDate, formatCurrency, formatKoreanCurrency } from '../utils/formatters'
import ctaIllustration from '../assets/illustrations/cta-premium.svg'
import placeholderIllustration from '../assets/illustrations/placeholder-illustration.svg'
import emptyStateIllustration from '../assets/illustrations/empty-state.svg'
import clientStatus from '../utils/clientStatus'

const Dashboard = () => {
  // ===== 모든 Hooks를 최상단에 선언 =====
  const { activities, clients, getStats, getWeeklySalesData, loading } = useData()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [editingActivityId, setEditingActivityId] = useState(null)
  const [upcomingEvents, setUpcomingEvents] = useState([])
  const [myAccounts, setMyAccounts] = useState([])
  const [myMonthlySales, setMyMonthlySales] = useState(0)
  const [myWeeklySalesData, setMyWeeklySalesData] = useState([])
  const [rawSalesData, setRawSalesData] = useState([])
  const [salesLoading, setSalesLoading] = useState(false)
  const [totalClientsCount, setTotalClientsCount] = useState(0) // 실제 총 거래처 개수
  const [activeSalesTab, setActiveSalesTab] = useState('revenue')
  const [activePipelineSlice, setActivePipelineSlice] = useState(0)
  const [isPipelineLocked, setIsPipelineLocked] = useState(false)
  const bentoCardClass =
    'card bg-white shadow-sm rounded-2xl border border-slate-100 hover:shadow-md transition-all duration-300'

  // Sales Rep 옵션
  const SALES_REP_OPTIONS = ['박민철', '송원기', '이헌일']

  // 사용자 이름 매핑 (영어 -> 한글)
  const getUserSalesRep = useMemo(() => {
    if (!user) return null

    // 사용자 이름 추출 (user_metadata.full_name 또는 email에서)
    const userName = user.user_metadata?.full_name || user.email || ''
    
    // 영어 이름 -> 한글 이름 매핑
    const nameMapping = {
      'Heonil Lee': '이헌일',
      'heonil lee': '이헌일',
      'Heonil': '이헌일',
      'heonil': '이헌일',
      // 필요시 추가 매핑
    }

    // 매핑 확인
    if (nameMapping[userName]) {
      return nameMapping[userName]
    }

    // 직접 매칭 (한글 이름이 이미 있는 경우)
    if (SALES_REP_OPTIONS.includes(userName)) {
      return userName
    }

    // 이메일에서 이름 추출 시도 (예: heonil@example.com -> 이헌일)
    const emailName = user.email?.split('@')[0]?.toLowerCase()
    if (emailName && nameMapping[emailName]) {
      return nameMapping[emailName]
    }

    return null
  }, [user])

  // 주간 매출 데이터 계산 헬퍼 함수 (특정 클라이언트들용) - Hook 외부로 이동
  const getWeeklySalesDataForClients = (salesData) => {
    if (!salesData || salesData.length === 0) return []

    const now = new Date()
    const weeks = []
    
    // 최근 8주 데이터 생성
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - (i * 7))
      weekStart.setHours(0, 0, 0, 0)
      
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)

      const weekSales = salesData.filter(sale => {
        const saleDate = new Date(sale.sale_date || sale.date)
        return saleDate >= weekStart && saleDate <= weekEnd
      })

      const weekTotal = weekSales.reduce((sum, sale) => {
        return sum + (sale.total_amount || 0)
      }, 0)

      const weekLabel = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`
      weeks.push({
        week: weekLabel,
        매출: Math.round(weekTotal / 10000) // 만원 단위로 변환
      })
    }

    return weeks
  }

  // 실제 총 거래처 개수 조회 (head: true로 실제 총 개수 가져오기)
  useEffect(() => {
    const fetchTotalClientsCount = async () => {
      try {
        const { count, error } = await supabase
          .from('clients')
          .select('*', { count: 'exact', head: true })
        
        if (error) throw error
        setTotalClientsCount(count || 0)
      } catch (error) {
        console.error('총 거래처 개수 조회 오류:', error)
        // 에러 발생 시 DataContext의 clients.length 사용 (fallback)
        setTotalClientsCount(clients.length)
      }
    }
    
    fetchTotalClientsCount()
  }, [clients.length]) // clients.length가 변경되면 재조회 (fallback용)

  // My Accounts 및 My Monthly Sales 데이터 페칭 (No JOIN 규칙 준수)
  useEffect(() => {
    const fetchMyData = async () => {
      if (!getUserSalesRep) {
        setMyAccounts([])
        setMyMonthlySales(0)
        setMyWeeklySalesData([])
        return
      }

      try {
        // Step 1: clients 테이블에서 sales_rep가 현재 사용자와 일치하는 클라이언트 조회 (1000-row limit 제거)
        const { data: myClientsData, error: clientsError } = await supabase
          .from('clients')
          .select('id')
          .eq('sales_rep', getUserSalesRep)
          .range(0, 99999) // 1000-row limit 제거

        if (clientsError) throw clientsError

        const myClientIds = (myClientsData || []).map(c => c.id)
        setMyAccounts(myClientIds)

        if (myClientIds.length === 0) {
          setMyMonthlySales(0)
          setMyWeeklySalesData([])
          return
        }

        // Step 2: 이번 달 sales 데이터 조회 (1000-row limit 제거, HTTP 400 방지: .in() 대신 전체 가져오기)
        const now = new Date()
        const currentYear = now.getFullYear()
        const currentMonth = now.getMonth() + 1
        const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
        const endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-31`

        // HTTP 400 방지: 모든 sales를 가져와서 클라이언트 사이드에서 필터링
        const { data: allSalesData, error: salesError } = await supabase
          .from('sales')
          .select('*')
          .gte('sale_date', startDate)
          .lte('sale_date', endDate)
          .range(0, 99999) // 1000-row limit 제거

        if (salesError) throw salesError

        // 클라이언트 사이드에서 필터링 (HTTP 400 방지)
        const mySalesData = (allSalesData || []).filter(sale => 
          myClientIds.includes(sale.client_id)
        )

        if (salesError) throw salesError

        // 이번 달 매출 합계 계산
        const monthlyTotal = (mySalesData || []).reduce((sum, sale) => {
          return sum + (sale.total_amount || 0)
        }, 0)
        setMyMonthlySales(monthlyTotal)

        // 주간 매출 데이터 계산 (My Sales Trend용)
        const weeklyData = getWeeklySalesDataForClients(mySalesData || [])
        setMyWeeklySalesData(weeklyData)
      } catch (error) {
        console.error('My Data 조회 오류:', error)
        setMyAccounts([])
        setMyMonthlySales(0)
        setMyWeeklySalesData([])
      }
    }

    fetchMyData()
  }, [getUserSalesRep])

  // Dashboard용 매출 데이터 로딩 (Sales 탭과 동일한 supabase 쿼리)
  useEffect(() => {
    const fetchSalesData = async () => {
      console.log('Starting sales data fetch...')
      try {
        setSalesLoading(true)
        const { data: salesData, error: salesError } = await supabase
          .from('sales')
          .select('*')
          .order('sale_date', { ascending: false })
          .range(0, 99999)

        if (salesError) throw salesError
        let allItems = []
        try {
          const { data: itemsData, error: itemsError } = await supabase
            .from('sales_items')
            .select('*')
            .range(0, 99999)

          if (itemsError) {
            console.warn('[Dashboard.jsx] sales_items 조회 실패:', itemsError)
          } else {
            allItems = itemsData || []
          }
        } catch (itemsError) {
          console.warn('[Dashboard.jsx] sales_items 조회 중 오류:', itemsError)
        }

        const normalizedSales = (salesData || []).map((sale) => {
          const mergedItems = allItems.filter((item) => item.sale_id === sale.id)
          const finalItems = mergedItems.length > 0 ? mergedItems : (sale.items || [])
          let calculatedTotal = sale.total_amount || sale.totalAmount || 0
          if (calculatedTotal === 0 && finalItems.length > 0) {
            calculatedTotal = finalItems.reduce((sum, item) => {
              const quantity = Number(item.quantity) || 0
              const unitPrice = Number(item.unit_price || item.unitPrice) || 0
              return sum + (quantity * unitPrice)
            }, 0)
          }

          return {
            ...sale,
            totalAmount: calculatedTotal,
            items: finalItems,
          }
        })

        console.log('Raw sales data fetched successfully:', {
          length: normalizedSales.length,
          sample: normalizedSales[0],
        })
        setRawSalesData(normalizedSales)
      } catch (error) {
        console.error('Failed to fetch sales data:', error)
        setRawSalesData([])
      } finally {
        setSalesLoading(false)
      }
    }

    fetchSalesData()
  }, [])

  // Upcoming Events 데이터 페칭 (No JOIN 규칙 준수)
  // 영업 활동의 다음 일정(next_action_date)이 곧 Upcoming Event가 됩니다.
  useEffect(() => {
    const fetchUpcomingEvents = async () => {
      try {
        // Step 1: activities 테이블에서 next_action_date가 있는 데이터만 조회 (1000-row limit 제거)
        const { data: activitiesData, error: activitiesError } = await supabase
          .from('activities')
          .select('*')
          .not('next_action_date', 'is', null)
          .order('next_action_date', { ascending: true })
          .range(0, 99999) // 1000-row limit 제거

        if (activitiesError) throw activitiesError

        if (!activitiesData || activitiesData.length === 0) {
          setUpcomingEvents([])
          return
        }

        // Step 2: 필요한 client_id들만 모아서 clients 테이블 별도 조회 (HTTP 400 방지: 전체 가져오기)
        const clientIds = [...new Set(activitiesData.map(a => a.client_id).filter(Boolean))]
        
        let clientsMap = {}
        if (clientIds.length > 0) {
          // HTTP 400 방지: 모든 clients를 가져와서 클라이언트 사이드에서 필터링
          const { data: allClientsData, error: clientsError } = await supabase
            .from('clients')
            .select('id, company')
            .range(0, 99999) // 1000-row limit 제거

          if (!clientsError && allClientsData) {
            // 클라이언트 사이드에서 필요한 client_id만 필터링
            const filteredClients = allClientsData.filter(c => clientIds.includes(c.id))
            clientsMap = filteredClients.reduce((acc, client) => {
              acc[client.id] = client.company
              return acc
            }, {})
          }
        }

        // Step 3: 두 데이터를 병합하여 Upcoming Events 생성
        const mergedEvents = activitiesData.map(activity => ({
          ...activity,
          clientName: clientsMap[activity.client_id] || '알 수 없음',
          scheduleDate: activity.next_action_date
        }))

        setUpcomingEvents(mergedEvents)
      } catch (error) {
        console.error('Upcoming Events 조회 오류:', error)
        setUpcomingEvents([])
      }
    }

    fetchUpcomingEvents()
  }, [])

  useEffect(() => {
    if (!getUserSalesRep) {
      setActiveSalesTab('revenue')
    }
  }, [getUserSalesRep])

  const topClients = useMemo(() => {
    const totalsByClient = new Map()
    const currentMonthTotals = new Map()
    const previousMonthTotals = new Map()
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()
    const prevMonthDate = new Date(currentYear, currentMonth - 1, 1)
    const prevYear = prevMonthDate.getFullYear()
    const prevMonth = prevMonthDate.getMonth()

    ;(rawSalesData || []).forEach((sale) => {
      const clientId = sale.client_id || sale.clientId
      if (!clientId) return
      const amount = Number(sale.total_amount ?? sale.totalAmount ?? 0) || 0
      totalsByClient.set(clientId, (totalsByClient.get(clientId) || 0) + amount)

      const rawDate = sale.sale_date || sale.date || sale.created_at
      if (!rawDate) return
      const parsed = new Date(rawDate)
      if (Number.isNaN(parsed.getTime())) return

      const year = parsed.getFullYear()
      const month = parsed.getMonth()
      if (year === currentYear && month === currentMonth) {
        currentMonthTotals.set(clientId, (currentMonthTotals.get(clientId) || 0) + amount)
      } else if (year === prevYear && month === prevMonth) {
        previousMonthTotals.set(clientId, (previousMonthTotals.get(clientId) || 0) + amount)
      }
    })

    const clientNameMap = new Map((clients || []).map((c) => [c.id, c.company || c.name || '알 수 없음']))
    return Array.from(totalsByClient.entries())
      .map(([clientId, total]) => {
        const currentTotal = currentMonthTotals.get(clientId) || 0
        const previousTotal = previousMonthTotals.get(clientId) || 0
        const trend = currentTotal >= previousTotal ? 'up' : 'down'
        const deltaPercent = previousTotal > 0
          ? Math.round(((currentTotal - previousTotal) / previousTotal) * 100)
          : currentTotal > 0
            ? 100
            : 0
        return {
          clientId,
          name: clientNameMap.get(clientId) || '알 수 없음',
          total,
          trend,
          deltaPercent,
        }
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  }, [rawSalesData, clients])
  const topClientMaxTotal = topClients.reduce((max, client) => Math.max(max, client.total), 0)
  const averageDeal = rawSalesData && rawSalesData.length > 0
    ? Math.round((rawSalesData.reduce((sum, sale) => sum + (Number(sale.total_amount ?? sale.totalAmount ?? 0) || 0), 0) / rawSalesData.length) || 0)
    : 0

  const monthRange = (baseDate) => {
    const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1)
    const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0, 23, 59, 59, 999)
    return { start, end }
  }

  const getTrendPercent = (currentValue, previousValue) => {
    if (previousValue > 0) {
      return Math.round(((currentValue - previousValue) / previousValue) * 100)
    }
    return currentValue > 0 ? 100 : 0
  }

  const now = new Date()
  const getBusinessDayIndex = (date) => {
    const start = new Date(date.getFullYear(), date.getMonth(), 1)
    let count = 0
    for (let d = new Date(start); d <= date; d.setDate(d.getDate() + 1)) {
      const day = d.getDay()
      if (day !== 0 && day !== 6) {
        count += 1
      }
    }
    return count
  }

  const getBusinessDayEndDate = (year, month, businessDayIndex) => {
    const start = new Date(year, month, 1)
    let count = 0
    for (let d = new Date(start); d.getMonth() === month; d.setDate(d.getDate() + 1)) {
      const day = d.getDay()
      if (day !== 0 && day !== 6) {
        count += 1
      }
      if (count >= businessDayIndex) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
      }
    }
    return new Date(year, month + 1, 0, 23, 59, 59, 999)
  }

  const isMonthEnd = (date) => {
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0)
    return date.getDate() === end.getDate()
  }

  const buildYoYRange = (baseDate) => {
    if (isMonthEnd(baseDate)) {
      return monthRange(baseDate)
    }
    const businessDayIndex = getBusinessDayIndex(baseDate)
    const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1)
    const end = getBusinessDayEndDate(baseDate.getFullYear(), baseDate.getMonth(), businessDayIndex)
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

  const currentMonthClientsCount = (clients || []).filter((client) =>
    isInRange(client.created_at || client.createdAt, currentRange)
  ).length
  const previousYearClientsCount = (clients || []).filter((client) =>
    isInRange(client.created_at || client.createdAt, previousYearRange)
  ).length
  const clientTrendPercent = getTrendPercent(currentMonthClientsCount, previousYearClientsCount)

  const currentMonthActiveClientsCount = (clients || []).filter((client) =>
    isActiveClient(client) && isInRange(client.created_at || client.createdAt, currentRange)
  ).length
  const previousYearActiveClientsCount = (clients || []).filter((client) =>
    isActiveClient(client) && isInRange(client.created_at || client.createdAt, previousYearRange)
  ).length
  const activeClientTrendPercent = getTrendPercent(
    currentMonthActiveClientsCount,
    previousYearActiveClientsCount
  )

  const currentMonthSales = (rawSalesData || []).filter((sale) =>
    isInRange(sale.sale_date || sale.date || sale.created_at, currentRange)
  )
  const previousYearMonthSales = (rawSalesData || []).filter((sale) =>
    isInRange(sale.sale_date || sale.date || sale.created_at, previousYearRange)
  )
  const currentMonthAverageDeal = currentMonthSales.length > 0
    ? currentMonthSales.reduce((sum, sale) => sum + (Number(sale.total_amount ?? sale.totalAmount ?? 0) || 0), 0) /
      currentMonthSales.length
    : 0
  const previousYearAverageDeal = previousYearMonthSales.length > 0
    ? previousYearMonthSales.reduce((sum, sale) => sum + (Number(sale.total_amount ?? sale.totalAmount ?? 0) || 0), 0) /
      previousYearMonthSales.length
    : 0
  const averageDealTrendPercent = getTrendPercent(currentMonthAverageDeal, previousYearAverageDeal)

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
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1)
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

  useEffect(() => {
    console.log('Final chartData passed to component:', aggregatedMonthlyTrend)
  }, [aggregatedMonthlyTrend])

  // ===== 모든 Hooks 선언이 끝난 후에 조건부 return 배치 =====
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-slate-500">데이터를 불러오는 중...</div>
      </div>
    )
  }

  // ===== 일반 함수 및 계산된 값들은 조건부 return 이후에 정의 =====
  const stats = getStats()
  const weeklySalesData = getWeeklySalesData()
  const completedActivitiesCount = activities.filter((a) => a.status === '완료').length
  const inProgressActivitiesCount = activities.filter((a) => a.status === '진행중' || a.status === '대기').length
  const pipelineTotalCount = inProgressActivitiesCount + completedActivitiesCount
  const pipelineCompletionRate = pipelineTotalCount > 0
    ? Math.round((completedActivitiesCount / pipelineTotalCount) * 100)
    : 0
  // 진행 중 영업 건수
  const ongoingActivitiesCount = activities.filter((a) => a.status === '진행중').length

  // 진행 중 영업 클릭 핸들러
  const handleOngoingClick = () => {
    navigate('/activities?status=진행중')
  }

  // 최근 활동 (최신 5개)
  const recentActivities = activities
    .sort((a, b) => {
      const dateA = new Date(a.activity_date || a.date || a.created_at)
      const dateB = new Date(b.activity_date || b.date || b.created_at)
      return dateB - dateA
    })
    .slice(0, 5)

  const getActivityIcon = (activity) => {
    const type = (activity?.type || activity?.activity_type || activity?.category || '').toString().toLowerCase()
    if (type.includes('미팅') || type.includes('meeting')) return Calendar
    if (type.includes('전화') || type.includes('call') || type.includes('통화')) return Phone
    if (type.includes('메일') || type.includes('email')) return Mail
    return MessageCircle
  }

  const getActivityIconStyle = () =>
    'bg-slate-100 text-slate-500 transition-all duration-300 ease-out'
  const getActivityIconHoverStyle = (activity) => {
    const type = (activity?.type || activity?.activity_type || activity?.category || '').toString().toLowerCase()
    if (type.includes('미팅') || type.includes('meeting')) {
      return 'group-hover:bg-blue-100 group-hover:text-blue-600'
    }
    if (type.includes('전화') || type.includes('call') || type.includes('통화')) {
      return 'group-hover:bg-emerald-100 group-hover:text-emerald-600'
    }
    if (type.includes('메일') || type.includes('email')) {
      return 'group-hover:bg-sky-100 group-hover:text-sky-600'
    }
    return 'group-hover:bg-slate-100 group-hover:text-slate-700'
  }

  const renderPipelineActiveShape = (props) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
    return (
      <g>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius + 10}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
          style={{ filter: `drop-shadow(0 0 10px ${fill}66)` }}
        />
      </g>
    )
  }

  const quickMetrics = [
    {
      label: 'Clients',
      value: (totalClientsCount || stats.totalClients || 0).toLocaleString(),
      icon: Users,
      iconBg: 'bg-pastel-teal',
      iconColor: 'text-ink-teal',
      cardBg: 'bg-gradient-to-br from-blue-50/80 to-white',
      trend: {
        direction: clientTrendPercent >= 0 ? 'up' : 'down',
        value: `${Math.abs(clientTrendPercent)}%`,
        note: '전년 동월 대비',
      },
    },
    {
      label: 'Institutions',
      value: (stats.activeClients || 0).toLocaleString(),
      icon: Store,
      iconBg: 'bg-pastel-neutral',
      iconColor: 'text-slate-600',
      cardBg: 'bg-gradient-to-br from-stone-50/80 to-white',
      trend: {
        direction: activeClientTrendPercent >= 0 ? 'up' : 'down',
        value: `${Math.abs(activeClientTrendPercent)}%`,
        note: '전년 동월 대비',
      },
    },
    {
      label: 'Revenue',
      value: formatKoreanCurrency(currentMonthSalesTotal || 0),
      icon: DollarSign,
      iconBg: 'bg-pastel-green',
      iconColor: 'text-ink-green',
      cardBg: 'bg-gradient-to-br from-teal-50/80 to-white',
      trend: {
        direction: salesYoYPercent >= 0 ? 'up' : 'down',
        value: `${Math.abs(salesYoYPercent).toFixed(1)}%`,
        note: '전년 동월 대비',
      },
    },
    {
      label: 'Property',
      value: formatKoreanCurrency(averageDeal || 0),
      icon: TrendingUp,
      iconBg: 'bg-pastel-purple',
      iconColor: 'text-ink-purple',
      cardBg: 'bg-gradient-to-br from-purple-50/80 to-white',
      trend: {
        direction: averageDealTrendPercent >= 0 ? 'up' : 'down',
        value: `${Math.abs(averageDealTrendPercent)}%`,
        note: '전년 동월 대비',
      },
    },
  ]

  const featuredUsers = (clients || [])
    .slice(0, 4)
    .map((client, index) => ({
      id: client.id,
      name: client.company || client.name || `Client ${index + 1}`,
      role: client.industry || client.type || 'Enterprise',
      status: index % 2 === 0 ? 'Active' : 'Onboarding',
    }))

  const revenueStreams = [
    { label: 'Corporate Clients', value: formatKoreanCurrency((stats.thisMonthSales || 0) * 0.45) },
    { label: 'SMB Accounts', value: formatKoreanCurrency((stats.thisMonthSales || 0) * 0.3) },
    { label: 'Partnerships', value: formatKoreanCurrency((stats.thisMonthSales || 0) * 0.25) },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex-1">
            <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-[0.2em]">Overview</p>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">Dashboard</h1>
            {rawSalesData.length > 0 ? (
              <p className="text-green-500 text-sm font-medium mt-1">
                ✅ Data Loaded: {rawSalesData.length} records found.
              </p>
            ) : (
              <p className="text-red-500 text-sm font-medium mt-1">
                ❌ No Data Loaded Yet.
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto justify-end md:hidden">
            <AppInstallGuide />
          </div>
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
                    <span className={metric.trend.direction === 'up' ? 'text-red-500' : 'text-blue-500'}>
                      {metric.trend.direction === 'up' ? '↑' : '↓'} {metric.trend.value}
                    </span>
                    <span>{metric.trend.note}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="grid grid-cols-12 gap-6 items-stretch">
          <div className="col-span-12 lg:col-span-8">
            <div className="h-[400px] bg-white rounded-3xl p-6 shadow-card flex flex-col">
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
                    <AreaChart data={aggregatedMonthlyTrend} margin={{ top: 10, right: 30, left: 0, bottom: 30 }}>
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
                            const [year, month] = parsed.split('-')
                            return `${year.slice(2)}.${month}`
                          }
                          return parsed
                        }}
                        stroke="#CBD5E1"
                        tick={{ fill: '#94A3B8', fontSize: 11 }}
                        angle={-30}
                        textAnchor="end"
                        height={60}
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
            <div className="bg-gradient-teal-soft rounded-3xl p-6 shadow-card h-[400px] flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-[0.2em]">Highlight</p>
                  <h3 className="text-base md:text-lg font-bold text-slate-800">Friendly onnoee</h3>
                </div>
              </div>
              <div className="flex flex-1 items-center justify-between gap-6">
                <div className="w-full max-w-[60%]">
                  <h4 className="text-lg font-bold text-slate-800">Wesst&apos;s awardy anert</h4>
                  <p className="text-sm text-slate-600 font-medium leading-7 mt-3">
                    Geotnanospeciait or on omtn descritoner fint allectes anort seem lorem sit.
                  </p>
                </div>
                <div className="w-full max-w-[40%] flex justify-end">
                  <img
                    src={placeholderIllustration}
                    alt="Analytics Illustration"
                    className="w-full h-auto object-contain max-w-[220px]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-7">
            <div className="bg-gradient-to-br from-stone-50/70 to-white rounded-3xl p-6 shadow-card">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-[0.2em]">Clients</p>
                  <h3 className="text-base md:text-lg font-bold text-slate-800">Client Users</h3>
                </div>
              </div>
              <div className="space-y-4">
                {featuredUsers.length > 0 ? (
                  featuredUsers.map((user, index) => (
                    <div
                      key={user.id || index}
                      className="flex items-center justify-between border-b border-stone-200/70 py-4 last:border-b-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-sm font-semibold">
                          {user.name.slice(0, 2)}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{user.name}</div>
                      <div className="text-xs text-slate-500 font-medium">{user.role}</div>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                          user.status === 'Active'
                            ? 'bg-pastel-green text-ink-green'
                            : 'bg-pastel-peach text-ink-peach'
                        }`}
                      >
                        {user.status}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center text-center text-slate-500 text-sm gap-3 py-6">
                    <img
                      src={emptyStateIllustration}
                      alt="No clients"
                      className="w-full max-w-[200px] h-auto"
                    />
                    <span>표시할 고객 데이터가 없습니다.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="col-span-12 lg:col-span-5">
            <div className="bg-gradient-to-br from-amber-50/40 to-white rounded-3xl shadow-card overflow-hidden">
              <div className="bg-gradient-peach-soft px-6 py-5">
                <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-[0.2em]">Revenue</p>
                <h3 className="text-base md:text-lg font-bold text-slate-800">Revenue Streams</h3>
              </div>
              <div className="px-6 py-5 space-y-4">
                {revenueStreams.map((stream, index) => (
                  <div key={stream.label} className="flex items-center justify-between border-b border-stone-200/60 pb-4 last:border-b-0 last:pb-0">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{stream.label}</div>
                      <div className="text-xs text-slate-500 font-medium">{stream.value}</div>
                    </div>
                    <svg viewBox="0 0 120 40" className="w-28 h-8">
                      <path
                        d="M0 30 C20 10, 40 32, 60 16 C80 2, 100 22, 120 8"
                        fill="none"
                        stroke="#6CB8B0"
                        strokeWidth="2"
                      />
                      <circle cx="120" cy="8" r="3" fill="#6CB8B0" />
                    </svg>
                  </div>
                ))}
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


