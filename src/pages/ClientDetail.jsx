import React, { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useData } from '../contexts/DataContext'
import {
  ArrowLeft,
  Phone,
  Mail,
  Building2,
  Calendar,
  DollarSign,
  Activity,
  MapPin,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react'
import { formatCurrency } from '../utils/formatters'
import { coerceClientStatus } from '../utils/clientStatus'
import { showError } from '../utils/alert'

const ClientDetail = () => {
  // 모든 Hook 선언을 최상단에 배치
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { clients, sales, activities, loading } = useData()
  const [fallbackClient, setFallbackClient] = useState(null)
  const [isFetchingClient, setIsFetchingClient] = useState(false)

  const normalizeCompany = (name) => {
    if (!name) return ''
    return name
      .toString()
      .replace(/\u200B|\uFEFF/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/[（]/g, '(')
      .replace(/[）]/g, ')')
      .replace(/㈜/g, '(주)')
      .replace(/주식회사|유한회사|합자회사|합명회사|유한|㈜|\(주\)|\(유\)/g, '')
      .replace(/[\s\(\)\[\]\{\}\-_.·]/g, '')
      .toLowerCase()
      .trim()
  }

  const companyParam = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('company') || ''
  }, [location.search])

  // 현재 선택된 고객 정보
  const currentClient = useMemo(() => {
    if (!clients || !Array.isArray(clients)) return null
    const directMatch = clients.find((c) => String(c.id) === String(id))
    if (directMatch) return directMatch
    if (!companyParam) return null
    const target = normalizeCompany(companyParam)
    return clients.find((c) => normalizeCompany(c.company) === target) || null
  }, [clients, id, companyParam])

  useEffect(() => {
    const fetchFallbackClient = async () => {
      if (loading || currentClient || !id) return
      setIsFetchingClient(true)
      try {
        let clientData = null

        const { data: directData, error: directError } = await supabase
          .from('clients')
          .select('*')
          .eq('id', id)
          .maybeSingle()

        if (directError) throw directError
        clientData = directData

        if (!clientData && companyParam) {
          const { data: companyData, error: companyError } = await supabase
            .from('clients')
            .select('*')
            .ilike('company', companyParam)
            .limit(1)

          if (companyError) throw companyError
          clientData = (companyData || [])[0] || null
        }

        if (!clientData) {
          setFallbackClient(null)
          return
        }

        const { data: contactsData, error: contactsError } = await supabase
          .from('client_contacts')
          .select('*')
          .eq('client_id', clientData.id)
          .order('is_primary', { ascending: false })

        if (contactsError) throw contactsError

        const contacts = contactsData || []
        const primary = contacts.find((c) => c.is_primary) || contacts[0]

        setFallbackClient({
          ...clientData,
          lastOrder: clientData.last_order,
          orderAmount: clientData.order_amount,
          contact_person: primary?.name || '',
          phone: primary?.phone || '',
          email: primary?.email || '',
        })
      } catch (error) {
        console.error('고객 상세 정보 조회 오류:', error)
        await showError('고객 정보를 불러오는 중 오류가 발생했습니다.')
      } finally {
        setIsFetchingClient(false)
      }
    }

    fetchFallbackClient()
  }, [loading, currentClient, id, companyParam])

  const resolvedClient = currentClient || fallbackClient

  // 같은 회사명을 가진 모든 고객 데이터
  const companyClients = useMemo(() => {
    if (!resolvedClient) return []
    if (currentClient && clients && Array.isArray(clients)) {
      const companyName = currentClient.company
      if (!companyName) return [currentClient]
      return clients.filter((c) => c.company === companyName)
    }
    const companyName = resolvedClient.company
    if (!companyName) return [currentClient]
    return [resolvedClient]
  }, [currentClient, clients, resolvedClient])

  // 대표 담당자 (첫 번째)
  const primaryContact = companyClients[0] || resolvedClient

  // 이 회사의 모든 매출 내역
  const companySales = useMemo(() => {
    if (!sales || !Array.isArray(sales) || !primaryContact) return []
    const companyName = primaryContact.company
    if (!companyName) return []

    // 모든 담당자의 ID를 가져와서 매출 필터링
    const companyClientIds = companyClients.map((c) => String(c.id))
    return sales.filter((sale) =>
      companyClientIds.includes(String(sale.clientId || sale.client_id))
    )
  }, [sales, companyClients, primaryContact])

  // 이 회사의 모든 활동 내역
  const companyActivities = useMemo(() => {
    if (!activities || !Array.isArray(activities) || !primaryContact) return []
    const companyName = primaryContact.company
    if (!companyName) return []

    // 모든 담당자의 ID를 가져와서 활동 필터링
    const companyClientIds = companyClients.map((c) => String(c.id))
    return activities.filter((activity) =>
      companyClientIds.includes(String(activity.clientId || activity.client_id))
    )
  }, [activities, companyClients, primaryContact])

  // 이번 달 매출 계산 (현재 월의 1일부터 오늘까지)
  const thisMonthSales = useMemo(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1)
    const today = new Date(currentYear, currentMonth, now.getDate())

    return companySales
      .filter((sale) => {
        const saleDate = sale.sale_date || sale.date
        if (!saleDate) return false
        const saleDateObj = new Date(saleDate)
        return saleDateObj >= firstDayOfMonth && saleDateObj <= today
      })
      .reduce((sum, sale) => sum + (sale.totalAmount || 0), 0)
  }, [companySales])

  // 올해 누적 매출 계산 (YTD: Year To Date)
  const ytdSales = useMemo(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const firstDayOfYear = new Date(currentYear, 0, 1)
    const today = new Date()

    return companySales
      .filter((sale) => {
        const saleDate = sale.sale_date || sale.date
        if (!saleDate) return false
        const saleDateObj = new Date(saleDate)
        return saleDateObj >= firstDayOfYear && saleDateObj <= today
      })
      .reduce((sum, sale) => sum + (sale.totalAmount || 0), 0)
  }, [companySales])

  // 전년 동기 대비 성장률 계산 (YoY: Year over Year)
  const yoyGrowth = useMemo(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() // 0-based (0 = January)
    const currentDay = now.getDate()

    // 금년 실적: 1월 1일 ~ 오늘까지
    const firstDayOfYear = new Date(currentYear, 0, 1)
    const today = new Date(currentYear, currentMonth, currentDay)

    const thisYearSales = companySales
      .filter((sale) => {
        const saleDate = sale.sale_date || sale.date
        if (!saleDate) return false
        const saleDateObj = new Date(saleDate)
        // 시간 부분을 제거하고 날짜만 비교
        saleDateObj.setHours(0, 0, 0, 0)
        const startDate = new Date(firstDayOfYear)
        startDate.setHours(0, 0, 0, 0)
        const endDate = new Date(today)
        endDate.setHours(0, 0, 0, 0)
        return saleDateObj >= startDate && saleDateObj <= endDate
      })
      .reduce((sum, sale) => sum + (sale.totalAmount || 0), 0)

    // 작년 실적: 작년 1월 1일 ~ 작년 오늘(같은 월/일)까지
    const lastYear = currentYear - 1
    const firstDayOfLastYear = new Date(lastYear, 0, 1)
    const lastYearSameDate = new Date(lastYear, currentMonth, currentDay)

    const lastYearSales = companySales
      .filter((sale) => {
        const saleDate = sale.sale_date || sale.date
        if (!saleDate) return false
        const saleDateObj = new Date(saleDate)
        const saleYear = saleDateObj.getFullYear()
        // 시간 부분을 제거하고 날짜만 비교
        saleDateObj.setHours(0, 0, 0, 0)
        const startDate = new Date(firstDayOfLastYear)
        startDate.setHours(0, 0, 0, 0)
        const endDate = new Date(lastYearSameDate)
        endDate.setHours(0, 0, 0, 0)
        return (
          saleYear === lastYear &&
          saleDateObj >= startDate &&
          saleDateObj <= endDate
        )
      })
      .reduce((sum, sale) => sum + (sale.totalAmount || 0), 0)

    // 성장률 계산
    if (lastYearSales === 0) {
      return { value: null, label: '신규', isPositive: null }
    }

    const growthRate = ((thisYearSales - lastYearSales) / lastYearSales) * 100
    const isPositive = growthRate > 0

    return {
      value: growthRate,
      label: `${isPositive ? '+' : ''}${growthRate.toFixed(1)}%`,
      isPositive: isPositive,
    }
  }, [companySales])

  // 활동 내역 최신순 정렬
  const sortedActivities = useMemo(() => {
    return [...companyActivities].sort((a, b) => {
      const dateA = new Date(a.activity_date || a.date || a.created_at)
      const dateB = new Date(b.activity_date || b.date || b.created_at)
      return dateB - dateA
    })
  }, [companyActivities])

  // 매출 내역 최신순 정렬
  const sortedSales = useMemo(() => {
    return [...companySales].sort((a, b) => {
      const dateA = new Date(a.sale_date || a.date || a.created_at)
      const dateB = new Date(b.sale_date || b.date || b.created_at)
      return dateB - dateA
    })
  }, [companySales])

  // Guard Clause: loading 상태는 모든 Hook 선언 후에 처리
  if (loading || isFetchingClient) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-300">데이터를 불러오는 중...</div>
      </div>
    )
  }

  // Guard Clause: 고객 정보가 없으면
  if (!resolvedClient) {
    return (
      <div className="flex flex-col items-center justify-center h-screen space-y-4">
        <p className="text-gray-300">고객 정보를 찾을 수 없습니다.</p>
        <Link
          to="/clients"
          className="text-gray-300 hover:text-white font-medium px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
        >
          거래처 목록으로 돌아가기
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            to="/clients"
            className="text-gray-300 hover:text-white transition-all rounded-lg p-2 hover:bg-white/5"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <p className="text-gray-300 text-[11px] font-bold uppercase tracking-[0.15em] mb-1">Overview</p>
            <h1 className="text-2xl md:text-3xl font-semibold text-white">
              {primaryContact?.company || '거래처 정보'}
            </h1>
            <p className="text-gray-300 mt-1 text-sm">
              Customer 360 View
            </p>
          </div>
        </div>
      </div>

      {/* 2컬럼 레이아웃 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* 좌측 패널: 기본 정보 (1/4) */}
        <div className="lg:col-span-1 space-y-4">
          {/* 기본 정보 카드 */}
          <div className="card p-5 bg-[#1E1E1E] border-gray-800 rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
            <div className="space-y-4">
              {/* 회사명 */}
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <Building2 className="w-5 h-5 text-gray-300" />
                  <h2 className="text-lg font-bold text-white">
                    {primaryContact?.company || '-'}
                  </h2>
                </div>
                {companyClients.length > 1 && (
                  <p className="text-xs text-gray-300">
                    담당자 {companyClients.length}명
                  </p>
                )}
              </div>

              {/* 담당자 목록 */}
              {companyClients.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-gray-300 uppercase">
                    담당자 목록
                  </h3>
                  {companyClients.map((client, idx) => (
                    <div
                      key={client.id}
                      className={`p-2 rounded border border-gray-800 ${
                        idx === 0 ? 'bg-white/5' : 'bg-[#1E1E1E]'
                      }`}
                    >
                      <p className="text-sm font-medium text-white">
                        {client.contact_person || '-'}
                        {idx === 0 && (
                          <span className="ml-2 text-xs text-gray-300">
                            (대표)
                          </span>
                        )}
                      </p>
                      {client.phone && (
                        <p className="text-xs text-gray-300 mt-1">
                          {client.phone}
                        </p>
                      )}
                      {client.email && (
                        <p className="flex items-center gap-1 text-xs text-gray-300 truncate">
                          <Mail className="w-3.5 h-3.5 text-gray-300" />
                          <span className="truncate">{client.email}</span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 연락처 정보 */}
              <div className="space-y-2 pt-4 border-t border-gray-800">
                {primaryContact?.phone && (
                  <div className="group flex items-center space-x-2">
                    <span className="w-10 h-10 rounded-xl bg-[#1E1E1E] text-gray-300 flex items-center justify-center transition-all duration-300 ease-out group-hover:bg-blue-500/15 group-hover:text-blue-200 group-hover:scale-110">
                      <Phone className="w-4 h-4" />
                    </span>
                    <span className="text-sm text-gray-300">
                      {primaryContact.phone}
                    </span>
                  </div>
                )}
                {primaryContact?.email && (
                  <div className="group flex items-center space-x-2">
                    <span className="w-10 h-10 rounded-xl bg-[#1E1E1E] text-gray-300 flex items-center justify-center transition-all duration-300 ease-out group-hover:bg-blue-500/15 group-hover:text-blue-200 group-hover:scale-110">
                      <Mail className="w-4 h-4" />
                    </span>
                    <span className="text-sm text-gray-300 truncate">
                      {primaryContact.email}
                    </span>
                  </div>
                )}
                {primaryContact?.status && (
                  <div className="group flex items-center space-x-2">
                    <span className="w-10 h-10 rounded-xl bg-[#1E1E1E] text-gray-300 flex items-center justify-center transition-all duration-300 ease-out group-hover:bg-blue-500/15 group-hover:text-blue-200 group-hover:scale-110">
                      <Activity className="w-4 h-4" />
                    </span>
                    <span className="text-sm text-gray-300">
                      {coerceClientStatus(primaryContact.status, '-')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 매출 통계 카드 */}
          <div className="card p-5 bg-[#1E1E1E] border-gray-800 rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
            <h3 className="text-sm font-semibold text-gray-300 uppercase mb-4">
              매출 통계
            </h3>
            <div className="space-y-4">
              {/* 이번 달 매출 */}
              <div>
                <p className="text-xs text-gray-300 mb-1">이번 달 매출</p>
                <p className="text-2xl font-semibold text-white">
                  {formatCurrency(thisMonthSales || 0)}
                </p>
              </div>

              {/* 올해 누적 매출 */}
              <div className="pt-3 border-t border-gray-800">
                <p className="text-xs text-gray-300 mb-1">올해 누적 매출 (YTD)</p>
                <p className="text-lg font-semibold text-white">
                  {formatCurrency(ytdSales || 0)}
                </p>
              </div>

              {/* 전년 동기 대비 성장률 */}
              <div className="pt-3 border-t border-gray-800">
                <p className="text-xs text-gray-300 mb-1">작년 대비 성장</p>
                <div className="flex items-center space-x-2">
                  {yoyGrowth.value === null ? (
                    <>
                      <Minus className="w-4 h-4 text-gray-300" />
                      <p className="text-lg font-semibold text-gray-300">
                        {yoyGrowth.label}
                      </p>
                    </>
                  ) : yoyGrowth.isPositive ? (
                    <>
                      <TrendingUp className="w-4 h-4 text-red-300" />
                      <p className="text-lg font-semibold text-red-300">
                        ▲ {yoyGrowth.label}
                      </p>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="w-4 h-4 text-blue-300" />
                      <p className="text-lg font-semibold text-blue-300">
                        ▼ {yoyGrowth.label}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 우측 패널: 상세 이력 (3/4) */}
        <div className="lg:col-span-3 space-y-8">
          {/* 활동 타임라인 */}
          <div className="card p-5 md:p-6 bg-[#1E1E1E] border-gray-800 rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                <Activity className="w-5 h-5 text-gray-300" />
                <span>활동 내역</span>
              </h2>
              <span className="text-sm text-gray-300">
                총 {sortedActivities.length}건
              </span>
            </div>

            {sortedActivities.length > 0 ? (
              <div className="space-y-4">
                {sortedActivities.map((activity, index) => {
                  const activityDate = activity.activity_date || activity.date
                  const dateStr = activityDate
                    ? new Date(activityDate).toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                    : '-'

                  return (
                    <div key={activity.id} className="relative pl-8">
                      {/* 타임라인 라인 */}
                      {index < sortedActivities.length - 1 && (
                        <div className="absolute left-3 top-8 bottom-0 w-0.5 bg-gray-800"></div>
                      )}

                      {/* 타임라인 포인트 */}
                      <div className="absolute left-0 top-1 w-6 h-6 bg-[#1E1E1E] rounded-full border border-gray-800 flex items-center justify-center">
                        <div className="w-2 h-2 bg-zinc-400/70 rounded-full"></div>
                      </div>

                      {/* 활동 내용 */}
                      <div className="group bg-[#1E1E1E] rounded-lg p-4 border border-gray-800 hover:bg-white/5 transition-colors">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="w-8 h-8 rounded-xl bg-[#1E1E1E] text-gray-300 flex items-center justify-center transition-all duration-300 ease-out group-hover:bg-blue-500/15 group-hover:text-blue-200 group-hover:scale-110">
                                <Calendar className="w-4 h-4" />
                              </span>
                              <span className="text-sm font-semibold text-white">
                                {dateStr}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-gray-300">
                              {activity.type || '활동'}
                            </p>
                          </div>
                          {activity.status && (
                            <span className="text-xs px-2 py-1 bg-white/5 text-gray-300 rounded border border-gray-800">
                              {activity.status}
                            </span>
                          )}
                        </div>
                        {activity.description && (
                          <p className="text-sm text-gray-300 mt-2">
                            {activity.description}
                          </p>
                        )}
                        {activity.user && (
                          <p className="text-xs text-gray-300 mt-2">
                            담당: {activity.user}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-300">
                활동 내역이 없습니다.
              </div>
            )}
          </div>

          {/* 구매 이력 */}
          <div className="card p-5 md:p-6 bg-[#1E1E1E] border-gray-800 rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                <DollarSign className="w-5 h-5 text-gray-300" />
                <span>구매 이력</span>
              </h2>
              <div className="text-right">
                <p className="text-xs text-gray-300">올해 누적 매출액</p>
                <p className="text-xl font-semibold text-white">
                  {formatCurrency(ytdSales || 0)}
                </p>
              </div>
            </div>

            {sortedSales.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full table-compact divide-y divide-gray-800">
                  <thead className="bg-[#161616]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        날짜
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        품목
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        수량
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        금액
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        비고
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-transparent divide-y divide-gray-800">
                    {sortedSales.map((sale) => {
                      const saleDate = sale.sale_date || sale.date
                      const dateStr = saleDate
                        ? new Date(saleDate).toLocaleDateString('ko-KR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                          })
                        : '-'

                      // items에서 품목 정보 추출
                      const items = sale.items || []
                      const firstItem = items[0] || {}
                      const itemName =
                        firstItem.item_name ||
                        firstItem.productName ||
                        firstItem.name ||
                        '-'

                      return (
                        <tr
                          key={sale.id}
                          className="hover:bg-white/5 transition-colors"
                        >
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                            {dateStr}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-300">
                            {itemName}
                            {items.length > 1 && (
                              <span className="text-xs text-gray-300 ml-1">
                                외 {items.length - 1}건
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                            {items.reduce(
                              (sum, item) => sum + (item.quantity || 0),
                              0
                            )}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-white text-right">
                            {formatCurrency(sale.totalAmount || 0)}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-300">
                            <div className="max-w-xs truncate">
                              {sale.notes || '-'}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-300">
                구매 이력이 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ClientDetail




