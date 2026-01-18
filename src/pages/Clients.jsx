import React, { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Search, Edit, Download, Users, Camera, Trash2 } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { supabase } from '../lib/supabase'
import EditClientModal from '../components/EditClientModal'
import AddClientModal from '../components/AddClientModal'
import BusinessCardScannerModal from '../components/BusinessCardScannerModal'
import SwipeableListItem from '../components/SwipeableListItem'
import Pagination from '../components/common/Pagination'
import { exportClientsToExcel } from '../utils/excelExport'
import { showConfirm, showError, showSuccess } from '../utils/alert'
import { formatKoreanCurrency } from '../utils/formatters'

const PAGE_SIZE = 15

const Clients = () => {
  // 모든 Hook 선언을 최상단에 배치 (React Hooks 규칙 준수)
  const { sales, activities, deleteClient } = useData()
  const [searchTerm, setSearchTerm] = useState('')
  const [editingClientId, setEditingClientId] = useState(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false)
  const [scannedClientData, setScannedClientData] = useState(null) // 명함 스캔 데이터
  const [allClients, setAllClients] = useState([]) // 전체 클라이언트 데이터 (Master Data)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [lastYearRevenueMap, setLastYearRevenueMap] = useState({})

  // ===== 헬퍼 함수들을 최상단에 정의 (useMemo에서 사용되므로 필수) =====
  // 고객별 최근 주문일 계산 (sales 데이터에서 집계)
  const getLastOrderDate = (clientId) => {
    if (!sales || !Array.isArray(sales)) return null

    const clientSales = sales.filter((sale) => sale.clientId === clientId)
    if (clientSales.length === 0) return null

    // 가장 최근 날짜 찾기
    const dates = clientSales
      .map((sale) => sale.sale_date || sale.date)
      .filter((date) => date)
      .sort((a, b) => new Date(b) - new Date(a))

    return dates.length > 0 ? dates[0] : null
  }

  // 고객별 최근 컨택일 계산 (activities 데이터에서 집계)
  const getLastContactDate = (clientId) => {
    if (!activities || !Array.isArray(activities)) return null

    const clientActivities = activities.filter((activity) => {
      const activityClientId = activity.clientId || activity.client_id
      return activityClientId === clientId
    })
    if (clientActivities.length === 0) return null

    // 가장 최근 날짜 찾기
    const dates = clientActivities
      .map((activity) => activity.activity_date || activity.date || activity.created_at)
      .filter((date) => date)
      .sort((a, b) => new Date(b) - new Date(a))

    return dates.length > 0 ? dates[0] : null
  }

  // 고객별 최근 1년 매출액 계산 (sales 데이터에서 집계)
  const getSaleDateForRange = (sale) => {
    const raw = sale.sale_date || sale.date || sale.created_at
    if (!raw) return null
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed
  }

  const getSaleAmount = (sale) => {
    const directAmount = sale.total_amount ?? sale.totalAmount
    if (directAmount !== undefined && directAmount !== null) {
      return Number(directAmount) || 0
    }

    if (Array.isArray(sale.items) && sale.items.length > 0) {
      return sale.items.reduce((sum, item) => {
        const itemAmount = item.total_amount ?? item.totalAmount
        if (itemAmount !== undefined && itemAmount !== null) {
          return sum + (Number(itemAmount) || 0)
        }
        const qty = Number(item.quantity || 0)
        const price = Number(item.unit_price ?? item.unitPrice ?? 0)
        return sum + qty * price
      }, 0)
    }

    return 0
  }

  const getLastYearRevenueAmount = (clientId) => {
    return Number(lastYearRevenueMap[String(clientId)] || 0)
  }

  // 회사별 통계 계산
  const getCompanyStats = (companyClients) => {
    // 모든 담당자의 주문일 중 가장 최근 것
    const allOrderDates = companyClients
      .map((client) => getLastOrderDate(client.id))
      .filter((date) => date)
      .sort((a, b) => new Date(b) - new Date(a))

    // 모든 담당자의 컨택일 중 가장 최근 것
    const allContactDates = companyClients
      .map((client) => getLastContactDate(client.id))
      .filter((date) => date)
      .sort((a, b) => new Date(b) - new Date(a))

    // 모든 담당자의 최근 1년 매출액 합산
    const totalAmount = companyClients.reduce((sum, client) => {
      return sum + getLastYearRevenueAmount(client.id)
    }, 0)

    return {
      lastOrder: allOrderDates.length > 0 ? allOrderDates[0] : null,
      lastContact: allContactDates.length > 0 ? allContactDates[0] : null,
      totalAmount: totalAmount,
    }
  }

  // 데이터 페칭 함수 (검색 로직 제거, 항상 모든 데이터 가져오기)
  const fetchAllRows = async (buildQuery, pageSize = 1000) => {
    let from = 0
    let results = []

    while (true) {
      const { data, error } = await buildQuery().range(from, from + pageSize - 1)
      if (error) throw error
      results = results.concat(data || [])
      if (!data || data.length < pageSize) break
      from += pageSize
    }

    return results
  }

  const fetchData = async () => {
    try {
      setLoading(true)
      
      // 모든 클라이언트 데이터 가져오기 (검색 필터링 없음)
      const data = await fetchAllRows(() =>
        supabase
          .from('clients')
          .select('*')
          .order('company')
      )

      // 담당자 정보 조회 (HTTP 400 방지: 모든 contacts를 가져와서 클라이언트 사이드에서 병합)
      // .in() 필터를 사용하지 않고 모든 contacts를 가져옴 (URL 길이 제한 회피)
      const contactsData = await fetchAllRows(() =>
        supabase
          .from('client_contacts')
          .select('*')
          .order('is_primary', { ascending: false })
      )

      const contactsByClient = (contactsData || []).reduce((acc, c) => {
        if (!acc[c.client_id]) acc[c.client_id] = []
        acc[c.client_id].push(c)
        return acc
      }, {})

      // 클라이언트 데이터에 담당자 정보 매핑
      const clientsData = (data || []).map(client => {
        const contacts = contactsByClient[client.id] || []
        const primary = contacts.find(c => c.is_primary) || contacts[0]
        return {
          ...client,
          lastOrder: client.last_order,
          orderAmount: client.order_amount,
          contact_person: primary?.name || '',
          phone: primary?.phone || '',
          email: primary?.email || ''
        }
      })

      // 작년 매출액 집계 (DB 기준)
      const lastYear = new Date().getFullYear() - 1
      const startDate = `${lastYear}-01-01`
      const endDate = `${lastYear}-12-31`
      const salesData = await fetchAllRows(() =>
        supabase
          .from('sales')
          .select('client_id, total_amount, quantity, unit_price')
          .gte('sale_date', startDate)
          .lte('sale_date', endDate)
      )

      const revenueMap = (salesData || []).reduce((acc, row) => {
        const key = String(row.client_id)
        const amount = row.total_amount !== null && row.total_amount !== undefined
          ? Number(row.total_amount)
          : Number(row.quantity || 0) * Number(row.unit_price || 0)
        acc[key] = (acc[key] || 0) + (Number(amount) || 0)
        return acc
      }, {})

      setLastYearRevenueMap(revenueMap)

      // 전체 데이터 저장 (Master Data)
      setAllClients(clientsData)
    } catch (error) {
      console.error('거래처 데이터 로드 오류:', error)
      showError('거래처 데이터를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // 페이지 변경 시에만 데이터 다시 로드 (검색어는 클라이언트 사이드 필터링)
  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // 초기 로드만 수행

  // 검색어 변경 시 첫 페이지로 리셋
  useEffect(() => {
    setPage(1)
  }, [searchTerm])

  // 클라이언트 사이드 필터링 (useMemo로 최적화)
  const filteredClients = useMemo(() => {
    if (!allClients || allClients.length === 0) return []
    
    // 검색어가 없으면 모든 클라이언트 반환
    if (!searchTerm || !searchTerm.trim()) {
      return allClients
    }

    // 검색어를 소문자로 변환
    const searchLower = searchTerm.toLowerCase().trim()

    // 다음 필드에서 case-insensitive 검색
    return allClients.filter(client => {
      const company = (client.company || '').toLowerCase()
      const contactPerson = (client.contact_person || '').toLowerCase()
      const salesRep = (client.sales_rep || '').toLowerCase()
      
      // 하나라도 매칭되면 포함
      return company.includes(searchLower) ||
             contactPerson.includes(searchLower) ||
             salesRep.includes(searchLower)
    })
  }, [allClients, searchTerm]) // debouncedSearchTerm 대신 searchTerm 사용 (즉시 반응)

  // totalCount 업데이트 (필터링된 데이터 기준)
  useEffect(() => {
    setTotalCount(filteredClients.length)
  }, [filteredClients])

  // 회사명 기준으로 그룹핑 (필터링된 데이터 전체 기준)
  const groupedClients = useMemo(() => {
    if (!filteredClients || !Array.isArray(filteredClients)) return {}

    return filteredClients.reduce((acc, client) => {
      const company = client.company || '기타'
      if (!acc[company]) {
        acc[company] = []
      }
      acc[company].push(client)
      return acc
    }, {})
  }, [filteredClients])

  // 검색 필터링은 이미 filteredClients에서 처리되므로 groupedClients를 그대로 사용
  const filteredGroupedClients = groupedClients

  // 표시할 그룹 (총 매출액 기준 내림차순 정렬)
  const sortedCompanies = useMemo(() => {
    const groups = Object.keys(filteredGroupedClients)
    
    // 각 그룹의 총 매출액을 계산하여 정렬
    const sortedGroups = groups.sort((a, b) => {
      const groupA = filteredGroupedClients[a]
      const groupB = filteredGroupedClients[b]
      const statsA = getCompanyStats(groupA)
      const statsB = getCompanyStats(groupB)
      return (statsB.totalAmount || 0) - (statsA.totalAmount || 0) // 내림차순
    })
    
    return sortedGroups
  }, [filteredGroupedClients, sales]) // sales 의존성 추가 (getCompanyStats가 sales를 사용)

  // 정렬된 그룹 순서를 유지한 전체 리스트 생성
  const orderedClients = useMemo(() => {
    return sortedCompanies.flatMap((company) => filteredGroupedClients[company])
  }, [sortedCompanies, filteredGroupedClients])

  // 페이지네이션 적용 (정렬된 데이터 기준)
  const paginatedClients = useMemo(() => {
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE
    return orderedClients.slice(from, to)
  }, [orderedClients, page])

  // 페이지네이션된 데이터로 그룹핑 (표시용)
  const paginatedGroupedClients = useMemo(() => {
    if (!paginatedClients || !Array.isArray(paginatedClients)) return {}

    return paginatedClients.reduce((acc, client) => {
      const company = client.company || '기타'
      if (!acc[company]) {
        acc[company] = []
      }
      acc[company].push(client)
      return acc
    }, {})
  }, [paginatedClients])

  // 표시할 그룹 (정렬된 순서 + 페이지네이션 반영)
  const visibleGroupedClients = useMemo(() => {
    return sortedCompanies.reduce((acc, company) => {
      if (paginatedGroupedClients[company]) {
        acc[company] = paginatedGroupedClients[company]
      }
      return acc
    }, {})
  }, [sortedCompanies, paginatedGroupedClients])

  // 상태 색상 함수 (매출, 신규, 단절 통일)
  const getStatusColor = (status) => {
    switch (status) {
      case '매출':
        return 'bg-emerald-400/10 text-emerald-300 border border-emerald-400/30'
      case '신규':
        return 'bg-amber-400/10 text-amber-300 border border-amber-400/30'
      case '단절':
        return 'bg-white/5 text-gray-300 border border-gray-800'
      default:
        return 'bg-white/5 text-gray-300 border border-gray-800'
    }
  }

  // 담당자 목록을 툴팁용 문자열로 변환
  const getContactsTooltip = (companyClients) => {
    return companyClients
      .map((client) => {
        const name = client.contact_person || '이름 없음'
        const phone = client.phone || '연락처 없음'
        return `${name} (${phone})`
      })
      .join('\n')
  }

  const handleExport = () => {
    // 그룹핑된 데이터를 평탄화하여 내보내기
    const flatClients = Object.values(filteredGroupedClients).flat()
    exportClientsToExcel(flatClients)
  }

  // Delete All Clients 핸들러
  const handleDeleteAll = async () => {
    const confirmed = window.confirm(
      '정말로 모든 거래처 데이터를 삭제하시겠습니까? (연관된 매출 데이터가 있다면 오류가 발생할 수 있습니다.)'
    )
    
    if (!confirmed) return

    try {
      setLoading(true)
      
      // 외래 키 제약조건으로 인한 오류 방지: 관련 테이블부터 삭제
      const { error: contactsError } = await supabase
        .from('client_contacts')
        .delete()
        .neq('id', 0)

      if (contactsError) throw contactsError

      const { error: activitiesError } = await supabase
        .from('activities')
        .delete()
        .neq('id', 0)

      if (activitiesError) throw activitiesError

      const { error: salesError } = await supabase
        .from('sales')
        .delete()
        .neq('id', 0)

      if (salesError) throw salesError

      // 모든 clients 레코드 삭제
      const { error: clientsError } = await supabase
        .from('clients')
        .delete()
        .neq('id', 0) // 모든 레코드 삭제 (id가 0이 아닌 모든 레코드)

      if (clientsError) throw clientsError

      await showSuccess('모든 거래처 데이터가 삭제되었습니다.')
      
      // 리스트 즉시 새로고침
      setPage(1)
      await fetchData()
    } catch (error) {
      console.error('전체 삭제 오류:', error)
      await showError('전체 삭제 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // Guard Clause: loading 상태는 모든 Hook 선언 후에 처리
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-300">데이터를 불러오는 중...</div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-gray-300 text-[11px] font-bold uppercase tracking-[0.15em] mb-1">Overview</p>
          <h1 className="text-2xl md:text-3xl font-semibold text-white">거래처 관리</h1>
          <p className="text-gray-300 mt-1.5 text-sm md:text-base">
            총 {totalCount} 거래처
          </p>
        </div>
        <div className="flex items-center space-x-3 w-full sm:w-auto flex-wrap gap-2">
          <button
            onClick={handleExport}
            className="btn-secondary flex-1 sm:flex-none flex items-center justify-center space-x-2 touch-manipulation min-h-[44px] px-4 py-3"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Download className="w-4 h-4" />
            <span>DB Download</span>
          </button>
          <button
            onClick={handleDeleteAll}
            className="btn-danger flex-1 sm:flex-none flex items-center justify-center space-x-2 touch-manipulation min-h-[44px] px-4 py-3"
            style={{ WebkitTapHighlightColor: 'transparent' }}
            disabled={loading}
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete All</span>
          </button>
          <button
            onClick={() => setIsScannerModalOpen(true)}
            className="btn-secondary flex-1 sm:flex-none flex items-center justify-center space-x-2 touch-manipulation min-h-[44px] px-4 py-3"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Camera className="w-4 h-4" />
            <span className="hidden sm:inline">명함 스캔</span>
            <span className="sm:hidden">스캔</span>
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="btn-primary flex-1 sm:flex-none flex items-center justify-center space-x-2 touch-manipulation min-h-[44px] px-4 py-3"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <span>+</span>
            <span className="hidden sm:inline">거래처 추가</span>
            <span className="sm:hidden">추가</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="card p-4 md:p-5 bg-[#1E1E1E] border-gray-800 rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] hover:bg-white/5 transition-colors">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-300 w-5 h-5 pointer-events-none" />
          <input
            type="text"
            placeholder="회사명 또는 담당자명으로 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field w-full pl-10 pr-4 py-3 text-base md:text-base touch-manipulation min-h-[44px]"
            style={{ fontSize: '16px', WebkitTapHighlightColor: 'transparent' }}
          />
        </div>
      </div>

      {/* Clients - PC: Table, 모바일: Card with Swipe */}
      <div className="card overflow-hidden bg-[#1E1E1E] border-gray-800 rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
        {/* PC: Table View (768px 이상) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full table-compact divide-y divide-gray-800">
            <thead className="bg-[#161616]">
              <tr>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-[0.16em]">
                  회사명
                </th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-[0.16em]">
                  담당자
                </th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-[0.16em]">
                  연락처
                </th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-[0.16em]">
                  이메일
                </th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-[0.16em]">
                  상태
                </th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-[0.16em]">
                  최근 주문일
                </th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-[0.16em]">
                  Recent Contact Date
                </th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-[0.16em]">
                  작년 매출액
                </th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="bg-transparent divide-y divide-gray-800">
              {Object.keys(visibleGroupedClients).length > 0 ? (
                Object.keys(visibleGroupedClients).map((company) => {
                  // visibleGroupedClients는 무한 스크롤에 보이는 항목만 포함하므로,
                  // 통계 계산을 위해 전체 필터링된 데이터 사용
                  const visibleClients = visibleGroupedClients[company]
                  const companyClients = filteredGroupedClients[company] || visibleClients
                  const primaryContact = visibleClients[0] // 첫 번째 담당자를 대표로 (보이는 항목 기준)
                  const hasMultipleContacts = companyClients.length > 1
                  const stats = getCompanyStats(companyClients)
                  const contactsTooltip = getContactsTooltip(companyClients)

                  return (
                  <tr key={company} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 md:px-6 md:py-5">
                        <Link
                          to={`/clients/${primaryContact?.id}?company=${encodeURIComponent(company)}`}
                          className="text-sm font-semibold text-white hover:text-white transition-colors cursor-pointer"
                        >
                          {company}
                        </Link>
                      </td>
                      <td className="px-4 py-3 md:px-6 md:py-5">
                        <div
                          className="flex items-center space-x-2"
                          title={hasMultipleContacts ? contactsTooltip : undefined}
                        >
                          <div className="text-sm text-gray-300">
                            {primaryContact?.contact_person || '-'}
                          </div>
                          {hasMultipleContacts && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-white/5 text-gray-300 border border-gray-800">
                              <Users className="w-3 h-3 mr-1" />
                              외 {companyClients.length - 1}명
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 md:px-6 md:py-5">
                        <div className="text-sm text-gray-300">
                          {primaryContact?.phone || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3 md:px-6 md:py-5">
                        <div className="text-sm text-gray-300">
                          {primaryContact?.email || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3 md:px-6 md:py-5 whitespace-nowrap">
                        <span
                          className={`px-3 py-1.5 inline-flex text-xs leading-5 font-semibold rounded-lg ${getStatusColor(
                            primaryContact?.status
                          )}`}
                        >
                          {primaryContact?.status || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 md:px-6 md:py-5 whitespace-nowrap text-sm text-gray-300">
                        {stats.lastOrder ? stats.lastOrder.split('T')[0] : '-'}
                      </td>
                      <td className="px-4 py-3 md:px-6 md:py-5 whitespace-nowrap text-sm text-gray-300">
                        {stats.lastContact ? stats.lastContact.split('T')[0] : '-'}
                      </td>
                      <td className="px-4 py-3 md:px-6 md:py-5 whitespace-nowrap text-sm font-semibold text-white">
                        {stats.totalAmount === 0
                          ? '0원'
                          : formatKoreanCurrency(stats.totalAmount || 0)}
                      </td>
                      <td className="px-4 py-3 md:px-6 md:py-5 whitespace-nowrap text-sm">
                        <button
                          onClick={() => setEditingClientId(primaryContact?.id)}
                          className="text-gray-300 hover:text-white font-medium flex items-center space-x-1 transition-all touch-manipulation px-3 py-2 min-h-[44px] rounded-lg hover:bg-white/5"
                          style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                          <Edit className="w-4 h-4" />
                          <span>수정</span>
                        </button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan="9" className="px-4 py-6 md:px-6 md:py-8 text-center text-gray-300">
                    {searchTerm ? '검색 결과가 없습니다.' : '거래처가 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <Pagination
          totalCount={totalCount}
          pageSize={PAGE_SIZE}
          currentPage={page}
          onPageChange={setPage}
        />
      </div>

      {/* 모바일: Card View with Swipe (768px 미만) */}
      <div className="card overflow-hidden md:hidden bg-[#1E1E1E] border-gray-800 rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
        <div className="divide-y divide-gray-800">
          {Object.keys(visibleGroupedClients).length > 0 ? (
            Object.keys(visibleGroupedClients).map((company) => {
              const companyClients = visibleGroupedClients[company]
              const primaryContact = companyClients[0]
              const hasMultipleContacts = companyClients.length > 1
              const stats = getCompanyStats(companyClients)

              return (
                <SwipeableListItem
                  key={company}
                  onEdit={() => setEditingClientId(primaryContact?.id)}
                  onDelete={async () => {
                    const confirmed = await showConfirm(
                      `"${company}" 고객 정보가 영구적으로 삭제됩니다.`,
                      '정말 삭제하시겠습니까?',
                      '삭제',
                      '취소'
                    )
                    if (confirmed) {
                      try {
                        await deleteClient(primaryContact?.id)
                        // 삭제 후 현재 페이지가 비어있으면 이전 페이지로 이동
                        if (clients.length === 1 && page > 1) {
                          setPage(page - 1)
                        } else {
                          fetchData()
                        }
                      } catch (error) {
                        console.error('고객 삭제 오류:', error)
                        await showError('삭제 중 오류가 발생했습니다.')
                      }
                    }
                  }}
                  enabled={true}
                >
                  <Link
                    to={`/clients/${primaryContact?.id}?company=${encodeURIComponent(company)}`}
                    className="block p-4 bg-[#1E1E1E] hover:bg-white/5 transition-colors touch-manipulation"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-base font-bold text-white flex-1 break-words">
                        {company}
                      </h3>
                      <span
                        className={`ml-2 px-2 py-1 text-xs font-semibold rounded-lg whitespace-nowrap ${getStatusColor(
                          primaryContact?.status
                        )}`}
                      >
                        {primaryContact?.status || '-'}
                      </span>
                    </div>
                    <div className="space-y-1.5 text-sm text-gray-300">
                      {primaryContact?.contact_person && (
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">담당자:</span>
                          <span>{primaryContact.contact_person}</span>
                          {hasMultipleContacts && (
                            <span className="text-xs text-gray-300">
                              외 {companyClients.length - 1}명
                            </span>
                          )}
                        </div>
                      )}
                      {primaryContact?.phone && (
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">연락처:</span>
                          <span>{primaryContact.phone}</span>
                        </div>
                      )}
                      {primaryContact?.email && (
                        <div className="flex items-center space-x-2 break-all">
                          <span className="font-medium">이메일:</span>
                          <span>{primaryContact.email}</span>
                        </div>
                      )}
                      <div className="flex items-center space-x-2 mt-2 pt-2 border-t border-white/10">
                        <span className="text-xs text-gray-300">
                          최근 주문: {stats.lastOrder ? stats.lastOrder.split('T')[0] : '-'}
                        </span>
                        <span className="text-xs text-gray-300">•</span>
                        <span className="text-xs text-gray-300">
                          최근 컨택: {stats.lastContact ? stats.lastContact.split('T')[0] : '-'}
                        </span>
                        <span className="text-xs text-gray-300">•</span>
                        <span className="text-xs font-semibold text-white">
                          {stats.totalAmount === 0
                            ? '0원'
                            : formatKoreanCurrency(stats.totalAmount || 0)}
                        </span>
                      </div>
                    </div>
                  </Link>
                </SwipeableListItem>
              )
            })
          ) : (
            <div className="px-6 py-8 text-center text-gray-300">
              {searchTerm ? '검색 결과가 없습니다.' : '거래처가 없습니다.'}
            </div>
          )}
        </div>
        {/* Pagination (모바일) */}
        <Pagination
          totalCount={totalCount}
          pageSize={PAGE_SIZE}
          currentPage={page}
          onPageChange={setPage}
        />
      </div>

      {/* Modals */}
      <AddClientModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false)
          setScannedClientData(null) // 모달 닫을 때 스캔 데이터 초기화
        }}
        initialData={scannedClientData} // 명함 스캔 데이터 전달
      />
      <EditClientModal
        isOpen={editingClientId !== null}
        onClose={() => setEditingClientId(null)}
        clientId={editingClientId}
      />
      <BusinessCardScannerModal
        isOpen={isScannerModalOpen}
        onClose={() => {
          setIsScannerModalOpen(false)
          setScannedClientData(null) // 모달 닫을 때 스캔 데이터 초기화
        }}
        onSuccess={(result) => {
          // 명함 스캔 성공 시, 추출된 정보가 있으면 거래처 입력 폼에 데이터 채우기
          if (result && result.extractedInfo) {
            // 추출된 정보를 거래처 입력 폼에 전달
            setScannedClientData(result.extractedInfo)
            setIsScannerModalOpen(false)
            // 회사명이 있으면 거래처 입력 폼 열기
            if (result.extractedInfo.company) {
              setIsAddModalOpen(true)
            }
          } else {
            // 이미 등록되었거나 업데이트된 경우 모달만 닫기
            setTimeout(() => {
              setIsScannerModalOpen(false)
            }, 1500)
          }
        }}
      />
    </div>
  )
}

export default Clients




