import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Search, Edit, Download, Users, Camera, Loader2 } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import EditClientModal from '../components/EditClientModal'
import AddClientModal from '../components/AddClientModal'
import BusinessCardScannerModal from '../components/BusinessCardScannerModal'
import SwipeableListItem from '../components/SwipeableListItem'
import { exportClientsToExcel } from '../utils/excelExport'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { useDebounce } from '../hooks/useDebounce'
import { showConfirm, showError } from '../utils/alert'
import { formatCurrency } from '../utils/formatters'

const Clients = () => {
  // 모든 Hook 선언을 최상단에 배치 (React Hooks 규칙 준수)
  const { clients, sales, activities, loading, deleteClient } = useData()
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearchTerm = useDebounce(searchTerm, 150) // 검색 디바운스 (150ms)
  const [editingClientId, setEditingClientId] = useState(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false)
  const [scannedClientData, setScannedClientData] = useState(null) // 명함 스캔 데이터

  // 회사명 기준으로 그룹핑 (Hook 선언 후에 수행)
  const groupedClients = useMemo(() => {
    if (!clients || !Array.isArray(clients)) return {}

    return clients.reduce((acc, client) => {
      const company = client.company || '기타'
      if (!acc[company]) {
        acc[company] = []
      }
      acc[company].push(client)
      return acc
    }, {})
  }, [clients])

  // 검색 필터링된 그룹핑 데이터 (디바운스된 검색어 사용으로 최적화)
  const filteredGroupedClients = useMemo(() => {
    if (!debouncedSearchTerm.trim()) return groupedClients

    const searchLower = debouncedSearchTerm.toLowerCase()
    const filtered = {}
    
    // 검색 최적화: 객체 순회를 최소화하고 조기 종료 사용
    for (const company of Object.keys(groupedClients)) {
      const companyClients = groupedClients[company]
      const companyLower = company.toLowerCase()
      
      // 회사명 검색이 빠르므로 먼저 체크
      if (companyLower.includes(searchLower)) {
        filtered[company] = companyClients
        continue
      }
      
      // 담당자명 검색 (필요한 경우에만)
      const matches = companyClients.filter(
        (client) => (client.contact_person || '').toLowerCase().includes(searchLower)
      )
      if (matches.length > 0) {
        filtered[company] = matches
      }
    }
    return filtered
  }, [groupedClients, debouncedSearchTerm])

  // 무한 스크롤 적용: 그룹핑된 클라이언트를 평탄화하여 페이징 처리
  const flattenedClients = useMemo(() => {
    const flat = []
    Object.keys(filteredGroupedClients).forEach((company) => {
      const companyClients = filteredGroupedClients[company]
      companyClients.forEach((client) => {
        flat.push({ ...client, _groupKey: company }) // 그룹 키를 함께 저장
      })
    })
    return flat
  }, [filteredGroupedClients])

  // 무한 스크롤 훅 사용
  const { visibleItems, hasMore, containerRef } = useInfiniteScroll(
    flattenedClients,
    20, // 페이지당 20개
    { threshold: 100, enabled: !loading }
  )

  // 표시할 그룹 복원 (무한 스크롤에 맞게)
  const visibleGroupedClients = useMemo(() => {
    const grouped = {}
    visibleItems.forEach((client) => {
      const company = client._groupKey || client.company || '기타'
      if (!grouped[company]) {
        grouped[company] = []
      }
      grouped[company].push(client)
    })
    return grouped
  }, [visibleItems])

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
            총 {Object.keys(groupedClients).length}개 거래처
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
            <tbody className="bg-white divide-y divide-border-light" ref={containerRef}>
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
              {/* 무한 스크롤 트리거 */}
              {hasMore && (
                <tr>
                  <td colSpan="9" className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center space-x-2 text-text-secondary">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">더 많은 데이터를 불러오는 중...</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 모바일: Card View with Swipe (768px 미만) */}
        <div className="md:hidden divide-y divide-border-light" ref={containerRef}>
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
          {/* 무한 스크롤 트리거 (모바일) */}
          {hasMore && (
            <div className="px-6 py-4 text-center border-t border-gray-200">
              <div className="flex items-center justify-center space-x-2 text-text-secondary">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">더 많은 데이터를 불러오는 중...</span>
              </div>
            </div>
          )}
        </div>
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
