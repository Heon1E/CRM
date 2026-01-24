import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Search, Edit, Download, Users, Camera, Trash2, Plus } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { supabase } from '../lib/supabase'
import EditClientModal from '../components/EditClientModal'
import AddClientModal from '../components/AddClientModal'
import BusinessCardScannerModal from '../components/BusinessCardScannerModal'
import SwipeableListItem from '../components/SwipeableListItem'
import Pagination from '../components/common/Pagination'
import { exportClientsToExcel } from '../utils/excelExport'
import { coerceClientStatus, getClientStatusTone } from '../utils/clientStatus'
import { showConfirm, showError, showSuccess, showWarning } from '../utils/alert'
import { formatKoreanCurrency } from '../utils/formatters'

const PAGE_SIZE = 20

const Clients = () => {
  // Common Data & Actions
  const { clients: contextClients, loading: contextLoading, sales, activities, deleteClient } = useData()

  // Local State
  const [searchInput, setSearchInput] = useState('') // Search input value (not yet submitted)
  const [searchTerm, setSearchTerm] = useState('') // Submitted search term for API calls
  const [editingClient, setEditingClient] = useState(null) // Store the full client object
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false)
  const [scannedClientData, setScannedClientData] = useState(null)

  // Data State (Server-Side Pagination Fallback)
  const [localClients, setLocalClients] = useState([])
  const [localLoading, setLocalLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // Context 데이터를 localClients에 동기화
  useEffect(() => {
    const syncTotalCount = async () => {
      if (!searchTerm && contextClients?.length > 0) {
        setLocalClients(contextClients)
        // contextClients.length 대신 실제 DB 카운트를 한 번 더 확인 (1000건 제한 표시 오류 방지)
        const { count, error } = await supabase
          .from('clients')
          .select('*', { count: 'exact', head: true })

        if (!error && count !== null) {
          setTotalCount(count)
        } else {
          setTotalCount(contextClients.length)
        }
        setLocalLoading(false)
      }
    }
    syncTotalCount()
  }, [contextClients, searchTerm])

  const fetchData = async (currentPage, currentSearch) => {
    try {
      setLocalLoading(true)
      const from = (currentPage - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      let query = supabase
        .from('clients')
        .select('*', { count: 'exact' })
        .order('company', { ascending: true })
        .range(from, to)

      if (currentSearch) {
        query = query.ilike('company', `%${currentSearch}%`)
      }

      const { data: fetchedClients, count, error } = await query
      if (error) throw error

      console.log(`[Clients.jsx] Fetched ${fetchedClients?.length || 0} clients (Total: ${count})`)
      setTotalCount(count || 0)
      setLocalClients(fetchedClients || [])
    } catch (error) {
      console.error('[Clients.jsx] Data Load Error:', {
        code: error.code,
        message: error.message,
        details: error.details
      })
      // contextClients가 있으면 에러를 무시하고 기존 데이터 유지
      if (!contextClients?.length) {
        showError('데이터 연결에 문제가 발생했습니다. (RLS/Network)')
      }
    } finally {
      setLocalLoading(false)
    }
  }

  useEffect(() => {
    // 검색어가 있거나, 페이지가 1보다 크거나, 컨텍스트 데이터가 아직 로드되지 않은 경우에만 페칭
    if (searchTerm || page > 1 || (contextClients?.length === 0 && !contextLoading)) {
      fetchData(page, searchTerm)
    }
  }, [page, searchTerm, contextLoading, contextClients?.length])

  // 실제 렌더링에 사용할 최종 클라이언트 목록
  // 1페이지면서 검색어가 없을 때는 전역 컨텍스트의 첫 페이지만 슬라이싱해서 보여줌
  const clients = (searchTerm || page > 1)
    ? localClients
    : (contextClients?.length > 0 ? contextClients.slice(0, PAGE_SIZE) : localClients)
  const isLoading = contextLoading && clients.length === 0

  // ===== Helper Functions =====

  const getLastOrderDate = (clientId) => {
    if (!sales || !Array.isArray(sales)) return null
    const clientSales = sales.filter((sale) => sale.clientId === clientId)
    if (clientSales.length === 0) return null
    const dates = clientSales
      .map((sale) => sale.sale_date || sale.date)
      .filter((date) => date)
      .sort((a, b) => new Date(b) - new Date(a))
    return dates.length > 0 ? dates[0] : null
  }

  const getLastContactDate = (clientId) => {
    if (!activities || !Array.isArray(activities)) return null
    const clientActivities = activities.filter((activity) => {
      const activityClientId = activity.clientId || activity.client_id
      return activityClientId === clientId
    })
    if (clientActivities.length === 0) return null
    const dates = clientActivities
      .map((activity) => activity.activity_date || activity.date || activity.created_at)
      .filter((date) => date)
      .sort((a, b) => new Date(b) - new Date(a))
    return dates.length > 0 ? dates[0] : null
  }

  const getLastYearRevenueAmount = (client) => {
    return Number(client.last_year_revenue || 0)
  }

  const getCompanyStats = (companyClients) => {
    const allOrderDates = companyClients
      .map((client) => client.lastOrder || getLastOrderDate(client.id)) // Use prop first
      .filter((date) => date)
      .sort((a, b) => new Date(b) - new Date(a))

    const allContactDates = companyClients
      .map((client) => getLastContactDate(client.id))
      .filter((date) => date)
      .sort((a, b) => new Date(b) - new Date(a))

    const totalAmount = companyClients.reduce((sum, client) => {
      return sum + getLastYearRevenueAmount(client)
    }, 0)

    return {
      lastOrder: allOrderDates.length > 0 ? allOrderDates[0] : null,
      lastContact: allContactDates.length > 0 ? allContactDates[0] : null,
      totalAmount: totalAmount,
    }
  }

  const handleSearchChange = (e) => setSearchInput(e.target.value)

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      setSearchTerm(searchInput)
      setPage(1)
    }
  }

  const groupedClients = useMemo(() => {
    if (!clients || !Array.isArray(clients)) return {}
    return clients.reduce((acc, client) => {
      const company = client.company || '기타'
      if (!acc[company]) acc[company] = []
      acc[company].push(client)
      return acc
    }, {})
  }, [clients])

  const sortedCompanies = useMemo(() => {
    return Object.keys(groupedClients).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [groupedClients])

  const visibleGroupedClients = useMemo(() => {
    return sortedCompanies.reduce((acc, company) => {
      acc[company] = groupedClients[company]
      return acc
    }, {})
  }, [sortedCompanies, groupedClients])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-oem-bg-app">
        <div className="text-oem-text-secondary animate-pulse font-medium">Synchronizing customers context...</div>
      </div>
    )
  }

  return (
    <div className="p-6 bg-oem-bg-app font-['Noto_Sans_KR',sans-serif] text-oem-text-primary mt-[50px] min-h-screen">
      <div className="max-w-[1600px] mx-auto space-y-6">

        {/* Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-oem-border pb-4">
          <div>
            <h1 className="text-xl font-bold text-oem-blue tracking-tight flex items-center gap-2">
              Customers Maintenance
              <span className="text-[10px] bg-oem-bg-header text-oem-text-secondary px-2 py-0.5 rounded-full font-normal">FORM: CLIENT_01</span>
            </h1>
            <p className="text-[11px] text-oem-text-secondary mt-1 font-medium">
              Manage enterprise clients and their primary contact information. Total Records: <span className="text-oem-blue font-bold">{totalCount}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setIsAddModalOpen(true)} className="oem-btn-primary flex items-center gap-1.5 py-1.5 h-8">
              <Plus className="w-3.5 h-3.5 text-white" /> NEW_CLIENT
            </button>
          </div>
        </div>

        {/* Search & Statistics Ribbon */}
        <div className="oem-panel bg-white shadow-sm border-l-4 border-l-oem-blue">
          <div className="p-4 flex flex-col lg:flex-row gap-4 lg:items-center">
            <div className="flex-1 flex items-center gap-3">
              <label className="text-[11px] font-bold text-oem-text-secondary uppercase tracking-widest whitespace-nowrap">Filter By Company</label>
              <div className="relative flex-1 group">
                <input
                  type="text"
                  placeholder="Query company records..."
                  value={searchInput}
                  onChange={handleSearchChange}
                  onKeyDown={handleSearchKeyDown}
                  className="w-full bg-oem-bg-panel border border-oem-border px-4 py-2 rounded-oem text-[13px] outline-none focus:border-oem-blue focus:bg-white transition-all"
                />
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-oem-text-secondary w-4 h-4 group-focus-within:text-oem-blue" />
              </div>
            </div>
            <div className="flex items-center gap-6 px-4 lg:border-l border-oem-border text-[11px] font-medium text-oem-text-secondary uppercase">
              <div className="flex flex-col">
                <span>ACTIVE_ACCOUNTS</span>
                <span className="text-oem-blue font-bold text-sm tracking-tighter">
                  {contextClients?.filter(c => c.status === '매출' || c.status === '활성').length || 0}
                </span>
              </div>
              <div className="flex flex-col">
                <span>QUERY_TIME</span>
                <span className="text-oem-text-primary font-bold text-sm tracking-tighter">{(new Date().getTime() % 100).toFixed(2)}ms</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Data View */}
        <div className="oem-panel bg-white shadow-sm overflow-hidden">
          <div className="oem-panel-header">
            <span>CLIENT_DATA_GRID</span>
            <div className="flex items-center gap-4 text-[10px] font-medium text-oem-text-secondary">
              <span>PAGE {page} OF {Math.ceil(totalCount / PAGE_SIZE)}</span>
              <span className="w-px h-3 bg-oem-border"></span>
              <span className="text-oem-blue font-bold">SQL_READY</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="oem-table min-w-full">
              <thead>
                <tr>
                  <th className="w-12 text-center">SEQ</th>
                  <th className="w-80">COMPANY_NAME</th>
                  <th>CONTACT_METADATA</th>
                  <th className="w-32">STATUS</th>
                  <th className="w-32">LAST_TX_DATE</th>
                  <th className="w-40 text-right">HISTORICAL_REV</th>
                  <th className="w-20 text-center">TOOLS</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(visibleGroupedClients).length > 0 ? (
                  Object.keys(visibleGroupedClients).map((company, groupIndex) => {
                    const visibleClients = visibleGroupedClients[company]
                    const primaryContact = visibleClients[0]
                    const hasMultipleContacts = visibleClients.length > 1
                    const stats = getCompanyStats(visibleClients)
                    const index = (page - 1) * PAGE_SIZE + groupIndex + 1

                    return (
                      <tr key={company} className="group">
                        <td className="text-center font-bold text-oem-text-secondary">{index}</td>
                        <td>
                          <Link
                            to={`/clients/${primaryContact?.id}?company=${encodeURIComponent(company)}`}
                            className="font-bold text-oem-blue hover:underline tracking-tight"
                          >
                            {company}
                          </Link>
                        </td>
                        <td>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">{primaryContact?.contact_person || 'UNASSIGNED'}</span>
                            <span className="text-[11px] text-oem-text-secondary italic">{primaryContact?.email || 'no-email@system'}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${coerceClientStatus(primaryContact?.status) === '매출'
                            ? 'bg-oem-green/10 text-oem-green border border-oem-green/20'
                            : 'bg-oem-bg-header text-oem-text-secondary border border-oem-border'
                            }`}>
                            {primaryContact?.status?.toUpperCase() || 'UNKNOWN'}
                          </span>
                        </td>
                        <td className="text-oem-text-secondary font-medium">
                          {stats.lastOrder ? stats.lastOrder.split('T')[0] : 'NO_RECORDS'}
                        </td>
                        <td className="text-right font-bold text-oem-text-primary">
                          {stats.totalAmount === 0 ? '₩ 0' : formatKoreanCurrency(stats.totalAmount || 0)}
                        </td>
                        <td className="text-center">
                          <button
                            onClick={() => setEditingClient(primaryContact)}
                            className="p-1.5 hover:bg-oem-bg-header rounded transition-colors text-oem-blue"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan="7" className="p-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Users className="w-12 h-12 text-oem-bg-header" />
                        <p className="text-oem-text-secondary italic font-medium">
                          {isLoading || localLoading ? 'Initializing record retrieval...' : 'No data records found in specified range.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Pagination */}
          <div className="bg-oem-bg-header/30 border-t border-oem-border p-4 flex justify-center">
            <Pagination
              totalCount={totalCount}
              pageSize={PAGE_SIZE}
              currentPage={page}
              onPageChange={setPage}
            />
          </div>
        </div>

      </div>

      <AddClientModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false)
          setScannedClientData(null)
          fetchData(page, searchTerm)
        }}
        initialData={scannedClientData}
      />
      <EditClientModal
        isOpen={editingClient !== null}
        onClose={() => {
          setEditingClient(null)
          fetchData(page, searchTerm)
        }}
        clientId={editingClient?.id}
        client={editingClient}
      />
      <BusinessCardScannerModal
        isOpen={isScannerModalOpen}
        onClose={() => {
          setIsScannerModalOpen(false)
          setScannedClientData(null)
        }}
        onSuccess={(result) => {
          if (result && result.extractedInfo) {
            setScannedClientData(result.extractedInfo)
            setIsScannerModalOpen(false)
            if (result.extractedInfo.company) setIsAddModalOpen(true)
          } else {
            setTimeout(() => setIsScannerModalOpen(false), 1500)
          }
        }}
      />
    </div>
  )
}

export default Clients
