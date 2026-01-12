import React, { useState } from 'react'
import { Edit, Plus, Trash2 } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import AddProductModal from '../components/AddProductModal'
import EditProductModal from '../components/EditProductModal'
import ProductExcelUpload from '../components/ProductExcelUpload'
import { showSuccess, showError, showConfirm } from '../utils/alert'

const Products = () => {
  const { products, deleteProduct, loading } = useData()
  const [editingProductId, setEditingProductId] = useState(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">데이터를 불러오는 중...</div>
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
      } catch (error) {
        console.error('제품 삭제 중 오류:', error)
        await showError(error.message || '제품 삭제 중 오류가 발생했습니다.')
      }
    }
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">제품 관리</h1>
          <p className="text-gray-500 mt-1.5 text-sm md:text-base">총 {products.length}개 제품</p>
        </div>
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <ProductExcelUpload />
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="btn-success flex items-center justify-center gap-2 touch-manipulation min-h-[44px] px-4 py-3 w-full sm:w-auto"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Plus className="w-4 h-4" />
            <span>제품 추가</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-transparent">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  품목명
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  종류
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  규격
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {products.length > 0 ? (
                products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">{product.name || '-'}</div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="text-sm text-gray-600">{product.type || '-'}</div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="text-sm text-gray-600">{product.standard || '-'}</div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => setEditingProductId(product.id)}
                          className="text-brand-blue hover:text-brand-blue-hover font-medium flex items-center space-x-1 transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                          <span>수정</span>
                        </button>
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="text-red-500 hover:text-red-600 font-medium flex items-center space-x-1 transition-colors"
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
                  <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                    등록된 제품이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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

