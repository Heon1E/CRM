import React, { useState, useEffect } from 'react'
import { Edit, Plus, Trash2 } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { supabase } from '../lib/supabase'
import AddProductModal from '../components/AddProductModal'
import EditProductModal from '../components/EditProductModal'
import ProductExcelUpload from '../components/ProductExcelUpload'
import Pagination from '../components/common/Pagination'
import { showSuccess, showError, showConfirm } from '../utils/alert'

const PAGE_SIZE = 15

const Products = () => {
  const { deleteProduct } = useData()
  const [editingProductId, setEditingProductId] = useState(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [products, setProducts] = useState([])
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
        .from('products')
        .select('*', { count: 'exact' })
        .order('name')
        .range(from, to)

      if (error) throw error

      setProducts(data || [])
      setTotalCount(count || 0)
    } catch (error) {
      console.error('제품 데이터 로드 오류:', error)
      showError('제품 데이터를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // 페이지 변경 시 데이터 다시 로드
  useEffect(() => {
    fetchData()
  }, [page])

  // 제품 삭제 후 데이터 새로고침
  const handleDeleteSuccess = () => {
    fetchData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-300">데이터를 불러오는 중...</div>
      </div>
    )
  }

  const handleDelete = async (id) => {
    const confirmed = await showConfirm(
      '이 제품 정보가 영구적으로 삭제됩니다.',
      '정말 삭제하시겠습니까?',
      '삭제',
      '취소'
    )
    if (confirmed) {
      try {
        await deleteProduct(id)
        await showSuccess('제품이 삭제되었습니다.')
        // 삭제 후 현재 페이지가 비어있으면 이전 페이지로 이동
        if (products.length === 1 && page > 1) {
          setPage(page - 1)
        } else {
          fetchData()
        }
      } catch (error) {
        console.error('제품 삭제 중 오류:', error)
        await showError(error.message || '제품 삭제 중 오류가 발생했습니다.')
      }
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-gray-300 text-[11px] font-bold uppercase tracking-[0.15em] mb-1">Overview</p>
          <h1 className="text-2xl md:text-3xl font-semibold text-white">제품 관리</h1>
          <p className="text-gray-300 mt-1.5 text-sm md:text-base">총 {totalCount} 제품</p>
        </div>
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="btn-primary flex items-center justify-center gap-2 touch-manipulation min-h-[44px] px-4 py-3 w-full sm:w-auto"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Plus className="w-4 h-4" />
            <span>제품 추가</span>
          </button>
        </div>
      </div>

      <div className="card overflow-hidden bg-[#1E1E1E] border-gray-800">
        <div className="overflow-x-auto">
          <table className="min-w-full table-compact divide-y divide-gray-800">
            <thead className="bg-[#1E1E1E]">
              <tr>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-[0.16em]">
                  품목명
                </th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-[0.16em]">
                  종류
                </th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-[0.16em]">
                  규격
                </th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-[0.16em]">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="bg-transparent divide-y divide-gray-800">
              {products.length > 0 ? (
                products.map((product) => (
                  <tr key={product.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 md:px-6 md:py-5 whitespace-nowrap">
                      <div className="text-sm font-semibold text-white">{product.name || '-'}</div>
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-5 whitespace-nowrap">
                      <div className="text-sm text-gray-300">{product.type || '-'}</div>
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-5 whitespace-nowrap">
                      <div className="text-sm text-gray-300">{product.standard || '-'}</div>
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-5 whitespace-nowrap text-sm">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => setEditingProductId(product.id)}
                          className="text-gray-300 hover:text-white font-medium flex items-center space-x-1 transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                          <span>수정</span>
                        </button>
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="text-red-300 hover:text-red-200 font-medium flex items-center space-x-1 transition-colors"
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
                  <td colSpan="4" className="px-4 py-6 md:px-6 md:py-8 text-center text-gray-300">
                    등록된 제품이 없습니다.
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

      {/* Modals */}
      <AddProductModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
      <EditProductModal
        isOpen={editingProductId !== null}
        onClose={() => setEditingProductId(null)}
        productId={editingProductId}
      />
    </div>
  )
}

export default Products






