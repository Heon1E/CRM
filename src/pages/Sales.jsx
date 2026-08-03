import React, { useState, useEffect, useCallback } from 'react'
import { Edit, Download, Plus, Trash2, Search, RefreshCw, FileText } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { supabase } from '../lib/supabase'
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
      showError('매출 데이터를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLocalLoading(false)
    }
  }, [page, searchTerm, clients, processGroupedSales])

  // Initial & Search/Page Change Load
  useEffect(() => {
    fetchData()
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

  return (
    <div className="min-h-screen bg-oem-bg-app p-4 md:p-8 font-['Inter',sans-serif] text-oem-text-primary mt-[56px]">
      <div className="max-w-[1600px] mx-auto space-y-6">

        {/* Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-300 pb-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-gray-900 flex items-center gap-2">
              매출 관리
            </h1>
            <p className="text-xs text-gray-500 mt-1 font-bold">
              전체 {totalCount.toLocaleString()}건
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="p-2 text-gray-400 hover:text-oem-blue transition-colors"
              title="새로고침"
            >
              <RefreshCw className={`w-4 h-4 ${localLoading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => setIsAddModalOpen(true)} className="oem-btn-primary flex items-center gap-1.5 py-2 px-4 shadow-sm text-xs uppercase tracking-wide">
              <Plus className="w-3.5 h-3.5" /> 매출 등록
            </button>
          </div>
        </div>

        {/* Query Panel */}
        <div className="bg-white border border-gray-200 border-l-4 border-l-oem-blue rounded-sm shadow-sm p-5 flex flex-col lg:flex-row gap-6 lg:items-center">
          <div className="flex-1 flex flex-col md:flex-row md:items-center gap-4">
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap min-w-[100px]">거래처 검색</label>
            <div className="relative flex-1 group w-full">
              <input
                type="text"
                placeholder="거래처명으로 검색"
                value={searchInput}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                className="w-full bg-gray-50 border border-gray-300 px-4 py-2.5 pl-10 rounded-sm text-sm outline-none focus:border-oem-blue focus:bg-white transition-all font-medium text-gray-900 placeholder:text-gray-400"
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 group-focus-within:text-oem-blue" />
            </div>
          </div>
          <div className="flex items-center gap-8 pl-6 lg:border-l border-gray-200">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">이 페이지 합계</span>
              <span className="text-gray-900 font-black text-lg tracking-tight">
                {formatKoreanCurrency(localSales.reduce((sum, s) => sum + s.totalAmount, 0))}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">상태</span>
              <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-sm w-fit ${localLoading ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-700'}`}>
                {localLoading ? '불러오는 중' : '준비됨'}
              </span>
            </div>
          </div>
        </div>

        {/* Transaction Ledger Grid */}
        <div className="bg-white border border-gray-200 rounded-sm shadow-sm flex flex-col min-h-[500px]">
          <div className="px-5 py-3 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-widest">매출 내역</h3>
            <span className="text-[10px] font-bold text-gray-400">{page} / {Math.ceil(totalCount / PAGE_SIZE) || 1} 페이지</span>
          </div>

          {/* --- 데스크톱: 표 --- */}
          <div className="hidden md:block flex-1 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-white">
                  <th className="w-16 text-center py-3 text-xs font-semibold text-gray-500">번호</th>
                  <th className="w-32 py-3 text-xs font-semibold text-gray-500">날짜</th>
                  <th className="w-64 py-3 text-xs font-semibold text-gray-500">거래처</th>
                  <th className="py-3 text-xs font-semibold text-gray-500">품목</th>
                  <th className="w-20 text-center py-3 text-xs font-semibold text-gray-500">수량</th>
                  <th className="w-40 text-right py-3 text-xs font-semibold text-gray-500">금액</th>
                  <th className="w-28 text-center py-3 text-xs font-semibold text-gray-500">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {localLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="py-4 text-center"><div className="h-3 w-4 bg-gray-100 rounded mx-auto" /></td>
                      <td className="py-4"><div className="h-3 w-20 bg-gray-100 rounded" /></td>
                      <td className="py-4"><div className="h-3 w-32 bg-gray-100 rounded" /></td>
                      <td className="py-4"><div className="h-3 w-48 bg-gray-100 rounded" /></td>
                      <td className="py-4 text-center"><div className="h-3 w-8 bg-gray-100 rounded mx-auto" /></td>
                      <td className="py-4 text-right"><div className="h-3 w-24 bg-gray-100 rounded ml-auto" /></td>
                      <td className="py-4 text-center"><div className="h-6 w-12 bg-gray-100 rounded mx-auto" /></td>
                    </tr>
                  ))
                ) : localSales.length > 0 ? (
                  localSales.map((sale, index) => {
                    const globalIndex = (page - 1) * PAGE_SIZE + index + 1;
                    return (
                      <tr key={sale.id} className="group hover:bg-gray-50 transition-colors">
                        <td className="py-3 text-center text-[11px] font-bold text-gray-400 group-hover:text-oem-blue">{globalIndex}</td>
                        <td className="py-3 text-[12px] font-medium text-gray-600 font-mono tracking-tight">
                          {sale.date ? sale.date.split('T')[0] : '-'}
                        </td>
                        <td className="py-3">
                          <div className="font-bold text-[13px] text-gray-900 group-hover:text-oem-blue transition-colors">
                            {sale.clientName}
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="flex flex-col">
                            <span className="text-[12px] font-medium text-gray-700">{sale.displayItemName || '품목 미지정'}</span>
                            {sale.notes && <span className="text-[11px] text-gray-400 italic truncate max-w-xs">{sale.notes}</span>}
                          </div>
                        </td>
                        <td className="py-3 text-center text-[12px] text-gray-600 font-medium">
                          {sale.items?.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)}
                        </td>
                        <td className="py-3 text-right font-bold text-[13px] text-gray-900 tabular-nums">
                          {formatKoreanCurrency(sale.totalAmount || 0)}
                        </td>
                        <td className="py-3 text-center">
                          {/* 예전엔 opacity-0 + group-hover라 터치 기기에선 보이지 않았다.
                              또 19x19px에 4px 간격이라 수정 대신 삭제를 누르기 쉬웠다. */}
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleEdit(sale)}
                              className="icon-btn"
                              title="수정"
                              aria-label="매출 수정"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(sale)}
                              className="icon-btn icon-btn-danger"
                              title="삭제"
                              aria-label="매출 삭제"
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
                    <td colSpan="7" className="py-12 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <FileText className="w-8 h-8 text-gray-200" />
                        <p className="text-gray-400 text-sm font-medium">매출 내역이 없습니다</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* --- 모바일: 카드 ---
              375px 화면에 7개 열을 밀어넣으면 거래처명에 48px밖에 안 돌아간다.
              Clients 페이지에서 이미 쓰고 있는 방식을 그대로 적용한다. */}
          <div className="md:hidden flex-1 p-3">
            {localLoading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="data-card animate-pulse">
                  <div className="h-4 w-32 bg-gray-100 rounded mb-2" />
                  <div className="h-3 w-24 bg-gray-100 rounded mb-3" />
                  <div className="h-5 w-28 bg-gray-100 rounded" />
                </div>
              ))
            ) : localSales.length > 0 ? (
              localSales.map((sale, index) => {
                const qty = sale.items?.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
                return (
                  <div key={sale.id} className="data-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[15px] text-gray-900 truncate">{sale.clientName}</p>
                        <p className="data-card__label mt-0.5">
                          {sale.date ? sale.date.split('T')[0] : '-'} · {(page - 1) * PAGE_SIZE + index + 1}번
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-[16px] text-gray-900 tabular-nums">
                          {formatKoreanCurrency(sale.totalAmount || 0)}
                        </p>
                        <p className="data-card__label">수량 {qty}</p>
                      </div>
                    </div>

                    <p className="mt-2 text-[13px] text-gray-600 break-words">
                      {sale.displayItemName || '품목 미지정'}
                    </p>
                    {sale.notes && (
                      <p className="mt-1 text-[12px] text-gray-400 break-words">{sale.notes}</p>
                    )}

                    <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
                      <button
                        onClick={() => handleEdit(sale)}
                        className="flex-1 min-h-tap flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 text-[14px] font-semibold text-gray-700 active:bg-gray-50"
                      >
                        <Edit className="w-4 h-4" /> 수정
                      </button>
                      <button
                        onClick={() => handleDelete(sale)}
                        className="min-h-tap px-4 flex items-center justify-center gap-1.5 rounded-lg border border-red-100 text-[14px] font-semibold text-red-600 active:bg-red-50"
                        aria-label="매출 삭제"
                      >
                        <Trash2 className="w-4 h-4" /> 삭제
                      </button>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="py-12 flex flex-col items-center justify-center gap-2">
                <FileText className="w-8 h-8 text-gray-200" />
                <p className="text-gray-400 text-sm font-medium">매출 내역이 없습니다</p>
              </div>
            )}
          </div>

          {/* Footer Pagination */}
          <div className="p-4 border-t border-gray-200 bg-gray-50/50 flex justify-center">
            <Pagination
              totalCount={totalCount}
              pageSize={PAGE_SIZE}
              currentPage={page}
              onPageChange={setPage}
            />
          </div>
        </div>
      </div>

      <AddSaleModal isOpen={isAddModalOpen} onClose={() => { setIsAddModalOpen(false); fetchData(); }} />
      <EditSaleModal isOpen={editingSale !== null} onClose={() => { setEditingSale(null); fetchData(); }} saleGroup={editingSale} />
    </div>
  )
}

export default Sales
