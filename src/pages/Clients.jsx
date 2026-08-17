import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Search, Edit, Download, Users, Camera, Trash2, Plus } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { resolveSalesRep } from '../utils/salesRep'
import {
  FILTERS, filterCompanies, loadViews, saveViews, addView, removeView, describe,
} from '../utils/clientFilters'
import { supabase } from '../lib/supabase'
import EditClientModal from '../components/EditClientModal'
import AddClientModal from '../components/AddClientModal'
import BusinessCardScannerModal from '../components/BusinessCardScannerModal'
import SwipeableListItem from '../components/SwipeableListItem'
import ClientDetailPanel from '../components/ClientDetailPanel'
import Pagination from '../components/common/Pagination'
import { exportClientsToExcel } from '../utils/excelExport'
import { coerceClientStatus, getClientStatusTone } from '../utils/clientStatus'
import { showConfirm, showError, showSuccess, showWarning } from '../utils/alert'
import { formatKoreanCurrency } from '../utils/formatters'

const PAGE_SIZE = 20

const Clients = () => {
  // Common Data & Actions
  const { clients: contextClients, loading: contextLoading, sales, activities, deleteClient } = useData()
  const { user, salesRep: authSalesRep } = useAuth()
  const myRep = useMemo(() => authSalesRep || resolveSalesRep(user), [user, authSalesRep])

  // Local State
  const [searchInput, setSearchInput] = useState('') // Search input value (not yet submitted)
  const [searchTerm, setSearchTerm] = useState('') // Submitted search term for API calls
  const [selectedClientId, setSelectedClientId] = useState(null) // Split View Select
  const [editingClient, setEditingClient] = useState(null) // Store the full client object
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false)
  const [scannedClientData, setScannedClientData] = useState(null)

  // Data State (Server-Side Pagination Fallback)
  const [localClients, setLocalClients] = useState([])
  const [localLoading, setLocalLoading] = useState(false)
  const [page, setPage] = useState(1)
  // 거래처가 1,150곳인데 검색창 하나뿐이었다. 자주 쓰는 조건을 단추로 둔다.
  const [activeFilters, setActiveFilters] = useState([])
  const [views, setViews] = useState(() => loadViews())
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

  /*
   * **전체를 놓고 정렬한 뒤에 쪽을 나눈다.**
   *
   * 예전에는 `contextClients.slice(0, PAGE_SIZE)` — 가나다순 앞 20줄만 잘라서
   * 넘겼다. 그래서 아래의 '챙겨야 할 순서' 정렬도, 저장된 보기 필터도
   * **그 20줄 안에서만** 돌았다. 화면에는 결국 가나다순이 나왔다.
   * (실측: 이헌일 담당이 81곳인데 첫 쪽이 전부 담당 미지정이었다.)
   *
   * DataContext가 1,150곳을 이미 들고 있으므로 서버를 다시 부를 이유도 없다.
   * 검색도 여기서 거른다 — 서버 왕복이 사라진다.
   * 컨텍스트가 비었을 때만(오프라인·RLS 문제) 예전 조회로 떨어진다.
   */
  const clients = useMemo(() => {
    const all = (contextClients?.length > 0) ? contextClients : localClients
    if (!searchTerm) return all
    const q = searchTerm.trim().toLowerCase()
    return all.filter((c) => String(c.company || '').toLowerCase().includes(q))
  }, [contextClients, localClients, searchTerm])
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

  /**
   * 기본 정렬 — 챙겨야 할 순서대로 세운다.
   *
   *   1군  내 담당이면서 매출이 있는 곳   -> 매출 많은 순
   *   2군  영업 중인 곳 (활동이 있는 곳)  -> 활동 많은 순, 같으면 최근 접촉순
   *   3군  나머지                        -> 매출 많은 순
   *
   * 예전에는 가나다순이라 1,100곳 중 지금 챙길 곳을 찾으려면 검색을 해야 했다.
   */
  const companyRank = useMemo(() => {
    const revenue = new Map()
    ;(sales || []).forEach((s) => {
      if (!s.client_id) return
      revenue.set(s.client_id, (revenue.get(s.client_id) || 0) + (Number(s.total_amount ?? s.totalAmount ?? 0) || 0))
    })

    const actCount = new Map()
    const lastAct = new Map()
    ;(activities || []).forEach((a) => {
      const id = a.client_id || a.clientId
      if (!id) return
      actCount.set(id, (actCount.get(id) || 0) + 1)
      const ms = new Date(a.activity_date || a.date).getTime()
      if (Number.isFinite(ms) && ms > (lastAct.get(id) || 0)) lastAct.set(id, ms)
    })

    // 회사명 하나에 여러 행이 묶여 있을 수 있으므로 합산한다
    // 마지막 '거래'일 — 마지막 '접촉'(last)과 다르다. 휴면 판정은 거래 기준이다.
    const lastSaleAt = new Map()
    ;(sales || []).forEach((s2) => {
      const id = s2.client_id
      if (!id) return
      const ms = new Date(s2.sale_date || s2.date || s2.created_at).getTime()
      if (Number.isFinite(ms) && ms > (lastSaleAt.get(id) || 0)) lastSaleAt.set(id, ms)
    })

    const byCompany = new Map()
    Object.entries(groupedClients).forEach(([company, rows]) => {
      let rev = 0, acts = 0, last = 0, lastSale = 0, mine = false, hasContact = false
      rows.forEach((c) => {
        rev += revenue.get(c.id) || 0
        acts += actCount.get(c.id) || 0
        last = Math.max(last, lastAct.get(c.id) || 0)
        lastSale = Math.max(lastSale, lastSaleAt.get(c.id) || 0)
        if (myRep && c.sales_rep === myRep) mine = true
        if (c.contact_person || c.phone) hasContact = true
      })
      const tier = (mine && rev > 0) ? 0 : (acts > 0 ? 1 : 2)
      byCompany.set(company, { tier, rev, acts, last, lastSale: lastSale || null, mine, hasContact })
    })
    return byCompany
  }, [groupedClients, sales, activities, myRep])

  const sortedCompanies = useMemo(() => {
    return Object.keys(groupedClients).sort((a, b) => {
      const x = companyRank.get(a), y = companyRank.get(b)
      if (!x || !y) return a.localeCompare(b, 'ko')
      if (x.tier !== y.tier) return x.tier - y.tier
      if (x.tier === 1) {
        if (y.acts !== x.acts) return y.acts - x.acts
        if (y.last !== x.last) return y.last - x.last
        return a.localeCompare(b, 'ko')
      }
      if (y.rev !== x.rev) return y.rev - x.rev
      return a.localeCompare(b, 'ko')
    })
  }, [groupedClients, companyRank])

  // 조건에 맞는 회사만 남긴다. 정렬(챙길 순서)은 그대로 유지된다.
  const shownCompanies = useMemo(
    () => filterCompanies(sortedCompanies, companyRank, activeFilters),
    [sortedCompanies, companyRank, activeFilters])

  // 정렬·필터가 끝난 다음에 자른다. 순서가 살아 있어야 첫 쪽이 '챙길 곳'이 된다.
  // 걸러진 결과가 바뀌면 첫 쪽으로 — 3쪽을 보다가 조건을 좁히면 빈 쪽이 남는다
  useEffect(() => { setPage(1) }, [activeFilters, searchTerm])

  const pagedCompanies = useMemo(
    () => shownCompanies.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [shownCompanies, page])

  const visibleGroupedClients = useMemo(() => {
    return pagedCompanies.reduce((acc, company) => {
      acc[company] = groupedClients[company]
      return acc
    }, {})
  }, [pagedCompanies, groupedClients])

  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState(new Set())

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allIds = Object.keys(visibleGroupedClients).map(company => visibleGroupedClients[company][0].id)
      setSelectedIds(new Set(allIds))
    } else {
      setSelectedIds(new Set())
    }
  }

  const handleSelectOne = (id, e) => {
    e.stopPropagation()
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    const confirmed = await showConfirm(
      `${selectedIds.size}개 항목을 삭제하시겠습니까?`,
      '삭제된 데이터는 복구할 수 없습니다.'
    )
    if (confirmed) {
      try {
        setLocalLoading(true)
        // Simulate bulk delete (Supabase doesn't support array delete directly easily without function, so loops for now or 'in' filter)
        // Using 'in' filter is better
        const { error } = await supabase
          .from('clients')
          .delete()
          .in('id', Array.from(selectedIds))

        if (error) throw error

        showSuccess(`${selectedIds.size}개 항목이 삭제되었습니다.`)
        setSelectedIds(new Set())
        fetchData(page, searchTerm)
      } catch (e) {
        console.error(e)
        showError('일괄 삭제 중 오류가 발생했습니다.')
      } finally {
        setLocalLoading(false)
      }
    }
  }

  // Helper to check if all visible are selected
  const isAllSelected = useMemo(() => {
    const visibleIds = Object.keys(visibleGroupedClients).map(company => visibleGroupedClients[company][0].id)
    return visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id))
  }, [visibleGroupedClients, selectedIds])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-oem-bg-app">
        <div className="text-oem-text-secondary animate-pulse font-medium">Synchronizing customers context...</div>
      </div>
    )
  }

  return (
    <div className="p-3 md:p-6 bg-oem-bg-app font-['Noto_Sans_KR',sans-serif] text-oem-text-primary mt-[50px] min-h-screen relative">
      {/* Bulk Action Bar (Floating Bottom) */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-10 fade-in duration-300">
          <span className="font-bold">{selectedIds.size} selected</span>
          <div className="h-4 w-px bg-slate-700"></div>
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-2 text-red-400 hover:text-red-300 font-bold text-sm transition-colors"
          >
            <Trash2 className="w-4 h-4" /> 선택 삭제
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-slate-500 hover:text-white text-xs ml-2"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="max-w-[1600px] mx-auto space-y-6">

        {/* 타이틀바 */}
        <div className="win-title" style={{ border: '1px solid var(--border)', borderBottom: 0 }}>
          <span className="flex items-baseline gap-3">
            거래처 관리
            <span className="meta">거래처 {sortedCompanies.length.toLocaleString()}곳</span>
          </span>
        </div>

        {/* 툴바 */}
        <div className="toolbar" style={{ border: '1px solid var(--border)', borderTop: 0 }}>
          <button onClick={() => setIsAddModalOpen(true)} className="tb-btn primary">
            <Plus className="w-3.5 h-3.5" /> 신규 <kbd>F2</kbd>
          </button>
        </div>

        {/* Search & Statistics Ribbon */}
        <div className="oem-panel shadow-sm" style={{ borderLeft: '4px solid var(--accent)' }}>
          <div className="p-4 flex flex-col lg:flex-row gap-4 lg:items-center">
            <div className="flex-1 flex items-center gap-3">
              <label className="text-[11px] font-bold text-oem-text-secondary whitespace-nowrap">거래처 찾기</label>
              <div className="relative flex-1 group">
                <input
                  type="text"
                  placeholder="회사명으로 찾기"
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
                <span>거래 중인 거래처</span>
                <span className="text-oem-blue font-bold text-sm tracking-tighter">
                  {contextClients?.filter(c => c.status === '매출' || c.status === '활성').length || 0}
                </span>
              </div>
              <div className="flex flex-col">
                <span>지금 보이는 곳</span>
                <span className="text-oem-text-primary font-bold text-sm tracking-tighter">{shownCompanies.length}곳</span>
              </div>
            </div>
          </div>
        </div>

        {/* 조건 거르기 + 저장된 보기 */}
        <div className="win" style={{ marginTop: 8 }}>
          <div className="toolbar" style={{ flexWrap: 'wrap', gap: 6 }}>
            {FILTERS.map((f) => {
              const on = activeFilters.includes(f.key)
              return (
                <button
                  key={f.key}
                  title={f.hint}
                  className={`tb-btn${on ? ' primary' : ''}`}
                  onClick={() => setActiveFilters((prev) =>
                    prev.includes(f.key) ? prev.filter((k) => k !== f.key) : [...prev, f.key])}
                >
                  {f.label}
                </button>
              )
            })}
            {activeFilters.length > 0 && (
              <button className="tb-btn" onClick={() => setActiveFilters([])}>조건 지우기</button>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>
              {shownCompanies.length}곳 / 전체 {sortedCompanies.length}곳
            </span>
          </div>

          <div className="toolbar" style={{ flexWrap: 'wrap', gap: 6, borderTop: 0 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>저장한 보기</span>
            {views.length === 0 && (
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                자주 쓰는 조건을 저장해 두면 한 번에 불러옵니다.
              </span>
            )}
            {views.map((v) => (
              <span key={v.name} style={{ display: 'inline-flex' }}>
                <button className="tb-btn" title={describe(v.filters)}
                  onClick={() => { setActiveFilters(v.filters || []); setSearchInput(v.search || ''); setSearchTerm(v.search || '') }}>
                  {v.name}
                </button>
                <button className="rowbtn" title="이 보기를 지웁니다"
                  onClick={() => { const next = removeView(views, v.name); setViews(next); saveViews(next) }}>×</button>
              </span>
            ))}
            <button className="tb-btn" style={{ marginLeft: 'auto' }}
              onClick={() => {
                const name = window.prompt('이 조건에 이름을 붙여 저장합니다.', describe(activeFilters))
                if (!name) return
                const next = addView(views, name, activeFilters, searchInput)
                setViews(next); saveViews(next)
              }}>
              지금 조건 저장
            </button>
          </div>
        </div>

        {/* Main Data View */}
        <div className="oem-panel bg-white shadow-sm overflow-hidden">
          <div className="oem-panel-header">
            <span>거래처 목록</span>
            <div className="flex items-center gap-4 text-[10px] font-medium text-oem-text-secondary">
              <span>{page} / {Math.max(1, Math.ceil(shownCompanies.length / PAGE_SIZE))} 쪽</span>
              <span className="w-px h-3 bg-oem-border"></span>
              <span className="text-oem-blue font-bold">준비됨</span>
            </div>
          </div>

          {/* 폰에서도 PC와 같은 표를 쓴다 (사용자 요청) — 카드 뷰는 숨긴다 */}
          <div className="hidden">
            {Object.keys(visibleGroupedClients).length > 0 ? (
              Object.keys(visibleGroupedClients).map((company) => {
                const visibleClients = visibleGroupedClients[company]
                const primaryContact = visibleClients[0]
                const stats = getCompanyStats(visibleClients)

                return (
                  <SwipeableListItem
                    key={company}
                    onEdit={() => setEditingClient(primaryContact)}
                    onDelete={async () => {
                      const confirmed = await showConfirm('삭제하시겠습니까?', '이 작업은 되돌릴 수 없습니다.')
                      if (confirmed) {
                        try {
                          await deleteClient(primaryContact.id)
                          showSuccess('삭제되었습니다.')
                        } catch (e) {
                          console.error(e)
                          showError('삭제 실패')
                        }
                      }
                    }}
                  >
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-oem-border active:bg-slate-50 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <Link
                            to={`/clients/${primaryContact?.id}?company=${encodeURIComponent(company)}`}
                            className="text-base font-bold text-oem-text-primary hover:text-oem-blue"
                          >
                            {company}
                          </Link>
                          <p className="text-xs text-oem-text-secondary mt-0.5">
                            {primaryContact?.contact_person || '담당자 없음'}
                          </p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${coerceClientStatus(primaryContact?.status) === '매출'
                          ? 'bg-oem-green/10 text-oem-green border border-oem-green/20'
                          : 'bg-oem-bg-header text-oem-text-secondary border border-oem-border'
                          }`}>
                          {primaryContact?.status || 'Unknown'}
                        </span>
                      </div>

                      <div className="flex justify-between items-end pt-2 border-t border-oem-border/50 mt-2">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-oem-text-secondary uppercase tracking-wider">최근 거래</span>
                          <span className="text-xs font-medium text-oem-text-primary">
                            {stats.lastOrder ? stats.lastOrder.split('T')[0] : '기록 없음'}
                          </span>
                        </div>
                        <div className="flex flex-col text-right">
                          <span className="text-[10px] font-bold text-oem-text-secondary uppercase tracking-wider">총 매출 (작년)</span>
                          <span className="text-sm font-bold text-oem-blue">
                            {formatKoreanCurrency(stats.totalAmount || 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </SwipeableListItem>
                )
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-oem-text-secondary">
                <Users className="w-12 h-12 mb-2 opacity-20" />
                <p className="text-xs">데이터가 없습니다.</p>
              </div>
            )}
          </div>

          {/* 목록 — 폰/PC 동일 */}
          <div className="flex gap-6 h-[calc(100vh-200px)]">
            {/* Left List Pane */}
            <div className={`${selectedClientId ? 'w-1/2' : 'w-full'} transition-all duration-300 flex flex-col`}>
              <div className="flex-1 overflow-y-auto border border-oem-border rounded-lg bg-white">
                <table className="dgrid min-w-full relative">
                  <thead className="sticky top-0 z-10 bg-oem-bg-header shadow-sm">
                    <tr>
                      <th className="w-8 py-2 text-center">
                        {/* 라벨로 감싸 누르는 자리를 넓힌다 — 체크박스는 padding을 무시한다 */}
                        <label className="tap-box" aria-label="전체 고르기">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300"
                            checked={isAllSelected}
                            onChange={handleSelectAll}
                          />
                        </label>
                      </th>
                      <th className="w-12 text-center py-2">번호</th>
                      <th className="w-80 py-2">회사명</th>
                      {!selectedClientId && <th className="py-2 ">담당자</th>}
                      <th className="w-24 py-2 text-center">상태</th>
                      {!selectedClientId && <th className="w-32 py-2 ">최종거래</th>}
                      <th className="w-32 text-right py-2 pr-4 ">누적매출</th>
                      <th className="w-20 text-center py-2">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-oem-border text-xs">
                    {Object.keys(visibleGroupedClients).length > 0 ? (
                      Object.keys(visibleGroupedClients).map((company, groupIndex) => {
                        const visibleClients = visibleGroupedClients[company]
                        const primaryContact = visibleClients[0]
                        const stats = getCompanyStats(visibleClients)
                        const index = (page - 1) * PAGE_SIZE + groupIndex + 1
                        const isSelected = selectedClientId === primaryContact.id
                        const isChecked = selectedIds.has(primaryContact.id)

                        return (
                          <tr
                            key={company}
                            className={`group cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border-l-4 border-l-oem-blue' : 'hover:bg-slate-50 border-l-4 border-l-transparent'}`}
                            onClick={() => setSelectedClientId(primaryContact.id)}
                          >
                            <td className="text-center py-3" onClick={(e) => e.stopPropagation()}>
                              <label className="tap-box" aria-label={`${company} 고르기`}>
                                <input
                                  type="checkbox"
                                  className="rounded border-gray-300"
                                  checked={isChecked}
                                  onChange={(e) => handleSelectOne(primaryContact.id, e)}
                                />
                              </label>
                            </td>
                            <td className="text-center font-bold text-oem-text-secondary py-3">{index}</td>
                            <td className="py-3">
                              <span className={`font-bold ${isSelected ? 'text-oem-blue' : 'text-oem-text-primary'}`}>
                                {company}
                              </span>
                              {selectedClientId && (
                                <p className="text-[10px] text-oem-text-secondary truncate">{primaryContact?.contact_person}</p>
                              )}
                            </td>
                            {!selectedClientId && (
                              <td className="py-3 ">
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-medium">{primaryContact?.contact_person || '담당자 없음'}</span>
                                  <span className="text-[10px] text-oem-text-secondary italic">{primaryContact?.email || '-'}</span>
                                </div>
                              </td>
                            )}
                            <td className="text-center py-3">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${coerceClientStatus(primaryContact?.status) === '매출'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-slate-100 text-slate-600'
                                }`}>
                                {primaryContact?.status?.toUpperCase() || 'UNKNOWN'}
                              </span>
                            </td>
                            {!selectedClientId && (
                              <td className="text-oem-text-secondary font-medium py-3 ">
                                {stats.lastOrder ? stats.lastOrder.split('T')[0] : 'NO_RECORDS'}
                              </td>
                            )}
                            {!selectedClientId && (
                              <td className="text-right font-bold text-oem-text-primary py-3 pr-4 ">
                                {stats.totalAmount === 0 ? '-' : formatKoreanCurrency(stats.totalAmount)}
                              </td>
                            )}
                            <td className="text-center py-3" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => setEditingClient(primaryContact)}
                                className="p-1.5 hover:bg-blue-50 rounded-md transition-colors group/btn"
                                title="Edit Client"
                              >
                                <Edit className="w-4 h-4 text-slate-500 group-hover/btn:text-blue-600" />
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td colSpan="7" className="p-12 text-center text-slate-500">
                          No Data
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {/* Pagination (Compact Mode when split) */}
              <div className="mt-2 flex justify-center">
                <Pagination
                  totalCount={shownCompanies.length}
                  pageSize={PAGE_SIZE}
                  currentPage={page}
                  onPageChange={setPage}
                />
              </div>
            </div>

            {/* Right Detail Pane (Split View) */}
            {selectedClientId && (
              <div className="w-1/2 flex flex-col bg-white border border-oem-border rounded-lg shadow-lg overflow-hidden relative animate-in slide-in-from-right-10 duration-300">
                <div className="absolute top-2 right-2 z-10">
                  <button onClick={() => setSelectedClientId(null)} className="p-1 hover:bg-slate-100 rounded-full text-slate-500">
                    X
                  </button>
                </div>
                <ClientDetailPanel
                  clientId={selectedClientId}
                  isEmbedded={true}
                  onClose={() => setSelectedClientId(null)}
                />
              </div>
            )}
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
      <div className="statusbar" style={{ border: '1px solid var(--border)' }}>
        <span><span className="dot" style={{ background: localLoading ? 'var(--warning)' : 'var(--success)' }} />
          {localLoading ? '조회 중' : '준비됨'}</span>
        <span>표시 {clients.length}개 / 전체 {totalCount.toLocaleString()}개</span>
        {searchTerm && <span>필터: {searchTerm}</span>}
        <span className="flex-1" />
        <span className="hint"><kbd>F2</kbd> 신규 · <kbd>Enter</kbd> 조회</span>
      </div>

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
