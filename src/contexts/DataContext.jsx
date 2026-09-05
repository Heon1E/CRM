import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import {
  getAllData as getOfflineData,
  saveToStore,
  deleteFromStore,
  getStoreName,
  STORES
} from '../utils/offlineDB'
import {
  addToQueue,
  getPendingOperations,
  updateQueueStatus,
  removeFromQueue,
  QUEUE_STATUS,
  QUEUE_OPERATION,
  getQueueCount
} from '../utils/syncQueue'

const DataContext = createContext()

export const useData = () => {
  const context = useContext(DataContext)
  if (!context) throw new Error('useData must be used within a DataProvider')
  return context
}

export const DataProvider = ({ children }) => {
  const { user, loading: authLoading } = useAuth()
  const { isOnline } = useOnlineStatus()
  const [products, setProducts] = useState([])
  const [clients, setClients] = useState([])
  const [activities, setActivities] = useState([])
  const [sales, setSales] = useState([])
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  const [openModalCount, setOpenModalCount] = useState(0)

  // [Performance Check] 대시보드 통계 미리 계산하여 캐싱 (탭 전환 딜레이 제거)
  const [dashboardStats, setDashboardStats] = useState(null)
  // 품목·수량·단가까지 다 받았는가 (두 번째 조회가 끝났는가)
  const [salesDetailReady, setSalesDetailReady] = useState(false)

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  // --- Dashboard Statistics Calculation (Pre-compute) ---
  useEffect(() => {
    // 데이터가 충분하지 않으면 계산 스킵 (로딩 중이거나 초기 상태)
    if (loading || !sales || !clients) return

    // 계산 비용을 최적화하기 위해 비동기 처리 (메인 스레드 차단 방지)
    const calculate = async () => {
      const now = new Date()
      const currentRange = {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      }
      const oneYearAgoDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())

      const rawSalesData = sales || []

      const isInRange = (d, range) => {
        if (!d) return false
        const parsed = new Date(d)
        return parsed >= range.start && parsed <= range.end
      }

      // 1. Monthly Revenue
      const currentMonthSales = rawSalesData.filter((sale) =>
        isInRange(sale.sale_date || sale.date || sale.created_at, currentRange)
      )
      const currentMonthSalesTotal = currentMonthSales.reduce(
        (sum, sale) => sum + (Number(sale.total_amount ?? sale.totalAmount ?? 0) || 0), 0
      )

      // 2. Client Counts
      const salesSince2023 = rawSalesData.filter((sale) => {
        const d = new Date(sale.sale_date || sale.date || sale.created_at)
        return d >= new Date('2023-01-01')
      })
      const totalClientIds = new Set(salesSince2023.map(s => s.client_id || s.clientId))
      const totalClientsCount = totalClientIds.size

      const activeSales = rawSalesData.filter((sale) => {
        const d = new Date(sale.sale_date || sale.date || sale.created_at)
        return d >= oneYearAgoDate && d <= now
      })
      const activeClientIds = new Set(activeSales.map(s => s.client_id || s.clientId))
      const currentActiveClientsCount = activeClientIds.size

      // Churned
      const churnedClientIds = new Set([...totalClientIds].filter(x => !activeClientIds.has(x)))
      const currentChurnedCount = churnedClientIds.size

      // 3. YoY & Trends (Same-Period Comparison with Business Day Awareness)
      // Compare same date range: e.g., Feb 1-2 2026 vs Feb 1-2 2025
      // BUT: Detect if last year's period was mostly weekends/holidays
      const currentDayOfMonth = now.getDate()

      // Last year, same month, same day range (1st ~ current day)
      const lastYearSamePeriodStart = new Date(now.getFullYear() - 1, now.getMonth(), 1)
      const lastYearSamePeriodEnd = new Date(now.getFullYear() - 1, now.getMonth(), currentDayOfMonth, 23, 59, 59, 999)

      const lastYearSamePeriodSales = rawSalesData.filter((sale) => {
        const d = new Date(sale.sale_date || sale.date || sale.created_at)
        return d >= lastYearSamePeriodStart && d <= lastYearSamePeriodEnd
      })
      const lastYearSamePeriodTotal = lastYearSamePeriodSales.reduce(
        (sum, sale) => sum + (Number(sale.total_amount ?? sale.totalAmount ?? 0) || 0), 0
      )

      // Count business days in both periods for context
      const countBusinessDays = (startDate, endDate) => {
        let count = 0
        const current = new Date(startDate)
        while (current <= endDate) {
          const dayOfWeek = current.getDay()
          if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday(0) or Saturday(6)
            count++
          }
          current.setDate(current.getDate() + 1)
        }
        return count
      }

      const currentPeriodBusinessDays = countBusinessDays(
        new Date(now.getFullYear(), now.getMonth(), 1),
        now
      )
      const lastYearPeriodBusinessDays = countBusinessDays(
        lastYearSamePeriodStart,
        lastYearSamePeriodEnd
      )

      // Flag if comparison is skewed due to weekend/holiday mismatch
      const isComparisonSkewed = Math.abs(currentPeriodBusinessDays - lastYearPeriodBusinessDays) >= 2

      const revenueYoY = lastYearSamePeriodTotal > 0
        ? ((currentMonthSalesTotal - lastYearSamePeriodTotal) / lastYearSamePeriodTotal * 100).toFixed(1)
        : (currentMonthSalesTotal > 0 ? '100.0' : '0.0')

      // Client Growth
      const clientsLastYear = rawSalesData.filter(s => {
        const d = new Date(s.sale_date || s.date || s.created_at)
        return d < oneYearAgoDate && d >= new Date('2023-01-01')
      }).map(s => s.client_id || s.clientId)
      const clientsLastYearCount = new Set(clientsLastYear).size
      const clientGrowthVal = clientsLastYearCount > 0
        ? ((totalClientsCount - clientsLastYearCount) / clientsLastYearCount * 100).toFixed(0)
        : 0

      // 4. Chart Data (Aggregated Monthly Trend)
      const aggregatedMonthlyTrend = []
      const start = new Date(now.getFullYear(), now.getMonth() - 11, 1)
      for (let i = 0; i < 12; i += 1) {
        const date = new Date(start.getFullYear(), start.getMonth() + i, 1)
        const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        const monStart = new Date(date.getFullYear(), date.getMonth(), 1)
        const monEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59)
        const totalRevenue = rawSalesData.reduce((sum, sale) => {
          const d = new Date(sale.sale_date || sale.date || sale.created_at)
          if (d >= monStart && d <= monEnd) {
            return sum + (Number(sale.total_amount ?? sale.totalAmount ?? 0) || 0)
          }
          return sum
        }, 0)
        aggregatedMonthlyTrend.push({ monthStr, totalRevenue })
      }

      // 5. Top 3 Revenue Clients
      const clientRevenueMap = {}
      activeSales.forEach(s => {
        const cid = s.client_id || s.clientId
        if (!cid) return
        clientRevenueMap[cid] = (clientRevenueMap[cid] || 0) + (Number(s.total_amount ?? s.totalAmount ?? 0) || 0)
      })
      const topRevenueClients = Object.entries(clientRevenueMap)
        .map(([id, total]) => {
          const c = clients.find(x => x.id === id)
          return { id, name: c?.company || 'Unknown', total }
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)

      // 6. Fastest Growing Clients (Safe Mode: Use Last Month if early in current month)
      const topGrowthClients = []
      const currentDay = now.getDate()

      // If within first 5 days of month, analyze Last Month vs Prior Month
      // Otherwise, analyze Current Month vs Last Month
      const useLastMonthAsBasis = currentDay <= 5

      const targetMonthStart = useLastMonthAsBasis
        ? new Date(now.getFullYear(), now.getMonth() - 1, 1) // Jan 1 if Now is Feb 1
        : new Date(now.getFullYear(), now.getMonth(), 1)

      const targetMonthEnd = useLastMonthAsBasis
        ? new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999) // Jan 31
        : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

      const comparisonMonthStart = useLastMonthAsBasis
        ? new Date(now.getFullYear(), now.getMonth() - 2, 1) // Dec 1
        : new Date(now.getFullYear(), now.getMonth() - 1, 1)

      const comparisonMonthEnd = useLastMonthAsBasis
        ? new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999) // Dec 31
        : new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

      const growthStats = {}

      rawSalesData.forEach(sale => {
        const clientId = sale.client_id || sale.clientId
        if (!clientId) return
        const d = new Date(sale.sale_date || sale.date || sale.created_at)
        const amount = Number(sale.total_amount ?? sale.totalAmount ?? 0) || 0

        if (!growthStats[clientId]) {
          const clientObj = clients.find(c => c.id === clientId)
          growthStats[clientId] = {
            id: clientId,
            name: clientObj?.company || clientObj?.name || 'Unknown',
            role: clientObj?.industry || clientObj?.type || '',
            targetMonthAmt: 0,
            comparisonMonthAmt: 0,
            historicalBeforeTarget: 0,
          }
        }

        if (d >= targetMonthStart && d <= targetMonthEnd) {
          growthStats[clientId].targetMonthAmt += amount
        } else if (d >= comparisonMonthStart && d <= comparisonMonthEnd) {
          growthStats[clientId].comparisonMonthAmt += amount
        } else if (d < targetMonthStart) {
          // Count total historical revenue to determine "True New"
          growthStats[clientId].historicalBeforeTarget += amount
        }
      })

      const calculatedGrowthClients = Object.values(growthStats)
        .filter(c => c.targetMonthAmt > 0)
        .map(c => {
          const isTrueNew = c.historicalBeforeTarget === 0
          let growthRate = 0
          if (c.comparisonMonthAmt > 0) {
            growthRate = ((c.targetMonthAmt - c.comparisonMonthAmt) / c.comparisonMonthAmt) * 100
          } else if (c.targetMonthAmt > 0) {
            growthRate = 100 // Infinite/New growth
          }

          return { ...c, isTrueNew, growthRate, amount: c.targetMonthAmt }
        })
        .sort((a, b) => {
          if (a.isTrueNew && !b.isTrueNew) return -1
          if (!a.isTrueNew && b.isTrueNew) return 1
          // if both new, sort by amounts
          if (a.isTrueNew && b.isTrueNew) return b.amount - a.amount
          // otherwise sort by growth rate
          return b.growthRate - a.growthRate
        })
        .slice(0, 4)

      // 4. Sales Intelligence Metrics for AI Insight
      // Dormant clients: had sales 3-12 months ago, but not in last 3 months
      const threeMonthsAgo = new Date(now)
      threeMonthsAgo.setMonth(now.getMonth() - 3)
      const twelveMonthsAgo = new Date(now)
      twelveMonthsAgo.setMonth(now.getMonth() - 12)

      const recentClientIds = new Set(
        rawSalesData
          .filter(s => new Date(s.sale_date || s.date || s.created_at) >= threeMonthsAgo)
          .map(s => s.client_id || s.clientId)
      )

      const dormantClientIds = new Set(
        rawSalesData
          .filter(s => {
            const d = new Date(s.sale_date || s.date || s.created_at)
            return d >= twelveMonthsAgo && d < threeMonthsAgo
          })
          .map(s => s.client_id || s.clientId)
          .filter(id => !recentClientIds.has(id))
      )

      // Top client concentration (% of revenue from top 3 clients)
      const topThreeRevenue = topRevenueClients.slice(0, 3).reduce((sum, c) => sum + c.total, 0)
      const topClientConcentration = currentMonthSalesTotal > 0
        ? ((topThreeRevenue / currentMonthSalesTotal) * 100).toFixed(0)
        : 0

      // Recent activity count (last 7 days)
      const sevenDaysAgo = new Date(now)
      sevenDaysAgo.setDate(now.getDate() - 7)
      const recentActivitiesCount = activities.filter(a => {
        const d = new Date(a.activity_date || a.date || a.created_at)
        return d >= sevenDaysAgo
      }).length

      // 5. Detailed Data Lists for AI Drill-Down
      // Dormant Clients Details (with contact info and historical revenue)
      const dormantClientsDetails = Array.from(dormantClientIds).map(clientId => {
        const client = clients.find(c => c.id === clientId)
        if (!client) return null

        // Get historical sales (3-12 months ago)
        const historicalSales = rawSalesData.filter(s => {
          const d = new Date(s.sale_date || s.date || s.created_at)
          const cid = s.client_id || s.clientId
          return cid === clientId && d >= twelveMonthsAgo && d < threeMonthsAgo
        })

        const historicalRevenue = historicalSales.reduce(
          (sum, s) => sum + (Number(s.total_amount ?? s.totalAmount ?? 0) || 0), 0
        )

        // Get last sale info
        const lastSale = historicalSales.sort((a, b) =>
          new Date(b.sale_date || b.date || b.created_at) - new Date(a.sale_date || a.date || a.created_at)
        )[0]

        return {
          id: client.id,
          company: client.company,
          contactPerson: client.contact_person || client.contactPerson,
          phone: client.phone,
          email: client.email,
          lastSaleDate: lastSale ? (lastSale.sale_date || lastSale.date || lastSale.created_at) : null,
          lastSaleAmount: lastSale ? (Number(lastSale.total_amount ?? lastSale.totalAmount ?? 0) || 0) : 0,
          historicalRevenue: historicalRevenue,
          status: client.status
        }
      }).filter(Boolean).sort((a, b) => b.historicalRevenue - a.historicalRevenue)

      // Top Clients Details (with percentage)
      const topClientsDetails = topRevenueClients.slice(0, 10).map(c => ({
        ...c,
        percentage: currentMonthSalesTotal > 0
          ? ((c.total / currentMonthSalesTotal) * 100).toFixed(1)
          : 0
      }))

      // Recent Activities Details
      const recentActivitiesDetails = activities
        .filter(a => {
          const d = new Date(a.activity_date || a.date || a.created_at)
          return d >= sevenDaysAgo
        })
        .map(a => {
          const client = clients.find(c => c.id === a.client_id)
          return {
            id: a.id,
            date: a.activity_date || a.date || a.created_at,
            client: client?.company || 'Unknown',
            clientId: a.client_id,
            type: a.activity_type || a.type,
            description: a.description || a.notes,
            status: a.status
          }
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date))

      setDashboardStats({
        currentMonthSalesTotal,
        totalClientsCount,
        currentActiveClientsCount,
        currentChurnedCount,
        revenueYoY,
        lastYearSamePeriodTotal, // For AI Insight comparison context
        isComparisonSkewed, // Flag for weekend/holiday mismatch
        currentPeriodBusinessDays,
        lastYearPeriodBusinessDays,
        clientGrowthVal,
        aggregatedMonthlyTrend,
        topRevenueClients,
        topGrowthClients: calculatedGrowthClients,
        // Sales Intelligence
        dormantClientsCount: dormantClientIds.size,
        topClientConcentration,
        recentActivitiesCount,
        // Detailed Data for AI Drill-Down
        dormantClientsDetails,
        topClientsDetails,
        recentActivitiesDetails,
        lastUpdated: new Date()
      })
    }

    // setTimeout을 사용하여 렌더링 사이클 이후에 실행 (non-blocking)
    const timer = setTimeout(() => {
      calculate()
    }, 0)

    return () => clearTimeout(timer)

  }, [sales, clients, loading])

  // 1. 유틸리티 함수
  // 1. 유틸리티 함수
  const getValidUserId = async (currentUser) => {
    // 1. 현재 로그인된 유저 ID가 있으면 최우선 사용
    // 1. 현재 로그인된 유저 ID가 있으면 최우선 사용 (단, 더미 ID는 제외)
    if (currentUser?.id && currentUser.id !== '00000000-0000-0000-0000-000000000000') return currentUser.id

    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (authUser?.id) return authUser.id

    // 2. [In-Memory Fallback] 이미 로드된 데이터에서 성공했던 ID를 재사용 (가장 확실함)
    // 데이터가 로드되어 있다는 건, 그 데이터를 만든 유저 ID가 유효하다는 뜻.
    const validActivity = activities.find(a => a.created_by && a.created_by !== '00000000-0000-0000-0000-000000000000')
    if (validActivity?.created_by) {
      console.log(`[getValidUserId] Reusing valid User ID from loaded activities: ${validActivity.created_by}`)
      return validActivity.created_by
    }

    const validClient = clients.find(c => c.created_by && c.created_by !== '00000000-0000-0000-0000-000000000000')
    if (validClient?.created_by) {
      console.log(`[getValidUserId] Reusing valid User ID from loaded clients: ${validClient.created_by}`)
      return validClient.created_by
    }

    // 3. In-Memory에도 없으면 DB 조회 (최후의 수단)
    try {
      const { data: existingActivity } = await supabase
        .from('activities')
        .select('created_by')
        .not('created_by', 'is', null)
        .limit(1)
        .maybeSingle()

      if (existingActivity?.created_by) return existingActivity.created_by

      // [New Fallback] sales 테이블에서도 검색
      const { data: existingSale } = await supabase
        .from('sales')
        .select('created_by')
        .not('created_by', 'is', null)
        .limit(1)
        .maybeSingle()

      if (existingSale?.created_by) return existingSale.created_by
    } catch (e) {
      console.error('[getValidUserId] DB fallback failed:', e)
    }

    // 4. 정말 아무것도 없으면... 유저가 찾아준 유효한 ID 사용 (Hardcoded Fallback)
    const ULTIMATE_FALLBACK_ID = 'baad5267-f87d-4429-a7c3-f6f1a966d68d'
    console.warn(`[getValidUserId] WARNING: No valid user found in Auth/Memory/DB. Using Hardcoded Fallback: ${ULTIMATE_FALLBACK_ID}`)
    return ULTIMATE_FALLBACK_ID
  }

  // 매출 데이터 그룹화 함수 (sale_date, client_id, created_at 분 단위 기준)
  const processGroupedSales = useCallback((salesArray) => {
    if (!salesArray || salesArray.length === 0) return []

    // 먼저 camelCase 필드 추가 (기존 매핑)
    const normalizedSales = salesArray.map(s => ({
      ...s,
      clientId: s.client_id || s.clientId,
      totalAmount: s.total_amount || s.totalAmount || 0,
      date: s.sale_date || s.date,
      created_at: s.created_at || s.createdAt
    }))

    // 그룹화 키 생성 함수: sale_date + client_id + created_at의 분 단위까지
    const getGroupKey = (sale) => {
      const saleDate = sale.sale_date || sale.date || ''
      const clientId = sale.client_id || sale.clientId || ''
      // created_at을 분 단위까지 포함 (YYYY-MM-DDTHH:mm)
      let createdAtKey = ''
      if (sale.created_at) {
        const createdAt = new Date(sale.created_at)
        if (!isNaN(createdAt.getTime())) {
          const year = createdAt.getFullYear()
          const month = String(createdAt.getMonth() + 1).padStart(2, '0')
          const day = String(createdAt.getDate()).padStart(2, '0')
          const hours = String(createdAt.getHours()).padStart(2, '0')
          const minutes = String(createdAt.getMinutes()).padStart(2, '0')
          createdAtKey = `${year}-${month}-${day}T${hours}:${minutes}`
        }
      }
      return `${saleDate}|${clientId}|${createdAtKey}`
    }

    // 그룹화
    const groupedMap = {}
    normalizedSales.forEach(sale => {
      const key = getGroupKey(sale)
      if (!groupedMap[key]) {
        groupedMap[key] = []
      }
      groupedMap[key].push(sale)
    })

    // 그룹화된 데이터를 결과 배열로 변환
    const groupedResults = Object.values(groupedMap).map(group => {
      // 그룹 내 품목 정렬 (created_at 기준, 없으면 id 기준)
      const sortedItems = [...group].sort((a, b) => {
        if (a.created_at && b.created_at) {
          return new Date(a.created_at) - new Date(b.created_at)
        }
        return (a.id || '').localeCompare(b.id || '')
      })

      // 첫 번째 항목을 기본값으로 사용
      const firstItem = sortedItems[0]
      const saleDate = firstItem.sale_date || firstItem.date || ''
      const clientId = firstItem.client_id || firstItem.clientId || ''
      const notes = firstItem.notes || ''
      const createdAt = firstItem.created_at || null

      // 총 금액 합계
      const totalAmount = sortedItems.reduce((sum, item) => {
        const amount = item.total_amount || item.totalAmount || 0
        return sum + Number(amount)
      }, 0)

      // 품목 수
      const itemCount = sortedItems.length

      // 첫 번째 품목명
      const firstItemName = firstItem.item_name || firstItem.itemName || firstItem.product_name || '-'

      // displayItemName 생성
      const displayItemName = itemCount > 1
        ? `${firstItemName} 외 ${itemCount - 1}건`
        : firstItemName

      // 그룹화된 결과 객체 생성
      const groupedSale = {
        id: firstItem.id || `${clientId}-${saleDate}-${createdAt || Date.now()}`,
        sale_date: saleDate,
        date: saleDate,
        client_id: clientId,
        clientId: clientId,
        clientName: firstItem.clientName || '', // 거래처명 유지
        notes: notes,
        created_at: createdAt,
        total_amount: totalAmount,
        totalAmount: totalAmount,
        itemCount: itemCount,
        displayItemName: displayItemName,
        items: sortedItems.map(item => ({
          id: item.id,
          item_name: item.item_name || item.itemName || item.product_name || '',
          product_id: item.product_id || item.productId || '',
          quantity: item.quantity || 0,
          unit_price: item.unit_price || item.unitPrice || item.price || 0,
          total_amount: item.total_amount || item.totalAmount || 0,
          notes: item.notes || ''
        }))
      }

      return groupedSale
    })

    return groupedResults
  }, [])


  // 4. 데이터 전체 페칭 헬퍼 (Supabase 1000건 제한 우회)
  // 마이그레이션 전 경고를 표마다 반복하지 않기 위한 표시
  const softDeleteWarned = useRef(false)

  const fetchAllRecords = async (table, selectStr = '*', orderCol = 'id', ascending = true, filters = null) => {
    let allData = []
    let from = 0
    const step = 1000

    try {
      while (true) {
        // console.log(`[DataContext] Fetching ${table}... (Range: ${from} - ${from + step - 1})`)
        /*
         * **정렬 기준이 유일해야 한다.** `.order()`를 주는 것만으로는 부족하다.
         *
         * 매출은 `sale_date`로 정렬하는데 같은 날짜가 수십 건이다. 값이 같은 행들의
         * 순서는 정해져 있지 않아서, 1,000행씩 끊어 받으면 **페이지 경계에서 어떤 행은
         * 두 번 오고 어떤 행은 아예 안 온다.**
         *
         * 실측(2026-08-15, 브라우저): `deleted_at is null`을 붙인 조회에서
         * 15,221행을 받았는데 고유 id는 **15,194개**였다 — 27행 중복, 27행 누락.
         * 매출 합계가 5,125,000원 많게 나왔다. 조건을 빼면 우연히 맞는다(계획이 바뀐다).
         *
         * 화면에서는 이렇게 보였다 — 어떤 거래처의 6/8 주문이 통째로 사라지고,
         * 다른 거래처의 같은 날 주문이 정확히 두 배가 됐다. KPI 부문기여가
         * 58% 대신 59%로 나온 원인이다.
         *
         * `id`를 마지막 정렬 기준으로 더하면 순서가 유일해져 경계가 흔들리지 않는다.
         */
        /*
         * **조회를 만들 때마다 새로 짓는다.**
         * 예전에는 `query`를 한 번 만들어 두고 실패하면 그것을 다시 `await`
         * 했는데, 그렇게는 폴백이 절대 동작하지 않는다:
         *   1. `.is('deleted_at', null)`은 새 객체를 주는 것이 아니라
         *      **그 빌더 자신에 조건을 붙이고 자기를 돌려준다.** 그래서 재시도할
         *      `query`에도 이미 `deleted_at` 조건이 들어 있다.
         *   2. 빌더는 한 번 `await`하면 그 약속이 굳는다. 다시 `await`해도
         *      요청이 새로 나가지 않고 같은 결과가 돌아온다.
         * 결국 재시도가 같은 오류를 되풀이하고 `throw`로 떨어졌다.
         *
         * 실측: `issues` 표에 `deleted_at`이 없어 첫 화면마다
         * `column issues.deleted_at does not exist`가 나고 이슈 목록이 통째로
         * 비어 있었다(콘솔 오류 995건). 폴백이 있다고 적어 두었는데 없었던 셈이다.
         */
        const build = () => {
          let q = supabase
            .from(table)
            .select(selectStr)
            .order(orderCol, { ascending })
          if (orderCol !== 'id') q = q.order('id', { ascending: true })
          q = q.range(from, from + step - 1)
          if (filters && typeof filters === 'function') q = filters(q)
          return q
        }

        // 휴지통에 든 행은 빼고 가져온다.
        // 마이그레이션(soft_delete_and_audit.sql) 전이거나 그 칸이 없는 표
        // (`issues` 등)에서는 조건 없이 한 번 더 시도한다. 앱이 먼저 죽으면 안 된다.
        let { data, error } = await build().is('deleted_at', null)
        if (error && (error.code === '42703' || /deleted_at/.test(error.message || ''))) {
          if (!softDeleteWarned.current) {
            console.warn(`[DataContext] '${table}'에 deleted_at 칸이 없어 조건 없이 다시 받습니다.`
                + ' 휴지통을 쓰려면 execution/sql/soft_delete_and_audit.sql 을 실행하세요.')
            softDeleteWarned.current = true
          }
          ;({ data, error } = await build())
        }
        if (error) throw error
        if (!data || data.length === 0) {
          console.log(`[DataContext] No more data for ${table} after ${allData.length} records.`)
          break
        }

        allData = [...allData, ...data]
        // console.log(`[DataContext] ${table} progressive total: ${allData.length}`)

        if (data.length < step) break
        from += step
      }
      return { data: allData, error: null }
    } catch (error) {
      console.error(`[DataContext] fetchAllRecords fatal error (${table}):`, error)
      return { data: allData, error } // 위기 상황에서도 가져온 데이터는 반환
    }
  }

  const sanitizeData = useCallback((data, type) => {
    const sanitized = { ...data }

    // 공통: DB에 존재하지 않는 임시 필드 제거 (rowIndex 등) - PGRST204 에러 방지
    delete sanitized.rowIndex
    delete sanitized.clientName // 엑셀 파싱 시 사용된 임시 필드

    // clients 테이블 전용 처리
    if (type === 'client') {
      // DB에 없는 필드 제거 (clients 테이블에 존재하지 않는 필드들)
      delete sanitized.activity_date
      delete sanitized.lastOrder // DB 컬럼명은 last_order이므로 제거
      delete sanitized.orderAmount // DB 컬럼명은 order_amount이므로 제거 (클라이언트 등록/수정 시 사용하지 않음)
      delete sanitized.contacts // contacts는 별도로 처리되므로 제거
      delete sanitized.contact_person // DB에 없는 필드 (client_contacts 테이블로 이관됨)
      delete sanitized.phone // DB에 없는 필드 (client_contacts 테이블로 이관됨)
      delete sanitized.email // DB에 없는 필드 (client_contacts 테이블로 이관됨)

      // clients 테이블에 존재하지 않는 필드들 제거
      delete sanitized.unitPrice
      delete sanitized.quantity
      delete sanitized.totalAmount
      delete sanitized.clientId
      delete sanitized.date
      delete sanitized.price // DB에 없는 필드 (products 테이블용)
      delete sanitized.unit_price // DB에 없는 필드 (sales 테이블용)
      delete sanitized.totalRevenue // DB에 없는 가상 필드 (DataContext에서 계산됨)
      delete sanitized.last_year_revenue // DB에 없는 가상 필드 (오류 방지)

      // 디버깅: DB에 전송될 데이터 확인 (최종 검증)
      console.log('[sanitizeData] clients 테이블에 저장될 데이터 (최종 검증):', sanitized)
      console.log('[sanitizeData] 전송될 데이터의 키 목록:', Object.keys(sanitized))
    } else {
      const dateFields = ['sale_date', 'activity_date', 'lastOrder', 'next_action_date', 'target_date']
      dateFields.forEach(f => { if (!sanitized[f] || sanitized[f] === '') sanitized[f] = null })

      const numberFields = ['orderAmount', 'totalAmount', 'quantity', 'unitPrice']
      numberFields.forEach(f => {
        const val = sanitized[f]
        sanitized[f] = (val === '' || val === undefined || val === null) ? 0 : parseFloat(val) || 0
      })
    }

    return sanitized
  }, [])

  /**
   * 거래처 담당자를 통째로 갈아 끼운다.
   *
   * **지우고 넣는 사이에서 실패하면 담당자가 통째로 사라진다.** 예전 코드는
   * `delete()`와 `insert()` 둘 다 결과를 보지 않고 무조건 `{ success: true }`를
   * 돌려줬다. 지우기는 이미 커밋됐는데 넣기가 실패하면 그 거래처의 담당자가
   * 전부 없어지고, 화면은 '저장했습니다'라고 말한다. **하드 삭제라 되돌릴
   * 방법도 없다** (아모레퍼시픽이면 전화번호 가진 4명이 그대로 날아간다).
   *
   * 실제로 그 실패를 만드는 경로가 있었다 — 명함 스캔(`BusinessCardScannerModal`)이
   * 기존 담당자 뒤에 새 사람을 `is_primary: true`로 붙여 넘긴다. 그 거래처에
   * 이미 대표가 있으면 **대표가 둘**이 되어 유니크 제약
   * (`idx_single_primary_contact`)이 배치 전체를 거절한다.
   *
   * 셋을 지킨다:
   *   1. **대표는 하나만** 남긴다 — 넣기 전에 다듬는다. 막을 수 있는 실패는 막는다.
   *   2. 지우기·넣기의 **오류를 본다.** 실패를 성공이라고 말하지 않는다.
   *   3. 그래도 넣기가 실패하면 **지운 것을 그대로 되돌린다** (id까지 원래대로).
   */
  const replaceClientContacts = useCallback(async (clientId, contacts) => {
    try {
      const userId = await getValidUserId(user)

      // 1) 넣을 것을 먼저 다듬는다. 대표는 앞선 하나만 남기고 나머지는 내린다.
      let primaryTaken = false
      const toInsert = (contacts || [])
        .filter(c => (c?.name || '').trim())
        .map(c => {
          const isPrimary = !!c.is_primary && !primaryTaken
          if (isPrimary) primaryTaken = true
          return {
            client_id: clientId,
            name: c.name || '',
            department_role: c.department_role || '',
            phone: c.phone || '',
            email: c.email || '',
            is_primary: isPrimary,
            created_by: userId,
          }
        })

      // 2) 되돌릴 수 있도록 지금 것을 손에 쥐고 시작한다
      const { data: before, error: readError } = await supabase
        .from('client_contacts').select('*').eq('client_id', clientId)
      if (readError) throw readError

      const { error: deleteError } = await supabase
        .from('client_contacts').delete().eq('client_id', clientId)
      if (deleteError) throw deleteError

      if (toInsert.length === 0) return { success: true }

      const { error: insertError } = await supabase.from('client_contacts').insert(toInsert)
      if (insertError) {
        // 3) 지우기는 이미 커밋됐다. 원래대로 돌려놓고 실패를 알린다.
        if (before?.length) {
          const { error: restoreError } = await supabase.from('client_contacts').insert(before)
          if (restoreError) {
            console.error('담당자 복구 실패 — 수동 확인 필요:', clientId, restoreError.message)
          }
        }
        throw insertError
      }
      return { success: true }
    } catch (error) { return { success: false, error } }
  }, [user])

  // 3. 통계 계산 로직 (Dashboard 에러 해결 핵심)
  const getStats = useCallback(() => {
    const totalClients = clients.length
    const activeClients = clients.filter(c => c.status === '매출' || c.status === '활성').length
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()

    const thisMonthActivities = activities.filter(a => {
      const d = new Date(a.activity_date || a.date)
      return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear
    }).length

    const thisMonthSales = sales.filter(s => {
      const d = new Date(s.sale_date || s.date)
      return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear
    }).reduce((sum, s) => {
      // DB 스키마 규격 우선: total_amount > totalAmount
      const amount = s.total_amount !== undefined && s.total_amount !== null
        ? Number(s.total_amount)
        : (s.totalAmount !== undefined && s.totalAmount !== null ? Number(s.totalAmount) : 0)
      return sum + amount
    }, 0)

    const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1
    const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear
    const lastMonthSales = sales.filter(s => {
      const d = new Date(s.sale_date || s.date)
      return d.getMonth() + 1 === lastMonth && d.getFullYear() === lastMonthYear
    }).reduce((sum, s) => {
      // DB 스키마 규격 우선: total_amount > totalAmount
      const amount = s.total_amount !== undefined && s.total_amount !== null
        ? Number(s.total_amount)
        : (s.totalAmount !== undefined && s.totalAmount !== null ? Number(s.totalAmount) : 0)
      return sum + amount
    }, 0)

    const salesGrowthRate = lastMonthSales > 0 ? ((thisMonthSales - lastMonthSales) / lastMonthSales) * 100 : (thisMonthSales > 0 ? 100 : 0)

    return { totalClients, activeClients, thisMonthActivities, thisMonthSales, lastPeriodSales: lastMonthSales, salesGrowthRate }
  }, [clients, activities, sales])

  const getWeeklySalesData = useCallback(() => {
    const now = new Date()
    const weeks = []
    // 최근 4주간의 데이터 (오늘부터 역으로 4주)
    for (let i = 3; i >= 0; i--) {
      const weekEnd = new Date(now)
      weekEnd.setDate(now.getDate() - (i * 7))
      weekEnd.setHours(23, 59, 59, 999) // 주의 마지막 날 끝

      const weekStart = new Date(weekEnd)
      weekStart.setDate(weekEnd.getDate() - 6)
      weekStart.setHours(0, 0, 0, 0) // 주의 첫날 시작

      // 주간 레이블: 주의 시작일/종료일 (예: "1/1-1/7")
      const startMonth = weekStart.getMonth() + 1
      const startDate = weekStart.getDate()
      const endMonth = weekEnd.getMonth() + 1
      const endDate = weekEnd.getDate()
      const weekLabel = startMonth === endMonth
        ? `${startMonth}/${startDate}-${endDate}`
        : `${startMonth}/${startDate}-${endMonth}/${endDate}`

      const weekSales = sales.filter(s => {
        // DB 스키마 규격 우선: sale_date > date
        const saleDate = s.sale_date || s.date
        if (!saleDate) return false

        const sd = new Date(saleDate)
        if (isNaN(sd.getTime())) return false

        // 주간 범위 내인지 확인
        return sd >= weekStart && sd <= weekEnd
      }).reduce((sum, s) => {
        // DB 스키마 규격 우선: total_amount > totalAmount
        const amount = s.total_amount !== undefined && s.total_amount !== null
          ? Number(s.total_amount)
          : (s.totalAmount !== undefined && s.totalAmount !== null ? Number(s.totalAmount) : 0)
        return sum + amount
      }, 0)

      weeks.push({ week: weekLabel, 매출: weekSales / 10000 })
    }
    return weeks
  }, [sales])

  // 레거시 데이터 자동 이관 함수
  const migrateLegacyClientData = useCallback(async (clientsData, contactsByClient) => {
    try {
      const userId = await getValidUserId(user)
      if (!userId) return

      const migrations = []

      for (const client of clientsData || []) {
        const hasContacts = contactsByClient[client.id] && contactsByClient[client.id].length > 0
        const hasLegacyData = client.contact_person && client.contact_person.trim()

        // client_contacts에 담당자가 없고, clients 테이블에 contact_person이 있으면 마이그레이션
        if (!hasContacts && hasLegacyData) {
          migrations.push({
            client_id: client.id,
            name: client.contact_person || '',
            department_role: '',
            phone: client.phone || '',
            email: client.email || '',
            is_primary: true,
            created_by: userId
          })
        }
      }

      // 마이그레이션이 필요한 경우 일괄 처리
      if (migrations.length > 0) {
        // 디버깅: 마이그레이션될 데이터 확인
        console.log('[migrateLegacyClientData] client_contacts 테이블에 저장될 레거시 데이터:', migrations)
        const { error } = await supabase
          .from('client_contacts')
          .insert(migrations)

        if (error) {
          console.error('레거시 데이터 마이그레이션 오류:', error)
        } else {
          console.log(`${migrations.length}개의 레거시 담당자 데이터가 마이그레이션되었습니다.`)
        }
      }
    } catch (error) {
      console.error('레거시 데이터 마이그레이션 중 오류:', error)
    }
  }, [user])

  /**
   * 진행 중인 조회를 담아 둔다.
   *
   * 매출 15,221행을 16쪽으로 나눠 받는 무거운 조회다. 화면·훅·모달이 제각각
   * `refreshData()`를 부르고 effect까지 겹치면 **같은 조회가 네 번 돈다**
   * (실제로 콘솔에 `Fetched 15221 records for sales`가 네 번 찍혔다).
   * 이미 돌고 있으면 그 약속을 그대로 돌려준다 — 부르는 쪽은 아무것도 몰라도 된다.
   */
  const inFlight = useRef(null)

  /**
   * 매출은 두 번에 나눠 받는다.
   *
   * 브라우저에서 재보니 첫 화면 전송량 6,082KB 중 **`sales`가 4,919KB(81%)**였다.
   * 나머지가 전부 2.4초에 끝나는데 매출 때문에 3.7초까지 끌린다(16쪽).
   *
   * 그런데 무게는 **품목·수량·단가 칸**에 있다. 대시보드·KPI·영업 코치가 쓰는 것은
   * 거래처·날짜·금액 셋뿐이다. 실측: 10칸 4,740KB / 3칸 1,484KB — **3.2배** 차이다.
   *
   * 그래서 처음에는 가벼운 쪽만 받아 화면을 세우고, 품목이 필요한 화면
   * (매출 목록·거래명세서·거래처 상세)을 위해 **뒤에서 마저 받는다.**
   * `salesDetailReady`가 false인 동안에는 품목이 아직 없다.
   *
   * `id`·`created_at`은 가벼운 쪽에서 뺐다 — 둘이서만 1,455KB다. 빼면 주문 묶음이
   * `날짜|거래처`가 되어 같은 날 두 번 들어온 주문이 하나로 합쳐지지만, **합계·거래처·
   * 날짜는 그대로**다. 대시보드·KPI·코치가 보는 것은 그 셋뿐이라 숫자가 바뀌지 않는다
   * (브라우저에서 대조해 확인했다). 건수가 중요한 매출 목록 화면은 상세를 받는다.
   */
  const SALES_LIGHT = 'client_id, sale_date, total_amount'
  const SALES_FULL = 'id, sale_date, total_amount, client_id, notes, created_at, item_name, product_id, quantity, unit_price'

  // 4. 데이터 로드 및 동기화 함수
  const fetchData = useCallback(async () => {
    if (inFlight.current) return inFlight.current
    const run = (async () => {
    setLoading(true)
    try {
      const now = new Date()
      const oneYearAgo = new Date(now.setFullYear(now.getFullYear() - 1)).toISOString()
      const MAX_ROWS = 50000
      const MAX_CLIENTS = 10000

      // 1. 개별 페칭 로직 (제한 없이 모든 데이터 로드)
      const fetchRequests = {
        products: fetchAllRecords('products', '*', 'name'),
        clients: fetchAllRecords('clients', '*', 'company'),
        activities: fetchAllRecords('activities', '*', 'activity_date', false, (q) => q.gte('activity_date', oneYearAgo)),
        // **매출은 두 번에 나눠 받는다.** 아래 SALES_LIGHT / SALES_FULL 참고.
        sales: fetchAllRecords('sales', SALES_LIGHT, 'sale_date', false),
        issues: fetchAllRecords('issues', '*', 'created_at', false),
        contacts: fetchAllRecords('client_contacts', '*', 'is_primary', false)
      }

      const results = {}
      for (const [key, promise] of Object.entries(fetchRequests)) {
        const { data, error } = await promise
        if (error) {
          console.error(`[DataContext] Fetch error (${key}):`, {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint
          })
          if (['clients', 'sales'].includes(key)) {
            console.warn(`Critical data fetch failed for ${key}. Check RLS policies.`)
          }
          results[key] = []
        } else {
          if (import.meta.env.DEV) console.log(`[DataContext] Fetched ${data?.length || 0} records for ${key}`)
          results[key] = data || []
        }
      }

      const contactsByClient = results.contacts.reduce((acc, c) => {
        if (!acc[c.client_id]) acc[c.client_id] = []
        acc[c.client_id].push(c)
        return acc
      }, {})

      // 레거시 데이터 자동 이관 실행
      await migrateLegacyClientData(results.clients, contactsByClient)

      setProducts(results.products)

      const clientsData = results.clients.map(client => {
        const contacts = contactsByClient[client.id] || []
        const primary = contacts.find(c => c.is_primary) || contacts[0]
        return {
          ...client,
          lastOrder: client.last_order,
          orderAmount: client.order_amount,
          contact_person: primary?.name || '',
          // 직급까지 있어야 '누구를 찾아야 하는지'가 된다 (김부장 / 유재민 책임)
          contact_role: primary?.department_role || '',
          phone: primary?.phone || '',
          email: primary?.email || ''
        }
      })
      setClients(clientsData)

      // activities에 clientName 매핑 추가
      setActivities(results.activities.map(a => {
        const client = clientsData.find(c => c.id === a.client_id)
        return {
          ...a,
          clientId: a.client_id,
          date: a.activity_date,
          clientName: client?.company || '알 수 없음'
        }
      }))

      // 매출 데이터 그룹화 후 저장
      const rawSales = results.sales.map(s => {
        const qty = Number(s.quantity) || 0
        const price = Number(s.unit_price) || 0
        const client = clientsData.find(c => c.id === s.client_id)
        return {
          ...s,
          clientId: s.client_id,
          clientName: client?.company || '알 수 없음',
          totalAmount: Number(s.total_amount) || (qty * price) || 0,
          date: s.sale_date
        }
      })
      const groupedSales = processGroupedSales(rawSales)
      setSales(groupedSales)

      // 여기서 대시보드는 이미 다 선다. 품목은 필요한 화면이 부를 때 받는다
      // (`ensureSalesDetail`). 자동으로 뒤따라 받으면 총 전송량이 오히려 늘어난다 —
      // 실측 4,919KB → 7,858KB 였다. 대시보드만 보고 나가는 날이 대부분이다.

      // [FIX] 매출 데이터를 기반으로 각 거래처의 총 매출(last_year_revenue) 계산 및 업데이트
      // DB의 last_year_revenue 컬럼을 믿지 않고, 실제 sales 데이터를 집계하여 동적으로 할당함.
      const revenueMap = {}
      rawSales.forEach(s => {
        if (!revenueMap[s.clientId]) revenueMap[s.clientId] = 0
        revenueMap[s.clientId] += s.totalAmount
      })

      const clientsWithRevenue = clientsData.map(client => ({
        ...client,
        last_year_revenue: revenueMap[client.id] || 0, // 실제 총 매출로 덮어쓰기
        totalRevenue: revenueMap[client.id] || 0 // 별칭 추가
      }))

      setClients(clientsWithRevenue) // Revenue가 포함된 클라이언트 데이터로 업데이트

      setIssues(results.issues)

      console.log('[DataContext] Hybrid data synchronization complete.')
    } catch (err) {
      console.error('Critical data fetch error:', err)
    } finally {
      setLoading(false)
    }
    })()
    inFlight.current = run
    try { return await run } finally { inFlight.current = null }
  }, [user, migrateLegacyClientData, processGroupedSales])

  /**
   * 품목·수량·단가까지 받아 온다. **품목을 보여주는 화면만 부른다.**
   *
   * 매출 목록·거래명세서·거래처 상세·브리핑이 해당한다. 대시보드는 부르지 않는다 —
   * 거래처·날짜·금액만 쓰기 때문이다. 그래서 대시보드만 보고 나가는 날은
   * 4,919KB 대신 1,484KB만 받는다.
   *
   * 여러 화면이 동시에 불러도 조회는 한 번이다(`detailInFlight`).
   * 실패해도 화면을 막지 않는다 — 가벼운 쪽으로 이미 돌아가고 있다.
   */
  const detailInFlight = useRef(null)
  const ensureSalesDetail = useCallback(async () => {
    if (salesDetailReady) return
    if (detailInFlight.current) return detailInFlight.current
    const run = (async () => {
      const { data, error } = await fetchAllRecords('sales', SALES_FULL, 'sale_date', false)
      if (error || !data) {
        console.warn('[DataContext] 매출 상세를 받지 못했습니다:', error?.message)
        return
      }
      setSales((prev) => {
        // 거래처 이름은 이미 붙어 있던 것을 그대로 쓴다 (clients state를 또 훑지 않는다)
        const nameById = new Map()
        for (const g of prev) if (g.clientId && g.clientName) nameById.set(g.clientId, g.clientName)
        return processGroupedSales(data.map((s) => {
          const qty = Number(s.quantity) || 0
          const price = Number(s.unit_price) || 0
          return {
            ...s,
            clientId: s.client_id,
            clientName: nameById.get(s.client_id) || '알 수 없음',
            totalAmount: Number(s.total_amount) || (qty * price) || 0,
            date: s.sale_date,
          }
        }))
      })
      setSalesDetailReady(true)
      if (import.meta.env.DEV) console.log(`[DataContext] 매출 상세 ${data.length}행 (품목 포함)`)
    })()
    detailInFlight.current = run
    try { return await run } finally { detailInFlight.current = null }
  }, [salesDetailReady, processGroupedSales])

  // 자동 로드 (모달이 열려있을 때는 실행하지 않음)
  //
  // **한 번만 부른다.** 매출 15,221행을 16쪽으로 나눠 받는 무거운 조회라
  // 두 번 돌면 첫 화면이 그대로 두 배 느려진다. 예전에는 `clients.length`가
  // 아직 0인 사이에 effect가 다시 돌아 두 번 부를 수 있었다 —
  // 조회가 끝나기 전에는 그 조건이 막아 주지 못한다.
  // 누구로 불렀는지 기억한다. 로그인 화면에서 한 번 부르고 가드를 세워 두면
  // 로그인한 뒤 다시 못 부르는 함정이 있다 (DataProvider가 /login까지 감싼다).
  const fetchedFor = useRef(null)
  useEffect(() => {
    if (authLoading) return
    if (openModalCount > 0) return

    // 로그인 전에는 부르지 않는다. RLS가 어차피 빈 결과를 주는데,
    // 매출 16쪽을 로그인 화면에서 헛되이 받아 올 이유가 없다.
    if (!user?.id) {
      fetchedFor.current = null
      if (loading) setLoading(false)
      return
    }

    // [Manual Refresh Policy] 이미 데이터가 로드되어 있다면 재요청 안 함
    if (clients.length > 0 || activities.length > 0 || sales.length > 0) {
      if (loading) setLoading(false)
      return
    }

    if (fetchedFor.current === user.id) return
    fetchedFor.current = user.id
    fetchData()
  }, [user?.id, authLoading, openModalCount, fetchData, clients.length, activities.length, sales.length])


  // 5. CRUD 액션
  const addClient = useCallback(async (c) => {
    const uid = await getValidUserId(user)
    const { data, error } = await supabase.from('clients').insert([{ ...sanitizeData(c, 'client'), created_by: uid }]).select().single()
    if (error) throw error
    if (c.contacts) {
      const r = await replaceClientContacts(data.id, c.contacts)
      if (!r?.success) throw (r?.error || new Error('담당자를 저장하지 못했습니다.'))
    }

    // 담당자 저장 후 최신 담당자 데이터 조회
    const { data: contactsData } = await supabase
      .from('client_contacts')
      .select('*')
      .eq('client_id', data.id)
      .order('is_primary', { ascending: false })

    const contacts = contactsData || []
    const primary = contacts.find(c => c.is_primary) || contacts[0]

    // 최신 담당자 정보가 포함된 client 객체 생성
    const clientWithContacts = {
      ...data,
      lastOrder: data.last_order,
      orderAmount: data.order_amount,
      contact_person: primary?.name || '',
      phone: primary?.phone || '',
      email: primary?.email || ''
    }

    setClients(prev => [...prev, clientWithContacts])
    return clientWithContacts
  }, [user, sanitizeData, replaceClientContacts])

  const updateClient = useCallback(async (id, c) => {
    const { data, error } = await supabase.from('clients').update(sanitizeData(c, 'client')).eq('id', id).select().single()
    if (error) throw error
    if (c.contacts) {
      // **실패를 삼키지 않는다.** 담당자가 저장되지 않았는데 '저장했습니다'가
      // 뜨면, 사라진 것을 아무도 모른 채 넘어간다.
      const r = await replaceClientContacts(id, c.contacts)
      if (!r?.success) throw (r?.error || new Error('담당자를 저장하지 못했습니다.'))
    }

    // 담당자 저장 후 최신 담당자 데이터 조회
    const { data: contactsData } = await supabase
      .from('client_contacts')
      .select('*')
      .eq('client_id', id)
      .order('is_primary', { ascending: false })

    const contacts = contactsData || []
    const primary = contacts.find(c => c.is_primary) || contacts[0]

    // 최신 담당자 정보가 포함된 client 객체 생성
    const clientWithContacts = {
      ...data,
      lastOrder: data.last_order,
      orderAmount: data.order_amount,
      contact_person: primary?.name || '',
      phone: primary?.phone || '',
      email: primary?.email || ''
    }

    setClients(prev => prev.map(item => item.id === id ? clientWithContacts : item))
    return clientWithContacts
  }, [sanitizeData, replaceClientContacts])

  const addSale = useCallback(async (s) => {
    const uid = await getValidUserId(user)
    const BATCH_SIZE = 1000

    // 중복 체크: 거래처명과 판매날짜가 모두 일치하는 데이터가 이미 있는지 확인
    const rowsToInsert = []
    const skippedRows = []

    for (const r of s.rows) {
      const clientId = r.clientId || r.client_id
      const saleDate = r.sale_date || r.saleDate

      // 이 검사는 "그 거래처의 그 날짜에 매출이 하나라도 있으면 통째로 건너뛴다"는 뜻이다.
      // 같은 날 여러 품목을 파는 경우나, 금액이 정정된 건을 반영해야 하는 경우에는
      // 오히려 방해가 되므로, 대사(Reconciliation)를 거친 호출은 이 검사를 건너뛴다.
      if (!s.skipDuplicateCheck) {
        const existingSale = sales.find(sale => {
          const saleClientId = sale.client_id || sale.clientId
          const saleDateStr = sale.sale_date || sale.date
          return saleClientId === clientId && saleDateStr === saleDate
        })

        if (existingSale) {
          skippedRows.push({
            clientId: clientId,
            saleDate: saleDate,
            reason: '이미 존재하는 매출 데이터입니다.'
          })
          continue
        }
      }

      rowsToInsert.push(r)
    }

    // 건너뛴 항목이 있으면 로그 출력
    if (skippedRows.length > 0) {
      console.log(`건너뛴 매출 데이터: ${skippedRows.length}건`)
    }

    // 등록할 데이터가 없으면 조기 종료
    if (rowsToInsert.length === 0) {
      return { skipped: skippedRows.length }
    }

    // 1. 미등록 거래처 자동 등록
    const missingClientNames = [...new Set(s.rows
      .filter(r => !r.clientId && !r.client_id && r.clientName)
      .map(r => r.clientName.trim())
    )]

    const newClientsMap = {}
    if (missingClientNames.length > 0) {
      console.log('[addSale] 신규 거래처 자동 등록 중:', missingClientNames)
      for (const name of missingClientNames) {
        // 이미 로컬에 있는지 다시 확인 (중복 등록 방지)
        const existing = clients.find(c => c.company.trim() === name)
        if (existing) {
          newClientsMap[name] = existing.id
          continue
        }

        const { data, error } = await supabase.from('clients').insert([{ company: name, created_by: uid }]).select().single()
        if (error) {
          console.error(`거래처(${name}) 자동 등록 실패:`, error)
          continue
        }
        newClientsMap[name] = data.id
        setClients(prev => [...prev, { ...data, lastOrder: null, orderAmount: 0, contact_person: '', phone: '', email: '' }])
      }
    }

    // 2. 미등록 품목 자동 등록 (item_name 기준)
    const missingProductNames = [...new Set(s.rows
      .filter(r => {
        const name = r.item_name || r.itemName
        return name && !products.find(p => p.name === name)
      })
      .map(r => (r.item_name || r.itemName).trim())
    )]

    if (missingProductNames.length > 0) {
      console.log('[addSale] 신규 품목 자동 등록 중:', missingProductNames)
      for (const name of missingProductNames) {
        const { data, error } = await supabase.from('products').insert([{ name, created_by: uid }]).select().single()
        if (error) {
          console.error(`품목(${name}) 자동 등록 실패:`, error)
          continue
        }
        setProducts(prev => [...prev, data])
      }
    }

    // DB 컬럼명(snake_case)으로 변환 및 필드 정제
    const rows = rowsToInsert.map(r => {
      const clientId = r.clientId || r.client_id || newClientsMap[r.clientName?.trim()]
      const row = {
        client_id: clientId,
        // 거래처 연결이 실패하더라도 업체명은 남긴다.
        // 과거에 이 값을 저장하지 않아, client_id가 비어버린 매출의 업체명을
        // 사후에 알아낼 방법이 없었다 (execution/repair_orphan_sales.mjs 참고).
        client_name: (r.clientName || '').toString().trim()
          || clients.find(c => c.id === clientId)?.company
          || '',
        sale_date: r.sale_date || r.saleDate || null,
        item_name: r.item_name || r.itemName || r.product_name || '',
        quantity: Number(r.quantity) || 0,
        unit_price: Number(r.unitPrice || r.unit_price) || 0,
        total_amount: Number(r.totalAmount || r.total_amount || (Number(r.quantity) * (Number(r.unitPrice || r.unit_price)))) || 0,
        notes: r.notes || '',
        created_by: uid
      }

      // 빈 문자열 날짜 필드를 null로 변환
      if (!row.sale_date || row.sale_date === '') {
        row.sale_date = null
      }

      // DB에 없는 필드 제거 (임시 필드 및 camelCase 필드) - PGRST204 에러 방지
      delete row.clientId
      delete row.totalAmount
      delete row.unitPrice
      delete row.saleDate
      delete row.itemName
      delete row.rowIndex // 엑셀 파싱 시 추가된 임시 필드 제거
      delete row.clientName // 엑셀 파싱 시 사용된 임시 필드 제거
      delete row.price // DB에 없는 필드 (unit_price 사용)

      return row
    })

    // 디버깅: DB에 전송될 데이터 확인
    console.log('[addSale] sales 테이블에 저장될 데이터:', rows)
    console.log('[addSale] 전송될 데이터의 키 목록:', rows.map(r => Object.keys(r)))

    let insertedTotal = 0
    const insertedData = []

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
      const { data, error } = await supabase.from('sales').insert(batch).select()
      if (error) throw error
      insertedTotal += batch.length
      if (data && data.length > 0) insertedData.push(...data)
    }

    // 새로 추가된 데이터를 기존 데이터와 합쳐서 그룹화
    setSales(prev => {
      // 새로 추가된 데이터 정규화
      const newSales = insertedData.map(d => ({ ...d, totalAmount: d.total_amount, clientId: d.client_id, date: d.sale_date }))

      // 기존 데이터가 그룹화되어 있으므로, items 배열을 평탄화해야 함
      const flattenedPrev = prev.flatMap(group => {
        // 그룹에 items 배열이 있으면 각 항목을 개별 행으로 반환
        if (group.items && Array.isArray(group.items) && group.items.length > 0) {
          return group.items.map(item => ({
            ...item,
            sale_date: group.sale_date || group.date,
            date: group.sale_date || group.date,
            client_id: group.client_id || group.clientId,
            clientId: group.client_id || group.clientId,
            notes: group.notes || item.notes || '',
            created_at: item.created_at || group.created_at
          }))
        }
        // items 배열이 없으면 그룹 자체를 개별 행으로 반환 (fallback)
        return [{
          id: group.id,
          item_name: group.displayItemName || '',
          quantity: 0,
          unit_price: 0,
          total_amount: group.total_amount || group.totalAmount || 0,
          sale_date: group.sale_date || group.date,
          date: group.sale_date || group.date,
          client_id: group.client_id || group.clientId,
          clientId: group.client_id || group.clientId,
          notes: group.notes || '',
          created_at: group.created_at
        }]
      })

      // 기존 데이터(평탄화)와 새 데이터 합치기
      const allSales = [...flattenedPrev, ...newSales]
      // 전체 데이터를 다시 그룹화 (새로 추가된 데이터가 기존 그룹과 합쳐질 수 있음)
      return processGroupedSales(allSales)
    })

    return { inserted: insertedTotal, skipped: skippedRows.length }
  }, [user, processGroupedSales, sales, clients, products])

  // 매출 수정 (그룹 내 모든 항목 업데이트)
  const updateSale = useCallback(async (groupId, saleData) => {
    const uid = await getValidUserId(user)

    try {
      // 그룹 ID로 기존 그룹 찾기 (현재 상태에서)
      const currentGroup = sales.find(s => s.id === groupId)
      if (!currentGroup || !currentGroup.items || currentGroup.items.length === 0) {
        throw new Error('수정할 매출 데이터를 찾을 수 없습니다.')
      }

      // 기존 그룹 내 모든 항목의 ID 수집
      const existingItemIds = currentGroup.items
        .filter(item => item.id)
        .map(item => item.id)

      // 기존 항목 삭제
      if (existingItemIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('sales')
          .delete()
          .in('id', existingItemIds)

        if (deleteError) throw deleteError
      }

      // 새로운 항목들 추가
      const rows = saleData.items.map(item => ({
        client_id: saleData.clientId || saleData.client_id,
        sale_date: saleData.sale_date || saleData.saleDate,
        item_name: item.item_name || item.itemName || '',
        quantity: Number(item.quantity) || 0,
        unit_price: Number(item.unit_price || item.unitPrice) || 0,
        total_amount: Number(item.total_amount || item.totalAmount || (item.quantity * (item.unit_price || item.unitPrice))) || 0,
        notes: saleData.notes || '',
        created_by: uid
      }))

      const { data, error } = await supabase.from('sales').insert(rows).select()
      if (error) throw error

      // 상태 업데이트: 기존 그룹 제거하고 새 그룹 추가
      setSales(prev => {
        // 기존 그룹 제거
        const filtered = prev.filter(s => s.id !== groupId)

        // 새 데이터 정규화 및 그룹화
        const newSales = data.map(d => ({ ...d, totalAmount: d.total_amount, clientId: d.client_id, date: d.sale_date }))
        const allSales = filtered.flatMap(group => {
          if (group.items && Array.isArray(group.items) && group.items.length > 0) {
            return group.items.map(item => ({
              ...item,
              sale_date: group.sale_date || group.date,
              date: group.sale_date || group.date,
              client_id: group.client_id || group.clientId,
              clientId: group.client_id || group.clientId,
              notes: group.notes || item.notes || '',
              created_at: item.created_at || group.created_at
            }))
          }
          return [{
            id: group.id,
            item_name: group.displayItemName || '',
            quantity: 0,
            unit_price: 0,
            total_amount: group.total_amount || group.totalAmount || 0,
            sale_date: group.sale_date || group.date,
            date: group.sale_date || group.date,
            client_id: group.client_id || group.clientId,
            clientId: group.client_id || group.clientId,
            notes: group.notes || '',
            created_at: group.created_at
          }]
        })

        return processGroupedSales([...allSales, ...newSales])
      })
    } catch (error) {
      console.error('매출 수정 중 오류:', error)
      throw error
    }
  }, [user, sales, processGroupedSales])

  // 매출 삭제 (그룹 내 모든 항목 삭제)
  // 제품 삭제 함수
  const deleteProduct = useCallback(async (productId) => {
    try {
      // 제품 정보 가져오기
      const product = products.find(p => p.id === productId)
      if (!product) {
        throw new Error('삭제할 제품을 찾을 수 없습니다.')
      }

      // 매출 기록에 해당 제품명이 사용되고 있는지 확인 (item_name으로 확인)
      const { data: salesWithProduct, error: checkError } = await supabase
        .from('sales')
        .select('id, item_name')
        .eq('item_name', product.name)
        .limit(1)

      if (checkError) {
        console.error('매출 기록 확인 중 오류:', checkError)
        // 확인 실패해도 삭제 시도 (DB 제약조건에서 처리)
      }

      if (salesWithProduct && salesWithProduct.length > 0) {
        throw new Error('해당 제품은 매출 기록이 있어 삭제할 수 없습니다. 대신 숨기거나 이름을 변경하세요.')
      }

      // 제품 삭제
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId)

      if (error) {
        // 외래 키 제약조건 에러 처리
        if (error.code === '23503' || error.message?.includes('foreign key') || error.message?.includes('violates foreign key')) {
          throw new Error('해당 제품은 매출 기록이 있어 삭제할 수 없습니다. 대신 숨기거나 이름을 변경하세요.')
        }
        throw error
      }

      // 상태 업데이트: 제품 제거
      setProducts(prev => prev.filter(p => p.id !== productId))
    } catch (error) {
      console.error('제품 삭제 중 오류:', error)
      throw error
    }
  }, [products])

  const deleteSale = useCallback(async (groupId) => {
    try {
      // 그룹 ID로 기존 그룹 찾기
      const currentGroup = sales.find(s => s.id === groupId)
      if (!currentGroup || !currentGroup.items || currentGroup.items.length === 0) {
        throw new Error('삭제할 매출 데이터를 찾을 수 없습니다.')
      }

      // 그룹 내 모든 항목의 ID 수집
      const itemIds = currentGroup.items
        .filter(item => item.id)
        .map(item => item.id)

      if (itemIds.length === 0) {
        throw new Error('삭제할 매출 항목이 없습니다.')
      }

      // 모든 항목 삭제
      const { error } = await supabase
        .from('sales')
        .delete()
        .in('id', itemIds)

      if (error) throw error

      // 상태 업데이트: 그룹 제거
      setSales(prev => prev.filter(s => s.id !== groupId))
    } catch (error) {
      console.error('매출 삭제 중 오류:', error)
      throw error
    }
  }, [sales])

  // 담당자 목록 가져오기
  const fetchClientContacts = useCallback(async (clientId) => {
    try {
      const { data, error } = await supabase
        .from('client_contacts')
        .select('*')
        .eq('client_id', clientId)
        .order('is_primary', { ascending: false })

      if (error) throw error
      return (data || []).map(contact => ({
        ...contact,
        department_role: contact.department_role || ''
      }))
    } catch (error) {
      console.error('담당자 목록 불러오기 오류:', error)
      throw error
    }
  }, [])

  // 거래처 삭제 (외래 키 제약 조건 처리)
  /**
   * 거래처 지우기 — **휴지통으로 보낸다.**
   *
   * 예전에는 담당자·활동·매출을 진짜로 지우고 거래처를 지웠다. 거래처 하나를
   * 잘못 누르면 그 회사의 매출 기록이 통째로 사라지고 되돌릴 방법이 없었다.
   * 지금은 `deleted_at`만 채운다. 화면에서는 사라지지만 행은 남아 있어
   * 설정 > 휴지통에서 되살릴 수 있다.
   *
   * 딸린 자료(활동·매출·담당자)도 함께 표시해 둔다 — 거래처만 되살리고
   * 매출은 안 돌아오면 되살린 의미가 없다.
   */
  const deleteClient = useCallback(async (clientId) => {
    const stamp = { deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null }
    try {
      for (const [table, col] of [
        ['client_contacts', 'client_id'],
        ['activities', 'client_id'],
        ['sales', 'client_id'],
      ]) {
        const { error } = await supabase.from(table).update(stamp).eq(col, clientId).is('deleted_at', null)
        if (error) throw new Error(`${table}: ${error.message}`)
      }

      const { error: clientError } = await supabase
        .from('clients').update(stamp).eq('id', clientId)
      if (clientError) throw clientError

      // 화면에서는 즉시 사라진다
      setClients(prev => prev.filter(c => c.id !== clientId))
      setActivities(prev => prev.filter(a => (a.client_id || a.clientId) !== clientId))
      setSales(prev => prev.filter(s => (s.client_id || s.clientId) !== clientId))

      return { success: true }
    } catch (error) {
      console.error('거래처 삭제 중 오류:', error)
      throw error
    }
  }, [user?.id])

  /** 휴지통에서 되살리기 — 거래처와 딸린 자료를 함께 되돌린다 */
  const restoreClient = useCallback(async (clientId) => {
    const undo = { deleted_at: null, deleted_by: null }
    for (const [table, col] of [
      ['clients', 'id'],
      ['client_contacts', 'client_id'],
      ['activities', 'client_id'],
      ['sales', 'client_id'],
    ]) {
      const { error } = await supabase.from(table).update(undo).eq(col, clientId)
      if (error) throw new Error(`${table}: ${error.message}`)
    }
    return { success: true }
  }, [])

  // 거래처 일괄 등록 함수 (중복 방지 로직 포함)
  const addClientsBulk = useCallback(async (clientsData) => {
    const uid = await getValidUserId(user)
    const results = []
    const errors = []
    const skipped = []

    for (let i = 0; i < clientsData.length; i++) {
      const clientData = clientsData[i]
      try {
        // 중복 체크: 회사명만으로 체크 (핵심 식별자)
        const existingClient = clients.find(c => c.company === clientData.company)

        if (existingClient) {
          skipped.push({
            rowIndex: clientData.rowIndex || i + 1,
            company: clientData.company || '알 수 없음',
            reason: '이미 존재하는 거래처입니다.'
          })
          continue
        }

        // clients 테이블에 저장
        const sanitized = sanitizeData(clientData, 'client')
        const { data, error } = await supabase
          .from('clients')
          .insert([{ ...sanitized, created_by: uid }])
          .select()
          .single()

        if (error) throw error

        // 담당자 저장 (담당자1은 자동으로 is_primary: true로 설정됨)
        if (clientData.contacts && clientData.contacts.length > 0) {
          await replaceClientContacts(data.id, clientData.contacts)
        }

        // 담당자 저장 후 최신 담당자 데이터 조회
        const { data: contactsData } = await supabase
          .from('client_contacts')
          .select('*')
          .eq('client_id', data.id)
          .order('is_primary', { ascending: false })

        const contacts = contactsData || []
        const primary = contacts.find(c => c.is_primary) || contacts[0]

        // 최신 담당자 정보가 포함된 client 객체 생성
        const clientWithContacts = {
          ...data,
          lastOrder: data.last_order,
          orderAmount: data.order_amount,
          contact_person: primary?.name || '',
          phone: primary?.phone || '',
          email: primary?.email || ''
        }

        results.push(clientWithContacts)
      } catch (error) {
        console.error(`거래처 등록 오류 (${clientData.rowIndex || i + 1}번째 행):`, error)
        errors.push({
          rowIndex: clientData.rowIndex || i + 1,
          company: clientData.company || '알 수 없음',
          error: error.message || '알 수 없는 오류'
        })
      }
    }

    // 성공한 거래처들을 상태에 추가
    if (results.length > 0) {
      setClients(prev => [...prev, ...results])
    }

    // 건너뛴 항목이 있으면 메시지에 포함
    if (skipped.length > 0) {
      const skippedMessage = skipped.map(s => `${s.rowIndex}번째 행 (${s.company}): ${s.reason}`).join('\n')
      console.log(`건너뛴 거래처:\n${skippedMessage}`)
    }

    // 오류가 있으면 예외 발생
    if (errors.length > 0) {
      const errorMessage = errors.map(e => `${e.rowIndex}번째 행 (${e.company}): ${e.error}`).join('\n')
      throw new Error(`일부 거래처 등록에 실패했습니다:\n${errorMessage}`)
    }

    return results
  }, [user, sanitizeData, replaceClientContacts, clients])

  /**
   * 미등록 거래처 일괄 등록 (회사명만으로 생성)
   *
   * 매출 엑셀 업로드에 신규 업체가 섞여 있을 때 사용한다. 거래처를 먼저 만들어 두지 않으면
   * 매출이 client_id 없이 저장되어 목록에 '알수없음'으로 남는다.
   * 담당자/연락처는 비워두고 생성하므로, 이후 거래처 화면에서 보완하면 된다.
   *
   * @param {string[]} companyNames
   * @returns {Promise<Array>} 생성된 거래처 목록
   */
  const registerMissingClients = useCallback(async (companyNames) => {
    const names = [...new Set(
      (companyNames || []).map(n => (n || '').toString().trim()).filter(Boolean)
    )]
    if (names.length === 0) return []

    const uid = await getValidUserId(user)

    const { data, error } = await supabase
      .from('clients')
      .insert(names.map(company => ({ company, created_by: uid })))
      .select()

    if (error) throw error

    // 목록 UI가 기대하는 형태로 정규화 (addClient와 동일한 형태)
    const created = (data || []).map(d => ({
      ...d,
      lastOrder: d.last_order,
      orderAmount: d.order_amount,
      contact_person: '',
      phone: '',
      email: ''
    }))

    if (created.length > 0) {
      console.log(`[registerMissingClients] 신규 거래처 ${created.length}개 등록:`, created.map(c => c.company))
      setClients(prev => [...prev, ...created])
    }

    return created
  }, [user])

  /**
   * 대사 결과를 실제 DB에 반영한다 (삭제 -> 수정 -> 등록 순).
   *
   * 반드시 사용자가 미리보기를 보고 승인한 뒤에만 호출할 것.
   * 삭제를 먼저 하는 이유: 잘못된 행이 남은 채 새 행이 들어가면 잠깐이라도 매출이 이중 계상된다.
   *
   * @param {{toInsert: Array, toUpdate: Array, toDelete: Array}} plan
   * @param {(progress: {stage: string, current: number, total: number}) => void} [onProgress]
   */
  const applySalesReconciliation = useCallback(async (plan, onProgress = () => { }) => {
    const { toInsert = [], toUpdate = [], toDelete = [] } = plan || {}
    const result = { deleted: 0, updated: 0, inserted: 0, errors: [] }
    const BATCH = 200

    // 1. 삭제
    if (toDelete.length > 0) {
      const ids = toDelete.map(r => r.id).filter(Boolean)
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH)
        onProgress({ stage: '기존 매출 삭제 중', current: i, total: ids.length })
        const { error } = await supabase.from('sales').delete().in('id', batch)
        if (error) result.errors.push(`삭제 실패: ${error.message}`)
        else result.deleted += batch.length
      }
    }

    // 2. 수정 (행 단위라 개별 update)
    for (let i = 0; i < toUpdate.length; i++) {
      const u = toUpdate[i]
      if (i % 20 === 0) onProgress({ stage: '금액 수정 중', current: i, total: toUpdate.length })

      const e = u.excel
      const quantity = Number(e.quantity) || 0
      const unitPrice = Number(e.unitPrice ?? e.unit_price) || 0
      const { error } = await supabase.from('sales').update({
        quantity,
        unit_price: unitPrice,
        total_amount: Number(e.totalAmount ?? e.total_amount) || quantity * unitPrice,
        item_name: e.item_name || '',
        notes: e.notes || '',
        client_id: e.clientId || e.client_id,
        client_name: (e.clientName || '').trim()
      }).eq('id', u.id)

      if (error) result.errors.push(`수정 실패(${u.id}): ${error.message}`)
      else result.updated++
    }

    // 3. 신규 등록 (거래처/품목 자동 등록은 addSale이 처리)
    if (toInsert.length > 0) {
      onProgress({ stage: '신규 매출 등록 중', current: 0, total: toInsert.length })
      try {
        const res = await addSale({ rows: toInsert, skipDuplicateCheck: true })
        result.inserted = res?.inserted || 0
      } catch (e) {
        result.errors.push(`등록 실패: ${e.message}`)
      }
    }

    // 로컬 상태를 DB와 다시 맞춘다 (삭제/수정은 상태에 반영되지 않으므로 전체 재조회)
    onProgress({ stage: '데이터 새로고침 중', current: 0, total: 0 })
    await fetchData()

    return result
  }, [addSale, fetchData])

  // 활동 내역 추가
  const addActivity = useCallback(async (activityData) => {
    const uid = await getValidUserId(user)

    // DB 컬럼명(snake_case)으로 변환 (user 필드는 DB에 없으므로 제외)
    const data = {
      client_id: activityData.clientId || activityData.client_id,
      activity_date: activityData.activity_date || activityData.date || null,
      type: activityData.type || '',
      description: activityData.description || '',
      status: activityData.status || '완료',
      next_action_date: activityData.next_action_date || null,
      next_action_detail: activityData.next_action_detail || '',
      // 누가 다녀왔는지. 담당 자동 지정과 KPI 집계의 근거가 된다.
      user_name: activityData.user_name || activityData.user || null,
      created_by: uid
    }

    // 빈 문자열 날짜 필드를 null로 변환
    if (!data.activity_date || data.activity_date === '') {
      data.activity_date = null
    }
    if (!data.next_action_date || data.next_action_date === '') {
      data.next_action_date = null
    }

    // DB에 없는 필드 제거
    delete data.clientId
    delete data.date
    delete data.user // user 필드는 DB에 없으므로 제거

    const { data: insertedData, error } = await supabase.from('activities').insert([data]).select().single()
    if (error) throw error

    // 참석자 정보(user)는 UI용으로만 사용하고 DB에는 저장하지 않음
    // clientName 매핑 추가 (clients 조인)
    const client = clients.find(c => c.id === insertedData.client_id)

    // 미팅·통화한 곳은 내 담당이다. 담당이 비어 있으면 채운다.
    //
    // 신규·복원 영업 대상은 거래처에 담당자가 지정되지 않은 경우가 많은데,
    // 그러면 영업 코치에서 빠지고 KPI 정기적방문횟수에도 안 잡힌다
    // (둘 다 담당 거래처만 센다). 정작 공들이는 곳이 화면에서 사라지는 셈이다.
    // 이미 담당이 있으면 건드리지 않는다 — 남의 거래처를 뺏으면 안 된다.
    const repName = activityData.user_name || activityData.user || null
    if (client && !client.sales_rep && repName) {
      try {
        await supabase.from('clients').update({ sales_rep: repName }).eq('id', client.id).is('sales_rep', null)
        setClients(prev => prev.map(c => (c.id === client.id ? { ...c, sales_rep: repName } : c)))
      } catch (e) {
        console.warn('[addActivity] 담당 자동 지정 실패:', e.message)
      }
    }
    const newActivity = {
      ...insertedData,
      clientId: insertedData.client_id,
      date: insertedData.activity_date,
      clientName: client?.company || '알 수 없음',
      user: activityData.user || '' // UI 표시용으로만 유지
    }
    setActivities(prev => [newActivity, ...prev])
    return newActivity
  }, [user, clients])

  // 활동 내역 수정
  /*
   * **일부만 넘겨도 안전해야 한다.**
   *
   * 예전에는 넘겨받은 것으로 행을 통째로 다시 지었다. 그래서 예컨대
   * `{ next_action_date: null }` 하나만 넘기면 거래처·날짜·유형·내용이
   * 전부 빈 값으로 덮여 **활동 기록이 통째로 지워졌다.** 지금까지는 수정
   * 모달만 이 함수를 불렀고 그쪽은 폼 전체를 넘겨서 드러나지 않았을 뿐이다.
   *
   * 이제 이미 들고 있는 값 위에 덮는다. 전부 넘기던 호출부는 결과가 같고,
   * 일부만 넘기는 호출부(달력의 '하기로 한 것' 처리)는 나머지가 보존된다.
   */
  const updateActivity = useCallback(async (id, activityData) => {
    const prevRow = activities.find((a) => a.id === id) || {}
    const pick = (key, ...alts) => {
      for (const k of [key, ...alts]) {
        if (Object.prototype.hasOwnProperty.call(activityData, k)) return activityData[k]
      }
      for (const k of [key, ...alts]) {
        if (prevRow[k] !== undefined && prevRow[k] !== null) return prevRow[k]
      }
      return undefined
    }
    // DB 컬럼명(snake_case)으로 변환 (user 필드는 DB에 없으므로 제외)
    const data = {
      client_id: pick('client_id', 'clientId') ?? null,
      activity_date: pick('activity_date', 'date') ?? null,
      type: pick('type') ?? '',
      description: pick('description') ?? '',
      status: pick('status') ?? '완료',
      next_action_date: pick('next_action_date') ?? null,
      next_action_detail: pick('next_action_detail') ?? ''
    }

    // 빈 문자열 날짜 필드를 null로 변환
    if (!data.activity_date || data.activity_date === '') {
      data.activity_date = null
    }
    if (!data.next_action_date || data.next_action_date === '') {
      data.next_action_date = null
    }

    // DB에 없는 필드 제거
    delete data.clientId
    delete data.date

    const { data: updatedData, error } = await supabase.from('activities').update(data).eq('id', id).select().single()
    if (error) throw error

    // 참석자 정보(user)는 UI용으로만 사용하고 DB에는 저장하지 않음
    // clientName 매핑 추가 (clients 조인)
    const client = clients.find(c => c.id === updatedData.client_id)
    const updatedActivity = {
      ...updatedData,
      clientId: updatedData.client_id,
      date: updatedData.activity_date,
      clientName: client?.company || '알 수 없음',
      user: activityData.user || '' // UI 표시용으로만 유지
    }
    setActivities(prev => prev.map(item => item.id === id ? updatedActivity : item))
    return updatedActivity
  }, [clients, activities])

  // 활동 내역 삭제
  const deleteActivity = useCallback(async (id) => {
    const { error } = await supabase.from('activities').delete().eq('id', id)
    if (error) throw error

    setActivities(prev => prev.filter(item => item.id !== id))
  }, [])

  // 이슈 추가
  const addIssue = useCallback(async (issueData) => {
    const uid = await getValidUserId(user)

    // DB 컬럼명(snake_case)으로 변환
    const data = {
      title: issueData.title || '',
      content: issueData.content || issueData.description || '',
      status: issueData.status || '등록',
      target_date: issueData.target_date || issueData.date || null,
      created_by: uid
    }

    // 빈 문자열 날짜 필드를 null로 변환
    if (!data.target_date || data.target_date === '') {
      data.target_date = null
    }

    // DB에 없는 필드 제거
    delete data.date
    delete data.description

    const { data: insertedData, error } = await supabase.from('issues').insert([data]).select().single()
    if (error) throw error

    setIssues(prev => [insertedData, ...prev])
    return insertedData
  }, [user])

  // 이슈 수정
  const updateIssue = useCallback(async (id, issueData) => {
    // DB 컬럼명(snake_case)으로 변환
    const data = {
      title: issueData.title || '',
      content: issueData.content || issueData.description || '',
      status: issueData.status || '등록',
      target_date: issueData.target_date || issueData.date || null,
    }

    // 빈 문자열 날짜 필드를 null로 변환
    if (!data.target_date || data.target_date === '') {
      data.target_date = null
    }

    // DB에 없는 필드 제거
    delete data.date
    delete data.description

    const { data: updatedData, error } = await supabase.from('issues').update(data).eq('id', id).select().single()
    if (error) throw error

    setIssues(prev => prev.map(item => item.id === id ? updatedData : item))
    return updatedData
  }, [])

  // 이슈 삭제
  const deleteIssue = useCallback(async (id) => {
    const { error } = await supabase.from('issues').delete().eq('id', id)
    if (error) throw error

    setIssues(prev => prev.filter(item => item.id !== id))
  }, [])

  // 모달 열림/닫힘 추적 함수
  const registerModal = useCallback(() => {
    setOpenModalCount(prev => prev + 1)
    return () => {
      setOpenModalCount(prev => Math.max(0, prev - 1))
    }
  }, [])

  // 제품 일괄 등록 함수 (중복 방지 로직 포함)
  const addProductsBulk = useCallback(async (productsData) => {
    const uid = await getValidUserId(user)
    const results = []
    const errors = []
    const skipped = []

    for (let i = 0; i < productsData.length; i++) {
      const productData = productsData[i]
      try {
        // 중복 체크: 제품명이 동일한 경우 건너뛰기
        const existingProduct = products.find(p => p.name === productData.name)

        if (existingProduct) {
          skipped.push({
            rowIndex: productData.rowIndex || i + 1,
            name: productData.name || '알 수 없음',
            reason: '이미 존재하는 제품입니다.'
          })
          continue
        }

        // DB 전송 전 rowIndex 등 임시 필드 제거 및 DB 스키마 확인
        // products 테이블 스키마: name, type, standard (단가 필드 제거됨)
        const productToInsert = {
          name: productData.name,
          type: productData.type || '', // 비어있어도 등록 가능
          standard: productData.standard || '', // 비어있어도 등록 가능
          created_by: uid
        }
        // DB에 존재하지 않는 임시 필드 제거 (PGRST204 에러 방지)
        delete productToInsert.rowIndex
        delete productToInsert.clientName
        delete productToInsert.unitPrice
        delete productToInsert.unit_price
        delete productToInsert.price // 단가 필드 제거

        const { data, error } = await supabase
          .from('products')
          .insert([productToInsert])
          .select()
          .single()

        if (error) throw error
        results.push(data)
      } catch (error) {
        console.error(`제품 등록 오류 (${productData.rowIndex || i + 1}번째 행):`, error)
        errors.push({
          rowIndex: productData.rowIndex || i + 1,
          name: productData.name || '알 수 없음',
          error: error.message || '알 수 없는 오류'
        })
      }
    }

    // 성공한 제품들을 상태에 추가
    if (results.length > 0) {
      setProducts(prev => [...prev, ...results])
    }

    // 건너뛴 항목이 있으면 메시지에 포함
    if (skipped.length > 0) {
      const skippedMessage = skipped.map(s => `${s.rowIndex}번째 행 (${s.name}): ${s.reason}`).join('\n')
      console.log(`건너뛴 제품:\n${skippedMessage}`)
    }

    // 오류가 있으면 예외 발생
    if (errors.length > 0) {
      const errorMessage = errors.map(e => `${e.rowIndex}번째 행 (${e.name}): ${e.error}`).join('\n')
      throw new Error(`일부 제품 등록에 실패했습니다:\n${errorMessage}`)
    }

    return results
  }, [user, products])

  // 기존 매출 데이터에서 누락된 품목 일괄 등록 및 기존 매출 연동
  const registerMissingProductsFromSales = useCallback(async () => {
    const uid = await getValidUserId(user)
    try {
      console.log('[registerMissingProductsFromSales] 전체 데이터 동기화 시작...')

      // 1. 모든 매출 데이터 가져오기 (이름 매핑을 위해 전체 스캔 필요)
      const { data: allSales, error: salesError } = await fetchAllRecords('sales', '*')
      if (salesError) throw salesError
      if (!allSales || allSales.length === 0) return { count: 0 }

      // 디버깅: 실제 로드된 매출 데이터의 컬럼 확인
      if (allSales.length > 0) {
        // console.log('[registerMissingProductsFromSales] Loaded sales keys:', JSON.stringify(Object.keys(allSales[0])))
      }

      // [CRITICAL FIX] 유효한 created_by 찾기 strategy
      // 1. 현재 로그인 유저
      // 2. allSales에 기록된 created_by 중 하나 (무결성 검증된 ID)
      let effectiveUid = await getValidUserId(user)
      const DUMMY_UID = '00000000-0000-0000-0000-000000000000'

      if (effectiveUid === DUMMY_UID) {
        // 더미면 sales 데이터에서 유효한 ID 탐색
        const found = allSales.find(s => s.created_by && s.created_by !== DUMMY_UID)
        if (found) {
          effectiveUid = found.created_by
          console.log('[registerMissingProductsFromSales] 로그인 유저 없음. 기존 매출 데이터에서 유저 ID 추출 사용:', effectiveUid)
        }
      }

      const nameSet = new Set()
      allSales.forEach(s => {
        const name = (s.item_name || s.itemName || s.product_name || '').trim()
        if (name) nameSet.add(name)
      })

      // 3. 누락된 품목 등록 (DB 제약조건 없이도 안전하게 처리하기 위해 조회 후 등록 방식 사용)
      // 먼저 최신 Products 목록을 다시 가져옴 (동시성 이슈 최소화)
      const { data: currentProducts, error: prodError } = await fetchAllRecords('products', 'id, name')
      if (prodError) throw prodError

      const currentProductMap = new Map(currentProducts.map(p => [p.name.trim(), p.id]))
      const currentNames = new Set(currentProducts.map(p => p.name.trim()))

      // 등록해야 할 이름 필터링 (이미 DB에 있는 건 제외)
      const reallyNewNames = Array.from(nameSet).filter(name => !currentNames.has(name))

      let newlyRegisteredCount = 0
      if (reallyNewNames.length > 0) {
        console.log(`[registerMissingProductsFromSales] ${reallyNewNames.length}개 신규 품목 등록 시도...`)
        const BATCH_SIZE = 100
        for (let i = 0; i < reallyNewNames.length; i += BATCH_SIZE) {
          const batch = reallyNewNames.slice(i, i + BATCH_SIZE).map(name => ({ name, created_by: effectiveUid }))
          // Upsert 대신 순수 Insert 사용 (중복 검사를 마쳤으므로 안전)
          const { data, error } = await supabase.from('products').insert(batch).select()

          if (error) {
            console.error(`[registerMissingProductsFromSales] 품목 등록 중 에러 (배치 ${i}):`, error)
            // 이름 중복 등 에러 발생 시 개별 등록 시도 혹은 무시
          } else if (data) {
            data.forEach(p => {
              currentProductMap.set(p.name.trim(), p.id)
            })
            newlyRegisteredCount += data.length
          }
        }
        // 로컬 상태 업데이트
        setProducts(prev => {
          // 중복 방지를 위해 기존 것과 합침
          const newItems = reallyNewNames.map(name => ({
            id: currentProductMap.get(name), // 방금 등록된 ID
            name,
            created_by: uid
          })).filter(p => p.id) // ID가 있는 것만 (등록 성공한 것만)
          return [...prev, ...newItems]
        })
      }

      // 업데이트된 맵 사용
      const productMap = currentProductMap


      // 4. 기존 매출 데이터와 품목 ID 연결 (product_id가 없는 경우)
      // Upsert를 사용하여 대량 업데이트 처리 (네트워트 요청 최소화)
      const salesToUpdate = allSales.filter(s => {
        if (s.product_id) return false
        const name = (s.item_name || s.itemName || s.product_name || '').trim()
        return name && productMap.has(name)
      }).map(s => {
        const name = (s.item_name || s.itemName || s.product_name || '').trim()
        const productId = productMap.get(name)
        // Upsert를 위해 필요한 객체 구성 (기존 데이터 + product_id)
        return {
          ...s,
          product_id: productId
        }
      })

      if (salesToUpdate.length > 0) {
        console.log(`[registerMissingProductsFromSales] ${salesToUpdate.length}개 매출 항목 ID 연결 중 (Upsert)...`)
        const UPDATE_BATCH_SIZE = 1000 // Upsert는 처리량이 더 높음

        let successCount = 0
        for (let i = 0; i < salesToUpdate.length; i += UPDATE_BATCH_SIZE) {
          const batch = salesToUpdate.slice(i, i + UPDATE_BATCH_SIZE)
          // Upsert 실행 (기존 ID가 있으면 업데이트됨)
          const { error } = await supabase.from('sales').upsert(batch)

          if (error) {
            console.error(`[registerMissingProductsFromSales] 배치 업데이트 실패 (인덱스 ${i}):`, error)
            // 실패 시 계속 진행할지 여부는 정책에 따라 다르지만, 여기서는 로깅 후 계속 진행
          } else {
            successCount += batch.length
            console.log(`[registerMissingProductsFromSales] 배치 업데이트 성공 (${Math.min(i + UPDATE_BATCH_SIZE, salesToUpdate.length)}/${salesToUpdate.length})`)
          }
        }

        if (successCount < salesToUpdate.length) {
          console.warn(`[registerMissingProductsFromSales] 일부 항목 업데이트 실패: ${salesToUpdate.length - successCount}건`)
        }
      }

      fetchData()
      return { count: newlyRegisteredCount, updatedSales: salesToUpdate.length }
    } catch (error) {
      console.error('품목 일괄 동기화 중 오류:', error)
      throw error
    }
  }, [user, products, fetchData])


  const value = {
    products, clients, activities, sales, issues, loading, isOnline, pendingSyncCount,
    addClient, updateClient, replaceClientContacts, addSale, updateSale, deleteSale, getStats, getWeeklySalesData,
    fetchClientContacts, deleteClient, restoreClient, addClientsBulk, addProductsBulk,
    registerMissingClients, // 매출 업로드 시 신규 거래처 자동 등록
    applySalesReconciliation, // 대사 결과 반영 (삭제/수정/등록)
    addActivity, updateActivity, deleteActivity, addIssue, updateIssue, deleteIssue,
    registerModal, // 모달 상태 등록 함수
    processGroupedSales, // 그룹화 로직 노출
    registerMissingProductsFromSales, // 미등록 품목 일괄 등록 함수
    addProduct: async (p) => {
      const uid = await getValidUserId(user);
      const { data } = await supabase.from('products').insert([{ ...p, created_by: uid }]).select().single();
      setProducts(prev => [...prev, data])
    },
    deleteProduct, // 제품 삭제 함수 추가
    refreshData: fetchData, // 수동 데이터 갱신을 위한 함수 노출
    dashboardStats, // [Performance] 미리 계산된 대시보드 통계
    // 품목·수량·단가까지 왔는가 / 받아 오는 함수.
    // 품목을 보여주는 화면은 effect에서 ensureSalesDetail()을 부르고,
    // salesDetailReady가 false인 동안 '불러오는 중'을 보여야 한다.
    salesDetailReady, ensureSalesDetail
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
