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
import { formatCurrency } from '../utils/formatters'

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

  // 고객별 올해 누적 주문 금액 계산 (sales 데이터에서 집계)
  const getThisYearOrderAmount = (clientId) => {
    if (!sales || !Array.isArray(sales)) return 0

    const currentYear = new Date().getFullYear()
    const clientSales = sales.filter((sale) => {
      if (sale.clientId !== clientId) return false

      const saleDate = sale.sale_date || sale.date
      if (!saleDate) return false

      const saleYear = new Date(saleDate).getFullYear()
      return saleYear === currentYear
    })

    return clientSales.reduce((sum, sale) => {
      return sum + (sale.totalAmount || 0)
    }, 0)
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

    // 모든 담당자의 올해 주문 금액 합산
    const totalAmount = companyClients.reduce((sum, client) => {
      return sum + getThisYearOrderAmount(client.id)
    }, 0)

    return {
      lastOrder: allOrderDates.length > 0 ? allOrderDates[0] : null,
      lastContact: allContactDates.length > 0 ? allContactDates[0] : null,
      totalAmount: totalAmount,
    }
  }

  // 데이터 페칭 함수 (검색 로직 제거, 항상 모든 데이터 가져오기)
  const fetchData = async () => {
    try {
      setLoading(true)
      
      // 모든 클라이언트 데이터 가져오기 (검색 필터링 없음)
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('company')
        .range(0, 99999) // 1000-row limit 제거

      if (error) throw error

      // 담당자 정보 조회 (HTTP 400 방지: 모든 contacts를 가져와서 클라이언트 사이드에서 병합)
      // .in() 필터를 사용하지 않고 모든 contacts를 가져옴 (URL 길이 제한 회피)
      const { data: contactsData } = await supabase
        .from('client_contacts')
        .select('*')
        .order('is_primary', { ascending: false })
        .range(0, 99999) // 1000-row limit 제거

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

  // 페이지네이션 적용 (필터링된 데이터 기준)
  const paginatedClients = useMemo(() => {
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE
    return filteredClients.slice(from, to)
  }, [filteredClients, page])

  // totalCount 업데이트 (필터링된 데이터 기준)
  useEffect(() => {
    setTotalCount(filteredClients.length)
  }, [filteredClients])

  // 회사명 기준으로 그룹핑 (페이지네이션된 데이터 기준)
  const groupedClients = useMemo(() => {
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

  // 검색 필터링은 이미 filteredClients에서 처리되므로 groupedClients를 그대로 사용
  const filteredGroupedClients = groupedClients

  // 표시할 그룹 (총 매출액 기준 내림차순 정렬)
  const visibleGroupedClients = useMemo(() => {
    const groups = Object.keys(filteredGroupedClients)
    
    // 각 그룹의 총 매출액을 계산하여 정렬
    const sortedGroups = groups.sort((a, b) => {
      const groupA = filteredGroupedClients[a]
      const groupB = filteredGroupedClients[b]
      const statsA = getCompanyStats(groupA)
      const statsB = getCompanyStats(groupB)
      return (statsB.totalAmount || 0) - (statsA.totalAmount || 0) // 내림차순
    })
    
    // 정렬된 순서대로 객체 재구성
    return sortedGroups.reduce((acc, company) => {
      acc[company] = filteredGroupedClients[company]
      return acc
    }, {})
  }, [filteredGroupedClients, sales]) // sales 의존성 추가 (getCompanyStats가 sales를 사용)

  // 상태 색상 함수 (매출, 신규, 단절 통일)
  const getStatusColor = (status) => {
    switch (status) {
      case '매출':
        return 'bg-emerald-50 text-emerald-700'
      case '신규':
        return 'bg-blue-50 text-blue-700'
      case '단절':
        return 'bg-gray-100 text-gray-600'
      default:
        return 'bg-gray-100 text-gray-600'
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
      
      // 모든 clients 레코드 삭제
      const { error } = await supabase
        .from('clients')
        .delete()
        .neq('id', 0) // 모든 레코드 삭제 (id가 0이 아닌 모든 레코드)

      if (error) throw error

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
        <div className="text-text-secondary">데이터를 불러오는 중...</div>
      </div>
    )
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-text-primary">거래처 관리</h1>
          <p className="text-text-secondary mt-1.5 text-sm md:text-base">
            총 {totalCount}개 거래처
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
            className="btn-danger flex-1 sm:flex-none flex items-center justify-center space-x-2 touch-manipulation min-h-[44px] px-4 py-3 bg-red-600 hover:bg-red-700 text-white"
            style={{ WebkitTapHighlightColor: 'transparent' }}
            disabled={loading}
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete All</span>
          </button>
          <button
            onClick={() => setIsScannerModalOpen(true)}
            className="btn-secondary flex-1 sm:flex-none flex items-center justify-center space-x-2 touch-manipulation min-h-[44px] px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white border-purple-600"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Camera className="w-4 h-4" />
            <span className="hidden sm:inline">명함 스캔</span>
            <span className="sm:hidden">스캔</span>
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="btn-success flex-1 sm:flex-none flex items-center justify-center space-x-2 touch-manipulation min-h-[44px] px-4 py-3"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <span>+</span>
            <span className="hidden sm:inline">거래처 추가</span>
            <span className="sm:hidden">추가</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="card p-4 md:p-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
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
      <div className="card overflow-hidden">
        {/* PC: Table View (768px 이상) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-border-light">
            <thead className="bg-transparent">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  회사명
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  담당자
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  연락처
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  이메일
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  상태
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  최근 주문일
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Recent Contact Date
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  누적 주문 금액 (올해)
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-border-light">
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
                    <tr key={company} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-5">
                        <Link
                          to={`/clients/${primaryContact?.id}`}
                          className="text-sm font-semibold text-text-primary hover:text-brand-blue transition-colors cursor-pointer"
                        >
                          {company}
                        </Link>
                      </td>
                      <td className="px-6 py-5">
                        <div
                          className="flex items-center space-x-2"
                          title={hasMultipleContacts ? contactsTooltip : undefined}
                        >
                          <div className="text-sm text-text-body">
                            {primaryContact?.contact_person || '-'}
                          </div>
                          {hasMultipleContacts && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-brand-blue">
                              <Users className="w-3 h-3 mr-1" />
                              외 {companyClients.length - 1}명
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="text-sm text-text-body">
                          {primaryContact?.phone || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="text-sm text-text-body">
                          {primaryContact?.email || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <span
                          className={`px-3 py-1.5 inline-flex text-xs leading-5 font-semibold rounded-lg ${getStatusColor(
                            primaryContact?.status
                          )}`}
                        >
                          {primaryContact?.status || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm text-text-secondary">
                        {stats.lastOrder ? stats.lastOrder.split('T')[0] : '-'}
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm text-text-secondary">
                        {stats.lastContact ? stats.lastContact.split('T')[0] : '-'}
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm font-semibold text-text-primary">
                        {stats.totalAmount === 0
                          ? '0원'
                          : formatCurrency(stats.totalAmount || 0)}
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm">
                        <button
                          onClick={() => setEditingClientId(primaryContact?.id)}
                          className="text-brand-blue hover:text-brand-blue-hover font-medium flex items-center space-x-1 transition-colors touch-manipulation px-3 py-2 min-h-[44px]"
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
                  <td colSpan="9" className="px-6 py-8 text-center text-text-secondary">
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
      <div className="card overflow-hidden md:hidden">
        <div className="divide-y divide-border-light">
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
                    to={`/clients/${primaryContact?.id}`}
                    className="block p-4 bg-white hover:bg-gray-50 transition-colors touch-manipulation"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-base font-bold text-text-primary flex-1 break-words">
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
                    <div className="space-y-1.5 text-sm text-text-secondary">
                      {primaryContact?.contact_person && (
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">담당자:</span>
                          <span>{primaryContact.contact_person}</span>
                          {hasMultipleContacts && (
                            <span className="text-xs text-brand-blue">
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
                      <div className="flex items-center space-x-2 mt-2 pt-2 border-t border-gray-100">
                        <span className="text-xs text-text-secondary">
                          최근 주문: {stats.lastOrder ? stats.lastOrder.split('T')[0] : '-'}
                        </span>
                        <span className="text-xs text-text-secondary">•</span>
                        <span className="text-xs text-text-secondary">
                          최근 컨택: {stats.lastContact ? stats.lastContact.split('T')[0] : '-'}
                        </span>
                        <span className="text-xs text-text-secondary">•</span>
                        <span className="text-xs font-semibold text-text-primary">
                          {stats.totalAmount === 0
                            ? '0원'
                            : formatCurrency(stats.totalAmount || 0)}
                        </span>
                      </div>
                    </div>
                  </Link>
                </SwipeableListItem>
              )
            })
          ) : (
            <div className="px-6 py-8 text-center text-text-secondary">
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
