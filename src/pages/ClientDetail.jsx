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
    <div className="min-h-screen bg-oem-bg-app p-6 font-['Noto_Sans_KR',sans-serif] text-oem-text-primary mt-[50px]">
      <div className="max-w-[1200px] mx-auto space-y-6">

        {/* Page Header */}
        <div className="flex items-center justify-between border-b border-oem-border pb-3">
          <div className="flex items-center gap-4">
            <Link
              to="/clients"
              className="p-2 -ml-2 text-oem-text-secondary hover:text-oem-blue hover:bg-oem-blue/5 rounded-full transition-all"
              title="Back to List"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <p className="text-oem-blue text-[11px] font-bold uppercase tracking-[0.15em] mb-1">Customer Profile</p>
              <h1 className="text-2xl font-bold tracking-tight text-oem-text-primary flex items-center gap-2">
                {primaryContact?.company || '거래처 정보'}
              </h1>
              <p className="text-[11px] text-oem-text-secondary mt-1 font-medium">
                Customer 360 View & Transaction History
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${primaryContact?.status === '매출' ? 'bg-oem-green/10 border-oem-green/20 text-oem-green' : 'bg-slate-100 border-slate-200 text-slate-500'}`}>
              {coerceClientStatus(primaryContact?.status, 'Unknown')}
            </span>
          </div>
        </div>

        {/* 2-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Column (Info Panel) - 4 cols */}
          <div className="lg:col-span-4 space-y-6">

            {/* Basic Info Card */}
            <div className="oem-panel">
              <div className="oem-panel-header">
                <h3 className="text-xs font-bold uppercase tracking-tight flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5" /> Company Information
                </h3>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-oem-text-primary mb-1">{primaryContact?.company || '-'}</h2>
                  {companyClients.length > 1 && (
                    <span className="text-[10px] bg-oem-bg-app border border-oem-border text-oem-text-secondary px-2 py-0.5 rounded-full">
                      {companyClients.length} Contacts
                    </span>
                  )}
                </div>

                <div className="space-y-3 pt-3 border-t border-oem-border">
                  {/* Primary Contact */}
                  <div>
                    <p className="text-[10px] uppercase font-bold text-oem-text-secondary mb-1">Primary Contact</p>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-oem-blue/10 flex items-center justify-center text-oem-blue font-bold text-xs">
                        {primaryContact?.contact_person?.[0] || '?'}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-oem-text-primary">{primaryContact?.contact_person || 'N/A'}</p>
                        <p className="text-[11px] text-oem-text-secondary">{primaryContact?.role || 'Representative'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Contact Details */}
                  <div className="space-y-2">
                    {primaryContact?.phone && (
                      <div className="flex items-center gap-2 text-sm text-oem-text-primary">
                        <Phone className="w-3.5 h-3.5 text-oem-text-secondary" />
                        {primaryContact.phone}
                      </div>
                    )}
                    {primaryContact?.email && (
                      <div className="flex items-center gap-2 text-sm text-oem-text-primary truncate">
                        <Mail className="w-3.5 h-3.5 text-oem-text-secondary" />
                        <span className="truncate" title={primaryContact.email}>{primaryContact.email}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Other Contacts */}
                {companyClients.length > 1 && (
                  <div className="pt-3 border-t border-oem-border">
                    <p className="text-[10px] uppercase font-bold text-oem-text-secondary mb-2">Other Contacts</p>
                    <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                      {companyClients.slice(1).map(client => (
                        <div key={client.id} className="p-2 bg-oem-bg-app border border-oem-border rounded-sm text-xs">
                          <p className="font-bold text-oem-text-primary">{client.contact_person}</p>
                          <p className="text-oem-text-secondary">{client.email}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sales Stats Card */}
            <div className="oem-panel">
              <div className="oem-panel-header">
                <h3 className="text-xs font-bold uppercase tracking-tight flex items-center gap-2">
                  <DollarSign className="w-3.5 h-3.5" /> Financial Overview
                </h3>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <p className="text-[10px] uppercase font-bold text-oem-text-secondary mb-1">Current Month Sales</p>
                  <p className="text-2xl font-bold text-oem-blue">{formatCurrency(thisMonthSales || 0)}</p>
                </div>
                <div className="pt-3 border-t border-oem-border">
                  <p className="text-[10px] uppercase font-bold text-oem-text-secondary mb-1">YTD Sales (Year-to-Date)</p>
                  <p className="text-lg font-bold text-oem-text-primary">{formatCurrency(ytdSales || 0)}</p>
                </div>
                <div className="pt-3 border-t border-oem-border">
                  <p className="text-[10px] uppercase font-bold text-oem-text-secondary mb-1">YoY Growth</p>
                  <div className="flex items-center gap-2">
                    {yoyGrowth.value === null ? (
                      <span className="text-sm font-bold text-oem-text-secondary">N/A (New)</span>
                    ) : (
                      <span className={`text-lg font-bold flex items-center gap-1 ${yoyGrowth.isPositive ? 'text-oem-green' : 'text-oem-red'}`}>
                        {yoyGrowth.isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        {yoyGrowth.label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Right Column (Timeline & History) - 8 cols */}
          <div className="lg:col-span-8 space-y-6">

            {/* Activity Timeline */}
            <div className="oem-panel min-h-[400px]">
              <div className="oem-panel-header flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-oem-text-secondary" />
                  <span className="text-xs font-bold uppercase tracking-tight">Recent Activities</span>
                </div>
                <span className="bg-oem-bg-app border border-oem-border px-2 py-0.5 rounded-full text-[10px] font-bold text-oem-text-secondary">
                  {sortedActivities.length} Records
                </span>
              </div>
              <div className="p-0">
                {sortedActivities.length > 0 ? (
                  <div className="relative pl-6 py-4 space-y-6">
                    {/* Vertical Line */}
                    <div className="absolute left-[34px] top-6 bottom-6 w-px bg-oem-border z-0"></div>

                    {sortedActivities.map((activity, index) => {
                      const dateObj = new Date(activity.activity_date || activity.date)
                      const dateStr = dateObj.toLocaleDateString()

                      return (
                        <div key={activity.id} className="relative z-10 pl-8 pr-4 group">
                          {/* Dot */}
                          <div className={`absolute left-[29px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white ring-1 ring-oem-border ${activity.status === '완료' ? 'bg-oem-green' : 'bg-amber-400'}`}></div>

                          <div className="bg-white border border-oem-border rounded-sm p-3 hover:border-oem-blue transition-colors shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-oem-text-primary px-1.5 py-0.5 bg-oem-bg-app rounded-sm border border-oem-border">{activity.type}</span>
                                <span className="text-xs text-oem-text-secondary">{dateStr}</span>
                              </div>
                              {activity.user && <span className="text-[10px] text-oem-text-secondary bg-oem-bg-app px-1.5 rounded">by {activity.user}</span>}
                            </div>
                            <p className="text-sm text-oem-text-primary whitespace-pre-line leading-relaxed">
                              {activity.description}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-oem-text-secondary">
                    <Activity className="w-8 h-8 mb-2 opacity-20" />
                    <p className="text-xs">No activity records found.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Purchase History */}
            <div className="oem-panel">
              <div className="oem-panel-header flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-3.5 h-3.5 text-oem-text-secondary" />
                  <span className="text-xs font-bold uppercase tracking-tight">Purchase History</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-oem-text-secondary mr-2">Total YTD:</span>
                  <span className="text-xs font-bold text-oem-text-primary">{formatCurrency(ytdSales || 0)}</span>
                </div>
              </div>
              <div className="p-0 overflow-hidden">
                {sortedSales.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="oem-table min-w-full">
                      <thead>
                        <tr>
                          <th className="pl-4 py-2 text-left">DATE</th>
                          <th className="py-2 text-left">ITEM</th>
                          <th className="py-2 text-center">QTY</th>
                          <th className="py-2 text-right">AMOUNT</th>
                          <th className="py-2 text-left pr-4">NOTES</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedSales.map((sale) => {
                          const dateStr = new Date(sale.sale_date || sale.date).toLocaleDateString()
                          const items = sale.items || []
                          const itemName = items[0]?.item_name || items[0]?.name || '-'
                          const qty = items.reduce((acc, cur) => acc + (cur.quantity || 0), 0)

                          return (
                            <tr key={sale.id}>
                              <td className="pl-4 py-3 text-xs font-medium text-oem-text-secondary">{dateStr}</td>
                              <td className="py-3 text-xs font-bold text-oem-text-primary">
                                {itemName}
                                {items.length > 1 && <span className="ml-1 text-[10px] text-oem-text-secondary">(+{items.length - 1})</span>}
                              </td>
                              <td className="py-3 text-xs text-center text-oem-text-secondary">{qty}</td>
                              <td className="py-3 text-xs font-bold text-right text-oem-text-primary">{formatCurrency(sale.totalAmount || 0)}</td>
                              <td className="py-3 text-xs text-oem-text-secondary pr-4 truncate max-w-[150px]" title={sale.notes}>{sale.notes || '-'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-oem-text-secondary">
                    <DollarSign className="w-8 h-8 mb-2 opacity-20" />
                    <p className="text-xs">No purchase history found.</p>
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  )
}

export default ClientDetail




