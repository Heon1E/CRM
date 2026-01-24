import React, { useState, useEffect, useRef } from 'react'
import { Edit, Download, Plus, Trash2, Search } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { supabase } from '../lib/supabase'
import AddSaleModal from '../components/AddSaleModal'
import EditSaleModal from '../components/EditSaleModal'
import SalesExcelUpload from '../components/SalesExcelUpload'
import SwipeableListItem from '../components/SwipeableListItem'
import Pagination from '../components/common/Pagination'
import { exportSalesToExcel } from '../utils/excelExport'
import { showError, showConfirm, showSuccess } from '../utils/alert'
import { formatKoreanCurrency } from '../utils/formatters'

const PAGE_SIZE = 20

const Sales = () => {
  const {
    clients,
    sales: contextSales,
    loading: contextLoading,
    deleteSale,
    processGroupedSales,
    registerMissingProductsFromSales
  } = useData()
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingSale, setEditingSale] = useState(null)

  // Local State (Pagination & Search)
  const [localSales, setLocalSales] = useState([])
  const [localLoading, setLocalLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [searchInput, setSearchInput] = useState('') // Search input value (not yet submitted)
  const [searchTerm, setSearchTerm] = useState('') // Submitted search term for API calls

  // Context 데이터를 localSales에 동기화
  useEffect(() => {
    const syncTotalCount = async () => {
      if (!searchTerm && contextSales?.length > 0) {
        setLocalSales(contextSales)
        // 실제 DB 카운트를 한 번 더 확인 (1000건 제한 표시 오류 방지)
        const { count, error } = await supabase
          .from('sales')
          .select('*', { count: 'exact', head: true })

        if (!error && count !== null) {
          setTotalCount(count)
        } else {
          setTotalCount(contextSales.length)
        }
        setLocalLoading(false)
      }
    }
    syncTotalCount()
  }, [contextSales, searchTerm])

  // 데이터 페칭 함수 (Server-Side Pagination & Search)
  const fetchData = async () => {
    try {
      setLocalLoading(true)
      const from = (page - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      // 기본 쿼리: sales 테이블 조회
      // 조인 쿼리(!inner)는 검색 시에만 사용하거나, 검색어가 없을 때는 단순 쿼리로 수행하여 안정성 확보
      let query = searchTerm
        ? supabase.from('sales').select('*, clients!inner(company)', { count: 'exact' })
        : supabase.from('sales').select('*', { count: 'exact' })

      query = query.order('sale_date', { ascending: false }).range(from, to)

      if (searchTerm) {
        query = query.ilike('clients.company', `%${searchTerm}%`)
      }

      const { data, error, count } = await query
      if (error) throw error

      setTotalCount(count || 0)

      if (!data || data.length === 0) {
        setLocalSales([])
        return
      }

      // 데이터 정규화 및 클라이언트 정보 매핑
      const mappedSales = data.map(sale => {
        const clientCompany = sale.clients?.company || clients.find(c => c.id === (sale.client_id || sale.clientId))?.company || '알 수 없음'
        return {
          ...sale,
          clientName: clientCompany,
        }
      })

      // 그룹화 적용 (일관성 유지)
      const groupedSales = processGroupedSales(mappedSales)
      setLocalSales(groupedSales)
    } catch (error) {
      console.error('매출 데이터 로드 오류:', error)
      if (!contextSales?.length) {
        showError('매출 데이터를 연결할 수 없습니다.')
      }
    } finally {
      setLocalLoading(false)
    }
  }

  // 페이지나 검색어 변경 시 데이터 다시 로드
  useEffect(() => {
    // 검색어가 있거나, 페이지가 1보다 크거나, 컨텍스트가 로드되지 않은 경우에만 로컬 페칭
    if (searchTerm || page > 1 || (contextSales?.length === 0 && !contextLoading)) {
      fetchData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchTerm, contextLoading, contextSales?.length])

  // 실제 렌더링에 사용할 최종 데이터
  // 1페이지면서 검색어가 없을 때는 전역 컨텍스트의 첫 페지만 슬라이싱해서 보여줌
  const sales = (searchTerm || page > 1)
    ? localSales
    : (contextSales?.length > 0 ? contextSales.slice(0, PAGE_SIZE) : localSales)
  const isLoading = contextLoading && sales.length === 0

  // 검색어 변경 시 즉시 입력값 업데이트
  const handleSearchChange = (e) => {
    setSearchInput(e.target.value)
  }

  // Handle Enter key press to trigger search
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      setSearchTerm(searchInput)
      setPage(1) // Reset to page 1 when search term changes
    }
  }

  const handleExport = () => {
    // 엑셀 내보내기도 현재 검색 조건에 맞춰서 전체 다운로드 필요
    // exportSalesToExcel 함수가 데이터를 인자로 받으므로, 
    // 여기서는 화면에 보이는 것만 내보낼지, 전체를 다시 조회할지 결정해야 함.
    // 기존 로직: 화면에 있는 sales state를 보냄 -> 15건만 나감 (문제)
    // 수정 로직: 전체 데이터를 다시 조회해서 내보내기

    // 비동기 처리 필요하지만, exportSalesToExcel이 동기적이라면...
    // 간단히 전체 데이터 fetch 로직을 내장
    const exportData = async () => {
      try {
        setLoading(true)
        let query = supabase
          .from('sales')
          .select('*, clients!inner(company)')
          .order('sale_date', { ascending: false })

        if (searchTerm) {
          query = query.ilike('clients.company', `%${searchTerm}%`)
        }

        const { data, error } = await query
        if (error) throw error

        // 데이터 정규화
        const formattedData = (data || []).map(sale => ({
          ...sale,
          date: sale.sale_date,
          clientName: sale.clients?.company || '알 수 없음',
          totalAmount: sale.total_amount
        }))

        exportSalesToExcel(formattedData)
        showSuccess('엑셀 다운로드가 완료되었습니다.')
      } catch (e) {
        console.error('Export Error', e)
        showError('엑셀 다운로드 중 오류가 발생했습니다.')
      } finally {
        setLocalLoading(false)
      }
    }

    exportData()
  }

  const handleEdit = (sale) => {
    // 이제 sale은 이미 그룹화된 객체이므로 그대로 전달
    setEditingSale(sale)
  }

  const handleDelete = async (sale) => {
    const confirmed = await showConfirm(
      '이 매출 내역이 영구적으로 삭제됩니다.',
      '정말 삭제하시겠습니까?',
      '삭제',
      '취소'
    )

    if (confirmed) {
      try {
        await deleteSale(sale.id) // deleteSale은 단일 ID 삭제 지원 (DataContext 확인 필요)
        // DataContext의 deleteSale이 그룹 삭제 로직인지 확인 필요.
        // DataContext: deleteSale accepts groupId.
        // If I pass sale.id, it tries to delete where id=sale.id.
        // If sales table id is used, it deletes that row. correct.

        await showSuccess('매출 내역이 삭제되었습니다.')
        fetchData()
      } catch (error) {
        console.error('매출 삭제 오류:', error)
        await showError('삭제 중 오류가 발생했습니다.')
      }
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-oem-bg-app">
        <div className="text-oem-text-secondary animate-pulse font-medium">Retrieving sales throughput...</div>
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
              Sales Journal
              <span className="text-[10px] bg-oem-bg-header text-oem-text-secondary px-2 py-0.5 rounded-full font-normal">FORM: SALES_01</span>
            </h1>
            <p className="text-[11px] text-oem-text-secondary mt-1 font-medium">
              Enterprise revenue tracking and sales document management. Total Statements: <span className="text-oem-blue font-bold">{totalCount}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setIsAddModalOpen(true)} className="oem-btn-primary flex items-center gap-1.5 py-1.5 h-8">
              <Plus className="w-3.5 h-3.5 text-white" /> ADD_STATEMENT
            </button>
          </div>
        </div>

        {/* Query Panel */}
        <div className="oem-panel bg-white shadow-sm border-l-4 border-l-oem-blue">
          <div className="p-4 flex flex-col lg:flex-row gap-4 lg:items-center">
            <div className="flex-1 flex items-center gap-3">
              <label className="text-[11px] font-bold text-oem-text-secondary uppercase tracking-widest whitespace-nowrap">Query By Client</label>
              <div className="relative flex-1 group">
                <input
                  type="text"
                  placeholder="Enter company alias..."
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
                <span>TOTAL_THROUGHPUT</span>
                <span className="text-oem-blue font-bold text-sm tracking-tighter">
                  {formatKoreanCurrency(sales.reduce((sum, s) => sum + s.totalAmount, 0))}
                </span>
              </div>
              <div className="flex flex-col">
                <span>STATUS</span>
                <span className="text-oem-green font-bold text-sm tracking-tighter uppercase">Querying</span>
              </div>
            </div>
          </div>
        </div>

        {/* Data Grid Panel */}
        <div className="oem-panel bg-white shadow-sm overflow-hidden">
          <div className="oem-panel-header">
            <span>TRANSACTION_LEDGER</span>
            <div className="flex items-center gap-4 text-[10px] font-medium text-oem-text-secondary">
              <span>PAGE {page} OF {Math.ceil(totalCount / PAGE_SIZE)}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="oem-table min-w-full">
              <thead>
                <tr>
                  <th className="w-12 text-center">SEQ</th>
                  <th className="w-32">DATE</th>
                  <th className="w-64">CLIENT_NAME</th>
                  <th>ITEM_DESCRIPTION</th>
                  <th className="w-20 text-center">QTY</th>
                  <th className="w-40 text-right">TOTAL_AMOUNT</th>
                  <th className="w-20 text-center">TOOLS</th>
                </tr>
              </thead>
              <tbody>
                {sales.length > 0 ? (
                  sales.map((sale, index) => {
                    const globalIndex = (page - 1) * PAGE_SIZE + index + 1;
                    return (
                      <tr key={sale.id} className="group">
                        <td className="text-center font-bold text-oem-text-secondary">{globalIndex}</td>
                        <td className="text-oem-text-secondary font-medium">
                          {sale.date ? sale.date.split('T')[0] : 'N/A'}
                        </td>
                        <td className="font-bold text-oem-text-primary tracking-tight">
                          {sale.clientName}
                        </td>
                        <td>
                          <div className="flex flex-col">
                            <span className="font-medium text-[13px]">{sale.displayItemName || 'Generic Service'}</span>
                            {sale.notes && <span className="text-[11px] text-oem-text-secondary italic truncate max-w-xs">{sale.notes}</span>}
                          </div>
                        </td>
                        <td className="text-center text-oem-text-secondary">
                          {sale.items?.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)}
                        </td>
                        <td className="text-right font-bold text-oem-text-primary">
                          {formatKoreanCurrency(sale.totalAmount || 0)}
                        </td>
                        <td className="text-center">
                          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleEdit(sale)}
                              className="p-1.5 hover:bg-oem-bg-header rounded transition-colors text-oem-blue"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(sale)}
                              className="p-1.5 hover:bg-oem-bg-header rounded transition-colors text-oem-red"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan="7" className="p-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Plus className="w-12 h-12 text-oem-bg-header" />
                        <p className="text-oem-text-secondary italic font-medium">
                          {isLoading || localLoading ? 'Initializing record retrieval...' : 'No transaction records found matching the current query.'}
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

      {/* Modals */}
      <AddSaleModal isOpen={isAddModalOpen} onClose={() => { setIsAddModalOpen(false); fetchData(); }} />
      <EditSaleModal isOpen={editingSale !== null} onClose={() => { setEditingSale(null); fetchData(); }} saleGroup={editingSale} />
    </div>
  )
}

export default Sales
