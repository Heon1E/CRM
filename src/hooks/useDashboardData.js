import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { resolveSalesRep, SALES_REP_OPTIONS } from '../utils/salesRep'

export const useDashboardData = () => {
  const { user, salesRep: authSalesRep } = useAuth()
  const { clients, activities, sales, loading: dataLoading } = useData()

  const [myAccounts, setMyAccounts] = useState([])
  const [myMonthlySales, setMyMonthlySales] = useState(0)
  const [myWeeklySalesData, setMyWeeklySalesData] = useState([])
  const salesLoading = dataLoading
  const [upcomingEvents, setUpcomingEvents] = useState([])
  const [totalClientsCount, setTotalClientsCount] = useState(0)

  // 계정 -> 영업사원 이름. 다른 화면에서도 써야 해서 utils로 뺐다.
  // 로그인이 없을 때는 화면에서 고른 이름(localStorage)을 쓰므로, 그것이 바뀌면
  // 다시 계산해야 한다. 안 그러면 이름을 골라도 숫자가 그대로다.
  const [repTick, setRepTick] = useState(0)
  useEffect(() => {
    const onChange = () => setRepTick((t) => t + 1)
    window.addEventListener('my-rep-changed', onChange)
    return () => window.removeEventListener('my-rep-changed', onChange)
  }, [])
  // 프로필에 적힌 이름이 우선이다. 계정과 무관하게 화면에서 고른 값은 그 다음.
  const getUserSalesRep = useMemo(() => authSalesRep || resolveSalesRep(user), [user, authSalesRep, repTick])

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

  // 1. 총 거래처 개수
  //
  // 예전에는 여기서 count 조회를 따로 했다. DataContext가 거래처를 이미 전부
  // 들고 있으므로 세기만 하면 된다 — 조회 한 번이 그냥 사라진다.
  useEffect(() => {
    setTotalClientsCount((clients || []).length)
  }, [clients])

  // 2. 내 담당 (sales_rep 기준)
  //
  // 예전에는 거래처와 이번 달 매출을 **다시 조회**했다. 둘 다 DataContext가
  // 이미 들고 있는 것이라 순수한 낭비였고, 매출은 `select *`로 그 달 전체를
  // 받아서 브라우저에서 걸렀다. 이제 들고 있는 것에서 뽑는다.
  const myAccountIds = useMemo(() => {
    if (!getUserSalesRep) return []
    return (clients || []).filter((c) => c.sales_rep === getUserSalesRep).map((c) => c.id)
  }, [clients, getUserSalesRep])

  useEffect(() => { setMyAccounts(myAccountIds) }, [myAccountIds])

  useEffect(() => {
    if (myAccountIds.length === 0) {
      setMyMonthlySales(0)
      setMyWeeklySalesData([])
      return
    }
    const mine = new Set(myAccountIds)
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()

    const mySales = (sales || []).filter((s2) => mine.has(s2.client_id))
    const monthTotal = mySales.reduce((sum, s2) => {
      const d = new Date(s2.sale_date || s2.date || s2.created_at)
      if (d.getFullYear() !== y || d.getMonth() !== m) return sum
      return sum + (Number(s2.total_amount) || 0)
    }, 0)

    setMyMonthlySales(monthTotal)
    setMyWeeklySalesData(getWeeklySalesDataForClients(mySales))
  }, [myAccountIds, sales, getWeeklySalesDataForClients])

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

  // 4. 다가오는 후속조치 (activities.next_action_date)
  //
  // 예전에는 여기서 activities를 다시 조회했다(거래처 JOIN까지). DataContext가
  // 이미 들고 있으므로 뽑아 쓰기만 하면 된다. 덤으로 휴지통에 든 활동이
  // 자동으로 빠진다 — 직접 조회는 그걸 거르지 않았다.
  const clientNameById = useMemo(() => {
    const m = new Map()
    for (const c of clients || []) m.set(c.id, c.company)
    return m
  }, [clients])

  useEffect(() => {
    const events = (activities || [])
      .filter((a) => a.next_action_date)
      .sort((a, b) => String(a.next_action_date).localeCompare(String(b.next_action_date)))
      .slice(0, 20)
      .map((a) => ({
        ...a,
        clientName: clientNameById.get(a.client_id) || a.client_name || '알 수 없음',
        scheduleDate: a.next_action_date,
      }))
    setUpcomingEvents(events)
  }, [activities, clientNameById])

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
