import React, { useState, useEffect, useMemo } from 'react'
import { Edit, Download, Plus, Trash2 } from 'lucide-react'
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

const PAGE_SIZE = 15

const Sales = () => {
  // ===== 모든 Hooks를 최상단에 선언 =====
  const { clients, deleteSale } = useData()
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingSaleGroup, setEditingSaleGroup] = useState(null)
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // 데이터 페칭 함수 (sales 테이블에서 가져오기)
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

      // 데이터 정규화: sales 테이블의 item_name 컬럼을 직접 사용
      const normalizedSales = (data || []).map(sale => {
        const client = clients?.find(c => c.id === sale.client_id)
        const items = sale.items || []

        return {
          ...sale,
          id: sale.id, // Primary Key 명시적으로 포함
          date: sale.sale_date || sale.date,
          clientId: sale.client_id,
          clientName: client?.company || '알 수 없음',
          totalAmount: sale.total_amount || sale.totalAmount || 0,
          items: items,
          // sales 테이블의 item_name 컬럼을 직접 사용 (우선순위 1)
          displayItemName: sale.item_name || items[0]?.item_name || items[0]?.productName || '',
          itemCount: items.length || 1,
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

  // 전표 그룹핑 함수: 같은 날짜 + 같은 고객으로 그룹핑
  const groupSalesBySlip = useMemo(() => {
    if (!sales || sales.length === 0) return []

    // 날짜를 YYYY-MM-DD 형식으로 정규화하는 함수
    const normalizeDate = (dateString) => {
      if (!dateString) return ''
      // ISO 형식이면 날짜 부분만 추출
      if (typeof dateString === 'string' && dateString.includes('T')) {
        return dateString.split('T')[0]
      }
      // 이미 YYYY-MM-DD 형식이면 그대로 반환
      if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateString)) {
        return dateString.substring(0, 10)
      }
      return dateString
    }

    // 그룹핑 맵 생성: 키는 "날짜|고객ID"
    const groupedMap = {}
    
    sales.forEach((sale) => {
      const dateKey = normalizeDate(sale.date || sale.sale_date)
      const clientKey = sale.clientId || sale.client_id || 'unknown'
      const groupKey = `${dateKey}|${clientKey}`

      if (!groupedMap[groupKey]) {
        groupedMap[groupKey] = []
      }
      groupedMap[groupKey].push(sale)
    })

    // 그룹을 배열로 변환하고 집계
    const groupedSales = Object.values(groupedMap).map((group) => {
      // 그룹 내 첫 번째 항목 (기준 항목)
      const firstSale = group[0]
      
      // 총 매출액 합계
      const totalAmount = group.reduce((sum, sale) => {
        return sum + (sale.totalAmount || sale.total_amount || 0)
      }, 0)

      // 전체 품목 개수 합계
      const itemCount = group.reduce((sum, sale) => {
        return sum + (sale.itemCount || sale.items?.length || 1)
      }, 0)

      // 첫 번째 품목 이름 (sales 테이블의 item_name 컬럼 직접 사용)
      const firstItemName = firstSale.item_name || 
                           firstSale.displayItemName || 
                           firstSale.items?.[0]?.item_name || 
                           firstSale.items?.[0]?.productName || 
                           ''

      // 표시할 품목명: "품목명 외 N건" 형식
      const displayItem = itemCount > 1 
        ? `${firstItemName} 외 ${itemCount - 1}건`
        : firstItemName

      // 비고: 첫 번째 항목의 비고 사용 (여러 개면 첫 번째 것만)
      const notes = firstSale.notes || ''

      return {
        id: firstSale.id, // 첫 번째 항목의 ID를 키로 사용
        date: normalizeDate(firstSale.date || firstSale.sale_date),
        clientId: firstSale.clientId || firstSale.client_id,
        clientName: firstSale.clientName || '알 수 없음',
        totalAmount,
        itemCount,
        displayItem,
        displayItemName: firstItemName, // 원본 품목명 (표시용)
        notes,
        // 그룹 내 모든 원본 sale 데이터 (수정/삭제 시 필요)
        originalSales: group,
      }
    })

    // 날짜 내림차순 정렬
    return groupedSales.sort((a, b) => {
      return new Date(b.date) - new Date(a.date)
    })
  }, [sales])

  // 그룹핑된 데이터 사용
  const sortedSales = groupSalesBySlip

  // ===== 모든 Hooks 선언이 끝난 후에 조건부 return 배치 =====
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">데이터를 불러오는 중...</div>
      </div>
    )
  }

  // ===== 일반 함수들은 조건부 return 이후에 정의 =====
  const handleExport = () => {
    exportSalesToExcel(sales)
  }

  // Delete All 핸들러
  const handleDeleteAll = async () => {
    const confirmed = window.confirm('Are you sure you want to delete ALL sales data? This cannot be undone.')
    
    if (!confirmed) return

    try {
      setLoading(true)
      
      // 모든 sales 레코드 삭제
      const { error } = await supabase
        .from('sales')
        .delete()
        .neq('id', 0) // 모든 레코드 삭제 (id가 0이 아닌 모든 것)

      if (error) throw error

      await showSuccess('모든 매출 데이터가 삭제되었습니다.')
      
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

  // 수정 핸들러 (그룹핑된 전표의 첫 번째 sale을 기준으로 수정)
  const handleEdit = async (slip) => {
    if (!slip || !slip.id) {
      showError('매출 데이터를 찾을 수 없습니다.')
      return
    }

    try {
      // 그룹 내 첫 번째 sale의 ID로 상세 데이터 다시 조회
      const saleId = slip.originalSales && slip.originalSales.length > 0 
        ? slip.originalSales[0].id 
        : slip.id

      // Step 1: sales 테이블에서 기본 정보 조회
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .select('*')
        .eq('id', saleId)
        .single()

      if (saleError) throw saleError

      // Step 2: sales_items 테이블에서 sale_id로 품목 목록 조회
      const { data: itemsData, error: itemsError } = await supabase
        .from('sales_items')
        .select('*')
        .eq('sale_id', saleId)

      if (itemsError) {
        console.warn('[Sales.jsx] sales_items 조회 실패 (테이블이 없을 수 있음):', itemsError)
      }

      // 디버깅: 조회된 데이터 구조 확인
      console.log('[Sales.jsx] Step 1 - Sale Data:', saleData)
      console.log('[Sales.jsx] Step 2 - Items Data:', itemsData)
      console.log('[Sales.jsx] Sale items (JSON):', saleData?.items)

      if (saleData) {
        // 클라이언트 정보 매핑
        const client = clients?.find(c => c.id === saleData.client_id)
        
        // Step 3: 두 데이터 합치기 (우선순위: sales_items > items JSON 배열)
        const itemsArray = itemsData && itemsData.length > 0 
          ? itemsData 
          : (saleData.items || [])
        
        // 상세 데이터를 모달에 전달
        const detailedSale = {
          ...saleData,
          id: saleData.id,
          clientId: saleData.client_id,
          clientName: client?.company || '알 수 없음',
          // 분리 조회한 items 배열 명시적으로 연결
          items: itemsArray,
          totalAmount: saleData.total_amount || saleData.totalAmount || 0,
        }

        console.log('[Sales.jsx] Step 3 - Merged detailedSale:', detailedSale)
        setEditingSaleGroup(detailedSale)
      }
    } catch (error) {
      console.error('매출 데이터 조회 오류:', error)
      showError('매출 데이터를 불러오는 중 오류가 발생했습니다.')
    }
  }

  // 삭제 핸들러
  const handleDelete = async (slip) => {
    if (!slip || !slip.id) {
      showError('삭제할 매출 데이터를 찾을 수 없습니다.')
      return
    }

    const confirmed = await showConfirm(
      '이 매출 전표가 영구적으로 삭제됩니다.',
      '정말 삭제하시겠습니까?',
      '삭제',
      '취소'
    )

    if (confirmed) {
      try {
        // 그룹 내 모든 sale 삭제
        if (slip.originalSales && slip.originalSales.length > 0) {
          // 그룹 내 모든 sale의 id로 삭제
          for (const sale of slip.originalSales) {
            if (sale.id) {
              await deleteSale(sale.id)
            }
          }
        } else {
          // originalSales가 없으면 slip의 id로 삭제
          await deleteSale(slip.id)
        }

        await showSuccess('매출 전표가 삭제되었습니다.')
        
        // 삭제 후 데이터 새로고침
        fetchData()
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
          <p className="text-text-secondary mt-1.5 text-sm md:text-base">총 {totalCount}건의 매출 전표</p>
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
          <SalesExcelUpload />
          <button
            onClick={handleDeleteAll}
            className="btn-danger flex-1 sm:flex-none flex items-center justify-center space-x-2 touch-manipulation min-h-[44px] px-4 py-3 bg-red-600 hover:bg-red-700 text-white"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete All</span>
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
                        {slip.clientName || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="text-sm text-gray-600">
                        {slip.displayItem || slip.displayItemName || '-'}
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
                      <div className="max-w-xs truncate">{slip.notes || '-'}</div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => handleEdit(slip)}
                          disabled={!slip.id}
                          className={`font-medium flex items-center space-x-1 transition-colors touch-manipulation px-3 py-2 min-h-[44px] ${
                            slip.id 
                              ? 'text-brand-blue hover:text-brand-blue-hover' 
                              : 'text-gray-400 cursor-not-allowed'
                          }`}
                          style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                          <Edit className="w-4 h-4" />
                          <span>수정</span>
                        </button>
                        <button
                          onClick={() => handleDelete(slip)}
                          disabled={!slip.id}
                          className={`font-medium flex items-center space-x-1 transition-colors touch-manipulation px-3 py-2 min-h-[44px] ${
                            slip.id 
                              ? 'text-red-500 hover:text-red-600' 
                              : 'text-gray-400 cursor-not-allowed'
                          }`}
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
            sortedSales.map((slip) => (
              <SwipeableListItem
                key={slip.id}
                onEdit={() => handleEdit(slip)}
                onDelete={() => handleDelete(slip)}
                enabled={!!slip.id}
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
                      <span className="break-words flex-1">{slip.clientName || '-'}</span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <span className="font-medium whitespace-nowrap">품목:</span>
                      <span className="break-words flex-1">
                        {slip.displayItem || slip.displayItemName || '-'}
                      </span>
                      {slip.itemCount > 1 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 whitespace-nowrap">
                          {slip.itemCount}건
                        </span>
                      )}
                    </div>
                    {slip.notes && (
                      <div className="mt-2 pt-2 border-t border-gray-100 text-sm text-gray-500 break-words">
                        {slip.notes}
                      </div>
                    )}
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
      <EditSaleModal
        isOpen={editingSaleGroup !== null}
        onClose={() => setEditingSaleGroup(null)}
        saleGroup={editingSaleGroup}
      />
    </div>
  )
}

export default Sales
