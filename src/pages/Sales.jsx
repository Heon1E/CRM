import React, { useState, useEffect } from 'react'
import { Edit, Download, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import AddSaleModal from '../components/AddSaleModal'
import SwipeableListItem from '../components/SwipeableListItem'
import Pagination from '../components/common/Pagination'
import { exportSalesToExcel } from '../utils/excelExport'
import { showError } from '../utils/alert'
import { formatKoreanCurrency } from '../utils/formatters'

const PAGE_SIZE = 15

const Sales = () => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // 데이터 페칭 함수 (sales_slips 뷰에서 가져오기)
  const fetchData = async () => {
    try {
      setLoading(true)
      const from = (page - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      const { data, error, count } = await supabase
        .from('sales_slips')
        .select('*', { count: 'exact' })
        .order('sale_date', { ascending: false })
        .range(from, to)

      if (error) throw error

      // sales_slips 뷰의 데이터를 그대로 사용 (이미 그룹핑됨)
      const normalizedSales = (data || []).map(slip => {
        return {
          id: slip.id,
          date: slip.sale_date || '',
          customerName: slip.customer_name || '알 수 없음',
          slipTitle: slip.slip_title || '',
          totalAmount: slip.total_amount || 0,
          itemCount: slip.item_count || 1,
          lastCreatedAt: slip.last_created_at || '',
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
  }, [page])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">데이터를 불러오는 중...</div>
      </div>
    )
  }

  // sales_slips 뷰에서 이미 그룹핑된 데이터를 사용하므로 추가 그룹핑 불필요
  const sortedSales = sales

  const handleExport = () => {
    // TODO: sales_slips 뷰 데이터를 엑셀로 내보내기 (필요시 구현)
    exportSalesToExcel(sales)
  }

  // 상세 보기 알림 (그룹핑된 데이터이므로 수정/삭제는 추후 구현)
  const handleEdit = () => {
    showError('상세 보기 기능은 곧 제공될 예정입니다.')
  }

  const handleDelete = () => {
    showError('상세 보기 기능은 곧 제공될 예정입니다.')
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">매출 관리</h1>
          <p className="text-text-secondary mt-1.5 text-sm md:text-base">총 {totalCount}건의 매출 전표</p>
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
                sortedSales.map((slip) => (
                  <tr key={slip.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-5 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {slip.date ? slip.date.split('T')[0] : '-'}
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">
                        {slip.customerName || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="text-sm text-gray-600">
                        {slip.slipTitle || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-500">
                      {slip.itemCount > 1 ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          {slip.itemCount}건
                        </span>
                      ) : (
                        <span className="text-gray-500">1건</span>
                      )}
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm font-bold text-gray-900">
                      {formatKoreanCurrency(slip.totalAmount || 0)}
                    </td>
                    <td className="px-6 py-5 text-sm text-gray-500">
                      <div className="max-w-xs truncate">-</div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={handleEdit}
                          className="text-gray-400 hover:text-gray-500 font-medium flex items-center space-x-1 transition-colors touch-manipulation px-3 py-2 min-h-[44px] cursor-not-allowed"
                          style={{ WebkitTapHighlightColor: 'transparent' }}
                          disabled
                          title="상세 보기 기능은 곧 제공될 예정입니다"
                        >
                          <Edit className="w-4 h-4" />
                          <span>수정</span>
                        </button>
                        <button
                          onClick={handleDelete}
                          className="text-gray-400 hover:text-gray-500 font-medium flex items-center space-x-1 transition-colors touch-manipulation px-3 py-2 min-h-[44px] cursor-not-allowed"
                          style={{ WebkitTapHighlightColor: 'transparent' }}
                          disabled
                          title="상세 보기 기능은 곧 제공될 예정입니다"
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
            sortedSales.map((slip) => (
              <SwipeableListItem
                key={slip.id}
                onEdit={handleEdit}
                onDelete={handleDelete}
                enabled={false}
              >
                <div className="p-4 bg-white hover:bg-gray-50 transition-colors touch-manipulation min-h-[44px]">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-base font-bold text-gray-900 flex-1 break-words">
                      {slip.date ? slip.date.split('T')[0] : '-'}
                    </h3>
                    <span className="ml-2 text-base font-bold text-gray-900 whitespace-nowrap">
                      {formatKoreanCurrency(slip.totalAmount || 0)}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-sm text-gray-600">
                    <div className="flex items-start space-x-2">
                      <span className="font-medium whitespace-nowrap">거래처:</span>
                      <span className="break-words flex-1">{slip.customerName || '-'}</span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <span className="font-medium whitespace-nowrap">품목:</span>
                      <span className="break-words flex-1">
                        {slip.slipTitle || '-'}
                      </span>
                      {slip.itemCount > 1 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 whitespace-nowrap">
                          {slip.itemCount}건
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </SwipeableListItem>
            ))
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
    </div>
  )
}

export default Sales
