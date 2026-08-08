import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { supabase } from '../lib/supabase'

export const useDashboardData = () => {
  const { user } = useAuth()
  const { clients, activities, sales, loading: dataLoading } = useData()

  const [myAccounts, setMyAccounts] = useState([])
  const [myMonthlySales, setMyMonthlySales] = useState(0)
  const [myWeeklySalesData, setMyWeeklySalesData] = useState([])
  const salesLoading = dataLoading
  const [upcomingEvents, setUpcomingEvents] = useState([])
  const [totalClientsCount, setTotalClientsCount] = useState(0)

  // Sales Rep 옵션
  const SALES_REP_OPTIONS = ['박민철', '송원기', '이헌일']

  // 사용자 이름 매핑
  const getUserSalesRep = useMemo(() => {
    if (!user) return null
    const userName = user.user_metadata?.full_name || user.email || ''

    // 영어 이름 -> 한글 이름 매핑
    const nameMapping = {
      'Heonil Lee': '이헌일',
      'heonil lee': '이헌일',
      'Heonil': '이헌일',
      'heonil': '이헌일',
    }

    if (nameMapping[userName]) return nameMapping[userName]
    if (SALES_REP_OPTIONS.includes(userName)) return userName

    const emailName = user.email?.split('@')[0]?.toLowerCase()
    if (emailName && nameMapping[emailName]) return nameMapping[emailName]

    return null
  }, [user])

  // 유틸리티: 주간 매출 데이터 계산
  const getWeeklySalesDataForClients = useCallback((salesData) => {
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
  }, [])

  // 1. 총 거래처 개수 조회
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
        setTotalClientsCount(clients.length)
      }
    }
    fetchTotalClientsCount()
  }, [clients.length])

  // 2. My Data (Sales Rep 기준)
  useEffect(() => {
    const fetchMyData = async () => {
      if (!getUserSalesRep) {
        setMyAccounts([])
        setMyMonthlySales(0)
        setMyWeeklySalesData([])
        return
      }

      try {
        const { data: myClientsData, error: clientsError } = await supabase
          .from('clients')
          .select('id')
          .eq('sales_rep', getUserSalesRep)

        if (clientsError) throw clientsError

        const myClientIds = (myClientsData || []).map(c => c.id)
        setMyAccounts(myClientIds)

        if (myClientIds.length === 0) {
          setMyMonthlySales(0)
          setMyWeeklySalesData([])
          return
        }

        const now = new Date()
        const currentYear = now.getFullYear()
        const currentMonth = now.getMonth() + 1
        const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
        // 실제 해당 월의 마지막 날 계산 (월+1의 0번째 날 = 이번 달 마지막 날)
        const lastDayOfMonth = new Date(currentYear, currentMonth, 0).getDate()
        const endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${lastDayOfMonth}`

        const { data: allSalesData, error: salesError } = await supabase
          .from('sales')
          .select('*')
          .gte('sale_date', startDate)
          .lte('sale_date', endDate)

        if (salesError) throw salesError

        const mySalesData = (allSalesData || []).filter(sale =>
          myClientIds.includes(sale.client_id)
        )

        const monthlyTotal = (mySalesData || []).reduce((sum, sale) => {
          return sum + (sale.total_amount || 0)
        }, 0)
        setMyMonthlySales(monthlyTotal)

        const weeklyData = getWeeklySalesDataForClients(mySalesData || [])
        setMyWeeklySalesData(weeklyData)
      } catch (error) {
        console.error('My Data 조회 오류:', error)
      }
    }

    fetchMyData()
  }, [getUserSalesRep, getWeeklySalesDataForClients])

  // 3. 전체 매출 데이터
  //
  // 예전에는 여기서 sales 전체를 또 조회했다. DataContext도 같은 걸 조회하므로
  // 1.5만 행을 **두 번** 읽었고, 그래서 첫 화면이 느려 상단 카드가 0으로 보였다
  // (새로고침 버튼을 눌러야 채워졌다).
  // DataContext가 이미 들고 있는 것을 쓰고, 화면이 기대하는 형태로만 맞춘다.
  const rawSalesData = useMemo(() => (sales || []).map((sale) => ({
    ...sale,
    totalAmount: sale.total_amount || 0,
    items: sale.sales_items || sale.items || [],
    // sale_date vs date 호환성
    date: sale.sale_date || sale.date,
  })), [sales])

  // 4. Upcoming Events
  useEffect(() => {
    const fetchUpcomingEvents = async () => {
      try {
        // Activities with next_action_date
        const { data: activitiesData, error: activitiesError } = await supabase
          .from('activities')
          .select('*, clients(id, company)') // JOIN 사용
          .not('next_action_date', 'is', null)
          .order('next_action_date', { ascending: true })
          .limit(20)

        if (activitiesError) throw activitiesError

        const mergedEvents = (activitiesData || []).map(activity => ({
          ...activity,
          clientName: activity.clients?.company || '알 수 없음',
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

  // Top Clients Calculation
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

    rawSalesData.forEach((sale) => {
      const clientId = sale.client_id
      if (!clientId) return
      const amount = Number(sale.totalAmount || 0)
      totalsByClient.set(clientId, (totalsByClient.get(clientId) || 0) + amount)

      const rawDate = sale.date || sale.created_at
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
          : currentTotal > 0 ? 100 : 0

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

  return {
    user,
    getUserSalesRep,
    myAccounts,
    myMonthlySales,
    myWeeklySalesData,
    rawSalesData,
    salesLoading,
    upcomingEvents,
    totalClientsCount,
    topClients
  }
}
