import React, { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
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

const ClientDetail = () => {
  // 모든 Hook 선언을 최상단에 배치
  const { id } = useParams()
  const navigate = useNavigate()
  const { clients, sales, activities, loading } = useData()

  // 현재 선택된 고객 정보
  const currentClient = useMemo(() => {
    if (!clients || !Array.isArray(clients)) return null
    return clients.find((c) => c.id === id)
  }, [clients, id])

  // 같은 회사명을 가진 모든 고객 데이터
  const companyClients = useMemo(() => {
    if (!currentClient || !clients || !Array.isArray(clients)) return []
    const companyName = currentClient.company
    if (!companyName) return [currentClient]
    return clients.filter((c) => c.company === companyName)
  }, [currentClient, clients])

  // 대표 담당자 (첫 번째)
  const primaryContact = companyClients[0] || currentClient

  // 이 회사의 모든 매출 내역
  const companySales = useMemo(() => {
    if (!sales || !Array.isArray(sales) || !primaryContact) return []
    const companyName = primaryContact.company
    if (!companyName) return []

    // 모든 담당자의 ID를 가져와서 매출 필터링
    const companyClientIds = companyClients.map((c) => c.id)
    return sales.filter((sale) => companyClientIds.includes(sale.clientId))
  }, [sales, companyClients, primaryContact])

  // 이 회사의 모든 활동 내역
  const companyActivities = useMemo(() => {
    if (!activities || !Array.isArray(activities) || !primaryContact) return []
    const companyName = primaryContact.company
    if (!companyName) return []

    // 모든 담당자의 ID를 가져와서 활동 필터링
    const companyClientIds = companyClients.map((c) => c.id)
    return activities.filter((activity) =>
      companyClientIds.includes(activity.clientId)
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
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-text-secondary">데이터를 불러오는 중...</div>
      </div>
    )
  }

  // Guard Clause: 고객 정보가 없으면
  if (!currentClient) {
    return (
      <div className="flex flex-col items-center justify-center h-screen space-y-4">
        <p className="text-text-secondary">고객 정보를 찾을 수 없습니다.</p>
        <Link
          to="/clients"
          className="text-brand-blue hover:text-brand-blue-hover font-medium"
        >
          거래처 목록으로 돌아가기
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5 md:space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            to="/clients"
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-text-primary">
              {primaryContact?.company || '거래처 정보'}
            </h1>
            <p className="text-text-secondary mt-1 text-sm">
              Customer 360 View
            </p>
          </div>
        </div>
      </div>

      {/* 2컬럼 레이아웃 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 md:gap-6">
        {/* 좌측 패널: 기본 정보 (1/4) */}
        <div className="lg:col-span-1 space-y-4">
          {/* 기본 정보 카드 */}
          <div className="card p-5">
            <div className="space-y-4">
              {/* 회사명 */}
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <Building2 className="w-5 h-5 text-brand-blue" />
                  <h2 className="text-lg font-bold text-text-primary">
                    {primaryContact?.company || '-'}
                  </h2>
                </div>
                {companyClients.length > 1 && (
                  <p className="text-xs text-text-secondary">
                    담당자 {companyClients.length}명
                  </p>
                )}
              </div>

              {/* 담당자 목록 */}
              {companyClients.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-text-secondary uppercase">
                    담당자 목록
                  </h3>
                  {companyClients.map((client, idx) => (
                    <div
                      key={client.id}
                      className={`p-2 rounded ${
                        idx === 0 ? 'bg-blue-50' : 'bg-gray-50'
                      }`}
                    >
                      <p className="text-sm font-medium text-text-primary">
                        {client.contact_person || '-'}
                        {idx === 0 && (
                          <span className="ml-2 text-xs text-brand-blue">
                            (대표)
                          </span>
                        )}
                      </p>
                      {client.phone && (
                        <p className="text-xs text-text-secondary mt-1">
                          📞 {client.phone}
                        </p>
                      )}
                      {client.email && (
                        <p className="text-xs text-text-secondary truncate">
                          ✉️ {client.email}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 연락처 정보 */}
              <div className="space-y-2 pt-4 border-t border-border-light">
                {primaryContact?.phone && (
                  <div className="flex items-center space-x-2">
                    <Phone className="w-4 h-4 text-text-secondary" />
                    <span className="text-sm text-text-body">
                      {primaryContact.phone}
                    </span>
                  </div>
                )}
                {primaryContact?.email && (
                  <div className="flex items-center space-x-2">
                    <Mail className="w-4 h-4 text-text-secondary" />
                    <span className="text-sm text-text-body truncate">
                      {primaryContact.email}
                    </span>
                  </div>
                )}
                {primaryContact?.status && (
                  <div className="flex items-center space-x-2">
                    <Activity className="w-4 h-4 text-text-secondary" />
                    <span className="text-sm text-text-body">
                      {primaryContact.status}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 매출 통계 카드 */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-text-secondary uppercase mb-4">
              매출 통계
            </h3>
            <div className="space-y-4">
              {/* 이번 달 매출 */}
              <div>
                <p className="text-xs text-text-secondary mb-1">이번 달 매출</p>
                <p className="text-2xl font-bold text-text-primary">
                  {formatCurrency(thisMonthSales || 0)}
                </p>
              </div>

              {/* 올해 누적 매출 */}
              <div className="pt-3 border-t border-border-light">
                <p className="text-xs text-text-secondary mb-1">올해 누적 매출 (YTD)</p>
                <p className="text-lg font-bold text-text-primary">
                  {formatCurrency(ytdSales || 0)}
                </p>
              </div>

              {/* 전년 동기 대비 성장률 */}
              <div className="pt-3 border-t border-border-light">
                <p className="text-xs text-text-secondary mb-1">작년 대비 성장</p>
                <div className="flex items-center space-x-2">
                  {yoyGrowth.value === null ? (
                    <>
                      <Minus className="w-4 h-4 text-text-secondary" />
                      <p className="text-lg font-bold text-text-secondary">
                        {yoyGrowth.label}
                      </p>
                    </>
                  ) : yoyGrowth.isPositive ? (
                    <>
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      <p className="text-lg font-bold text-emerald-600">
                        ▲ {yoyGrowth.label}
                      </p>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="w-4 h-4 text-red-500" />
                      <p className="text-lg font-bold text-red-500">
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
        <div className="lg:col-span-3 space-y-5 md:space-y-6">
          {/* 활동 타임라인 */}
          <div className="card p-5 md:p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-text-primary flex items-center space-x-2">
                <Activity className="w-5 h-5 text-brand-blue" />
                <span>활동 내역</span>
              </h2>
              <span className="text-sm text-text-secondary">
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
                        <div className="absolute left-3 top-8 bottom-0 w-0.5 bg-border-light"></div>
                      )}

                      {/* 타임라인 포인트 */}
                      <div className="absolute left-0 top-1 w-6 h-6 bg-brand-blue rounded-full border-4 border-white flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                      </div>

                      {/* 활동 내용 */}
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="flex items-center space-x-2 mb-1">
                              <Calendar className="w-4 h-4 text-text-secondary" />
                              <span className="text-sm font-semibold text-text-primary">
                                {dateStr}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-text-body">
                              {activity.type || '활동'}
                            </p>
                          </div>
                          {activity.status && (
                            <span className="text-xs px-2 py-1 bg-blue-50 text-brand-blue rounded">
                              {activity.status}
                            </span>
                          )}
                        </div>
                        {activity.description && (
                          <p className="text-sm text-text-secondary mt-2">
                            {activity.description}
                          </p>
                        )}
                        {activity.user && (
                          <p className="text-xs text-text-secondary mt-2">
                            담당: {activity.user}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-text-secondary">
                활동 내역이 없습니다.
              </div>
            )}
          </div>

          {/* 구매 이력 */}
          <div className="card p-5 md:p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-text-primary flex items-center space-x-2">
                <DollarSign className="w-5 h-5 text-brand-green" />
                <span>구매 이력</span>
              </h2>
              <div className="text-right">
                <p className="text-xs text-text-secondary">올해 누적 매출액</p>
                <p className="text-xl font-bold text-brand-green">
                  {formatCurrency(ytdSales || 0)}
                </p>
              </div>
            </div>

            {sortedSales.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border-light">
                  <thead className="bg-transparent">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                        날짜
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                        품목
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                        수량
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-text-secondary uppercase tracking-wider">
                        금액
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                        비고
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-border-light">
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
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-text-body">
                            {dateStr}
                          </td>
                          <td className="px-4 py-4 text-sm text-text-body">
                            {itemName}
                            {items.length > 1 && (
                              <span className="text-xs text-text-secondary ml-1">
                                외 {items.length - 1}건
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-text-body">
                            {items.reduce(
                              (sum, item) => sum + (item.quantity || 0),
                              0
                            )}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-text-primary text-right">
                            {formatCurrency(sale.totalAmount || 0)}
                          </td>
                          <td className="px-4 py-4 text-sm text-text-secondary">
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
              <div className="text-center py-8 text-text-secondary">
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
