import React, { useState, useEffect } from 'react'
import { Edit, Download, Plus, Trash2 } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { supabase } from '../lib/supabase'
import AddSaleModal from '../components/AddSaleModal'
import EditSaleModal from '../components/EditSaleModal'
import SwipeableListItem from '../components/SwipeableListItem'
import Pagination from '../components/common/Pagination'
import { exportSalesToExcel } from '../utils/excelExport'
import { showConfirm, showError, showSuccess } from '../utils/alert'
import { formatCurrency } from '../utils/formatters'

const PAGE_SIZE = 15

const Sales = () => {
  const { clients, products, deleteSale } = useData()
  const [editingSaleGroup, setEditingSaleGroup] = useState(null) // 그룹 전체 데이터 저장
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // 데이터 페칭 함수
  const fetchData = async () => {
    try {
      setLoading(true)
      const from = (page - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      const { data, error, count } = await supabase
        .from('sales')
        .select('*', { count: 'exact' })
        .order('sale_date', { ascending: false })
        .range(from, to)

      if (error) throw error

      // 데이터 정규화 및 클라이언트 정보 매핑
      const normalizedSales = (data || []).map(sale => {
        const client = clients?.find(c => c.id === sale.client_id)
        return {
          ...sale,
          date: sale.sale_date || sale.date,
          clientId: sale.client_id,
          clientName: client?.company || '알 수 없음',
          totalAmount: sale.total_amount || sale.totalAmount || 0,
          items: sale.items || [],
          displayItemName: sale.items?.[0]?.item_name || sale.items?.[0]?.productName || '',
          itemCount: sale.items?.length || 1,
        }
      })

      setSales(normalizedSales)
      setTotalCount(count || 0)
    } catch (error) {
      console.error('매출 데이터 로드 오류:', error)
      showError('매출 데이터를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // 페이지 변경 시 데이터 다시 로드
  useEffect(() => {
    fetchData()
  }, [page, clients])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">데이터를 불러오는 중...</div>
      </div>
    )
  }

  // 데이터는 이미 서버에서 정렬되어 있으므로 추가 정렬 불필요
  const sortedSales = sales

  const handleExport = () => {
    exportSalesToExcel(sales)
  }

  // 매출 삭제 핸들러
  const handleDelete = async (saleId) => {
    const confirmed = await showConfirm(
      '이 매출 기록이 영구적으로 삭제됩니다.',
      '정말 삭제하시겠습니까?',
      '삭제',
      '취소'
    )
    if (confirmed) {
      try {
        await deleteSale(saleId)
        await showSuccess('매출 기록이 삭제되었습니다.')
        // 삭제 후 현재 페이지가 비어있으면 이전 페이지로 이동
        if (sales.length === 1 && page > 1) {
          setPage(page - 1)
        } else {
          fetchData()
        }
      } catch (error) {
        console.error('매출 삭제 오류:', error)
        await showError(error.message || '삭제 중 오류가 발생했습니다.')
      }
    }
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">매출 관리</h1>
          <p className="text-text-secondary mt-1.5 text-sm md:text-base">총 {totalCount}건의 매출 기록</p>
        </div>
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <button
            onClick={handleExport}
            className="btn-secondary flex-1 sm:flex-none flex items-center justify-center space-x-2 touch-manipulation min-h-[44px] px-4 py-3"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Download className="w-4 h-4" />
            <span>DB Download</span>
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="btn-success flex-1 sm:flex-none flex items-center justify-center space-x-2 touch-manipulation min-h-[44px] px-4 py-3"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Plus className="w-4 h-4" />
            <span>매출 추가</span>
          </button>
        </div>
      </div>

      {/* Sales - PC: Table, 모바일: Card with Swipe */}
      <div className="card overflow-hidden">
        {/* PC: Table View (768px 이상) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-border-light">
            <thead className="bg-transparent">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  날짜
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  거래처
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  대표 품목
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  품목 수
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  총 매출액
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  비고
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {sortedSales.length > 0 ? (
                sortedSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-5 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {sale.date || sale.sale_date || '-'}
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">
                        {(() => {
                          if (sale.clientName && sale.clientName !== '알 수 없음') {
                            return sale.clientName
                          }
                          if (sale.clientId && clients && Array.isArray(clients)) {
                            const client = clients.find((c) => c.id === sale.clientId)
                            return client?.company || '-'
                          }
                          return '-'
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="text-sm text-gray-600">
                        {sale.displayItemName || sale.items?.[0]?.item_name || sale.items?.[0]?.productName || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-500">
                      {sale.itemCount || sale.items?.length || 1}건
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm font-bold text-gray-900">
                      {formatCurrency(sale.totalAmount || 0)}
                    </td>
                    <td className="px-6 py-5 text-sm text-gray-500">
                      <div className="max-w-xs truncate">{sale.notes || '-'}</div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => setEditingSaleGroup(sale)}
                          className="text-brand-blue hover:text-brand-blue-hover font-medium flex items-center space-x-1 transition-colors touch-manipulation px-3 py-2 min-h-[44px]"
                          style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                          <Edit className="w-4 h-4" />
                          <span>수정</span>
                        </button>
                        <button
                          onClick={() => handleDelete(sale.id)}
                          className="text-red-500 hover:text-red-600 font-medium flex items-center space-x-1 transition-colors touch-manipulation px-3 py-2 min-h-[44px]"
                          style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>삭제</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                    매출 기록이 없습니다.
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
        <div className="md:hidden divide-y divide-border-light">
          {sortedSales.length > 0 ? (
            sortedSales.map((sale) => {
              const clientName = sale.clientName && sale.clientName !== '알 수 없음'
                ? sale.clientName
                : (sale.clientId && clients && Array.isArray(clients))
                  ? clients.find((c) => c.id === sale.clientId)?.company || '-'
                  : '-'
              
              return (
                <SwipeableListItem
                  key={sale.id}
                  onEdit={() => setEditingSaleGroup(sale)}
                  onDelete={() => handleDelete(sale.id)}
                  enabled={true}
                >
                  <div className="p-4 bg-white hover:bg-gray-50 transition-colors touch-manipulation min-h-[44px]">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-base font-bold text-gray-900 flex-1 break-words">
                        {sale.date || sale.sale_date || '-'}
                      </h3>
                      <span className="ml-2 text-base font-bold text-gray-900 whitespace-nowrap">
                        {formatCurrency(sale.totalAmount || 0)}
                      </span>
                    </div>
                    <div className="space-y-1.5 text-sm text-gray-600">
                      <div className="flex items-start space-x-2">
                        <span className="font-medium whitespace-nowrap">거래처:</span>
                        <span className="break-words flex-1">{clientName}</span>
                      </div>
                      <div className="flex items-start space-x-2">
                        <span className="font-medium whitespace-nowrap">품목:</span>
                        <span className="break-words flex-1">
                          {(() => {
                            const itemName = sale.displayItemName || sale.items?.[0]?.item_name || sale.items?.[0]?.productName || '-'
                            const itemCount = sale.itemCount || sale.items?.length || 0
                            if (itemCount > 1) {
                              return `${itemName} 외 ${itemCount - 1}건`
                            }
                            return itemName
                          })()}
                        </span>
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          ({sale.itemCount || sale.items?.length || 1}건)
                        </span>
                      </div>
                      {sale.notes && (
                        <div className="mt-2 pt-2 border-t border-gray-100 text-sm text-gray-500 break-words">
                          {sale.notes}
                        </div>
                      )}
                    </div>
                  </div>
                </SwipeableListItem>
              )
            })
          ) : (
            <div className="px-6 py-8 text-center text-text-secondary">
              매출 기록이 없습니다.
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
      <AddSaleModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
      <EditSaleModal
        isOpen={editingSaleGroup !== null}
        onClose={() => setEditingSaleGroup(null)}
        saleGroup={editingSaleGroup}
      />
    </div>
  )
}

export default Sales
