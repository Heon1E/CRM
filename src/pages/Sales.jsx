import React, { useState, useEffect, useCallback } from 'react'
import { Edit, Download, Plus, Trash2, Search, RefreshCw, FileText } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { supabase, supabaseConfigError } from '../lib/supabase'
import AddSaleModal from '../components/AddSaleModal'
import EditSaleModal from '../components/EditSaleModal'
import Pagination from '../components/common/Pagination'
import { exportSalesToExcel } from '../utils/excelExport'
import { showError, showConfirm, showSuccess } from '../utils/alert'
import { formatKoreanCurrency } from '../utils/formatters'

const PAGE_SIZE = 20

const Sales = () => {
  const {
    clients,
    deleteSale,
    processGroupedSales
  } = useData()

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingSale, setEditingSale] = useState(null)

  // Local State (Pagination & Search)
  // Decoupled from global contextSales to improve performance with large datasets
  const [localSales, setLocalSales] = useState([])
  const [localLoading, setLocalLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  // 데이터 페칭 함수 (Strict Server-Side)
  // This function is the single source of truth for the Sales Grid.
  // It completely ignores the global 'sales' context to avoid memory issues with 12k records.
  const fetchData = useCallback(async () => {
    try {
      setLocalLoading(true)
      const from = (page - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      // 1. Fetch Paged Data
      let query = searchTerm
        ? supabase.from('sales').select('*, clients!inner(company)', { count: 'exact' })
        : supabase.from('sales').select('*', { count: 'exact' })

      // Strict Oracle-like sorting: Date Desc, then CreatedAt Desc
      query = query.order('sale_date', { ascending: false }).order('created_at', { ascending: false }).range(from, to)

      if (searchTerm) {
        query = query.ilike('clients.company', `%${searchTerm}%`)
      }

      const { data, error, count } = await query
      if (error) throw error

      setTotalCount(count || 0)

      if (!data || data.length === 0) {
        setLocalSales([])
      } else {
        // 데이터 정규화 및 클라이언트 정보 매핑
        // We map 'clients' from global context just for names, which is lightweight compared to 'sales'
        const mappedSales = data.map(sale => {
          const clientCompany = sale.clients?.company || clients.find(c => c.id === (sale.client_id || sale.clientId))?.company || '알 수 없음'
          return {
            ...sale,
            clientName: clientCompany,
          }
        })
        const groupedSales = processGroupedSales(mappedSales)
        setLocalSales(groupedSales)
      }

    } catch (error) {
      console.error('매출 데이터 로드 오류:', error)
      // 환경변수가 빠지면 조회가 전부 실패한다. 그 경우 원인을 그대로 알려준다.
      showError(supabaseConfigError
        ? `서버 연결 설정이 누락되었습니다 (${supabaseConfigError}). 배포 환경변수를 확인해 주세요.`
        : '매출 데이터를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLocalLoading(false)
    }
  }, [page, searchTerm, clients, processGroupedSales])

  // Initial & Search/Page Change Load
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 단축키 — 데스크톱 업무 프로그램처럼 손이 키보드에 머무르게 한다
  useEffect(() => {
    const onKey = (e) => {
      // 입력 중에는 F키만 받는다 (글자 입력을 방해하지 않기 위해)
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)

      if (e.key === 'F2') { e.preventDefault(); setIsAddModalOpen(true) }
      else if (e.key === 'F5') { e.preventDefault(); fetchData() }
      else if (e.key === 'Escape' && !typing) { setEditingSale(null); setIsAddModalOpen(false) }
      else if (e.key === 'F4') {
        e.preventDefault()
        setLocalSales(prev => { if (prev.length) setEditingSale(prev[0]); return prev })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fetchData])


  const handleSearchChange = (e) => {
    setSearchInput(e.target.value)
  }

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      setSearchTerm(searchInput)
      setPage(1)
    }
  }

  const handleRefresh = () => {
    fetchData()
  }

  const handleEdit = (sale) => {
    setEditingSale(sale)
  }

  const handleDelete = async (sale) => {
    const confirmed = await showConfirm(
      '이 매출 내역이 영구적으로 삭제됩니다.',
      '정말 삭제하시겠습니까? (연결된 제품 정보는 유지됩니다)',
      '삭제',
      '취소'
    )

    if (confirmed) {
      try {
        await deleteSale(sale.id)
        await showSuccess('매출 내역이 삭제되었습니다.')
        fetchData()
      } catch (error) {
        console.error('매출 삭제 오류:', error)
        await showError('삭제 중 오류가 발생했습니다.')
      }
    }
  }

  // 선택된 행 (키보드 이동용)
  const selectedId = editingSale?.id || null
  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1
  const pageSum = localSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0)
  // 한 행은 '같은 거래처·같은 날짜'의 매출을 묶은 것이라, 행 수와 원본 건수가 다르다.
  const rawCount = localSales.reduce((n, s) => n + (s.items?.length || 1), 0)

  return (
    <div className="min-h-screen bg-oem-bg-app p-2 md:p-4 mt-[56px]">
      <div className="max-w-[1600px] mx-auto">
        <div className="win flex flex-col">

          {/* 타이틀바 */}
          <div className="win-title">
            <span className="flex items-baseline gap-3">
              매출 관리
              <span className="meta">SALES · 전체 {totalCount.toLocaleString()}건 · {page}/{totalPages}</span>
            </span>
          </div>

          {/* 툴바 */}
          <div className="toolbar">
            <button className="tb-btn primary" onClick={() => setIsAddModalOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> 신규 <kbd>F2</kbd>
            </button>
            <button className="tb-btn" disabled={!localSales.length}
              onClick={() => handleEdit(localSales[0])}>
              <Edit className="w-3.5 h-3.5" /> 수정 <kbd>F4</kbd>
            </button>
            <span className="tb-sep" />
            <button className="tb-btn" onClick={handleRefresh}>
              <RefreshCw className={`w-3.5 h-3.5 ${localLoading ? 'animate-spin' : ''}`} /> 새로고침 <kbd>F5</kbd>
            </button>
            <span className="tb-sep" />
            <button className="tb-btn" onClick={() => exportSalesToExcel(localSales)}>
              <Download className="w-3.5 h-3.5" /> 엑셀 내리기
            </button>
          </div>

          {/* 조회 조건 */}
          <div className="filterbar">
            <label htmlFor="sales-q">거래처</label>
            <input
              id="sales-q"
              type="text"
              placeholder="거래처명"
              value={searchInput}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              style={{ width: '180px' }}
            />
            <button className="tb-btn" onClick={() => { setSearchTerm(searchInput); setPage(1) }}>
              <Search className="w-3.5 h-3.5" /> 조회 <kbd>Enter</kbd>
            </button>
            {searchTerm && (
              <button className="tb-btn" onClick={() => { setSearchInput(''); setSearchTerm(''); setPage(1) }}>
                해제
              </button>
            )}
            <span className="flex-1" />
            <span>조회 합계 <b style={{ fontFamily: 'var(--font-data)', fontSize: '14px', color: 'var(--text-primary)' }}>
              {formatKoreanCurrency(pageSum)}</b></span>
          </div>

          {/* 데이터 그리드 — 폰에서도 같은 화면을 쓰고, 좁으면 가로로 민다 */}
          <div className="grid-scroll flex-1" style={{ minHeight: '320px' }}>
            <table className="dgrid">
              <thead>
                <tr>
                  <th style={{ width: '48px' }}>번호</th>
                  <th style={{ width: '96px' }}>날짜</th>
                  <th style={{ width: '190px' }}>거래처</th>
                  <th>품목</th>
                  <th style={{ width: '60px' }}>수량</th>
                  <th style={{ width: '104px' }}>금액</th>
                  <th style={{ width: '86px' }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {localLoading ? (
                  [...Array(10)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan="7" style={{ color: 'var(--text-muted)' }}>
                        {i === 0 ? '불러오는 중...' : ' '}
                      </td>
                    </tr>
                  ))
                ) : localSales.length > 0 ? (
                  localSales.map((sale, index) => {
                    const qty = sale.items?.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0) || 0
                    return (
                      <tr
                        key={sale.id}
                        className={selectedId === sale.id ? 'is-selected' : ''}
                        onDoubleClick={() => handleEdit(sale)}
                      >
                        <td className="seq">{index + 1}</td>
                        <td className="dt">{sale.date ? sale.date.split('T')[0] : '-'}</td>
                        <td style={{ fontWeight: 600 }}>{sale.clientName}</td>
                        <td style={{ maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis' }}
                          title={sale.displayItemName || ''}>
                          {sale.displayItemName || '품목 미지정'}
                          {sale.notes && <span style={{ color: 'var(--text-muted)' }}> · {sale.notes}</span>}
                        </td>
                        <td className="num">{qty.toLocaleString()}</td>
                        <td className="num">{(sale.totalAmount || 0).toLocaleString()}</td>
                        <td style={{ textAlign: 'center' }}>
                          <button className="rowbtn" onClick={() => handleEdit(sale)}>수정</button>
                          <button className="rowbtn danger" onClick={() => handleDelete(sale)}>삭제</button>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                      <FileText className="w-6 h-6 mx-auto mb-1" style={{ opacity: .4 }} />
                      매출 내역이 없습니다
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 편집 영역 — 목록을 가리지 않고 화면에 붙는다 */}
          <AddSaleModal
            docked
            isOpen={isAddModalOpen}
            onClose={() => { setIsAddModalOpen(false); fetchData() }}
          />
          <EditSaleModal
            docked
            isOpen={editingSale !== null}
            onClose={() => { setEditingSale(null); fetchData() }}
            saleGroup={editingSale}
          />

          {/* 페이지 이동 */}
          <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
            <Pagination
              totalCount={totalCount}
              pageSize={PAGE_SIZE}
              currentPage={page}
              onPageChange={setPage}
            />
          </div>

          {/* 상태줄 */}
          <div className="statusbar">
            <span><span className="dot" style={{ background: localLoading ? 'var(--warning)' : 'var(--success)' }} />
              {localLoading ? '조회 중' : '준비됨'}</span>
            <span>표시 {localSales.length}행 (매출 {rawCount}건) / 전체 {totalCount.toLocaleString()}건</span>
            {searchTerm && <span>필터: {searchTerm}</span>}
            <span className="flex-1" />
            <span className="hint"><kbd>F2</kbd> 신규 · <kbd>F5</kbd> 새로고침 · <kbd>Esc</kbd> 닫기 · 행 더블클릭으로 수정</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Sales
