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
        <div className="text-[color:var(--text-secondary)]">데이터를 불러오는 중...</div>
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
          <p className="text-[color:var(--text-muted)] text-xs font-semibold tracking-wide mb-1">제품</p>
          <h1 className="text-2xl md:text-3xl font-semibold text-[color:var(--text-primary)]">제품 관리</h1>
          <p className="text-[color:var(--text-secondary)] mt-1.5 text-sm md:text-base">총 {totalCount}개</p>
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

      <div className="card overflow-hidden">
        {/* --- 데스크톱: 표 --- */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full">
            <thead style={{ backgroundColor: 'var(--bg-subtle)' }}>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>품목명</th>
                <th className="px-6 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>종류</th>
                <th className="px-6 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>규격</th>
                <th className="px-6 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>관리</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
              {products.length > 0 ? (
                products.map((product) => (
                  <tr key={product.id} className="table-row-hover transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{product.name || '-'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{product.type || '-'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{product.standard || '-'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingProductId(product.id)}
                          className="icon-btn"
                          title="수정"
                          aria-label="제품 수정"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="icon-btn icon-btn-danger"
                          title="삭제"
                          aria-label="제품 삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="px-6 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                    등록된 제품이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* --- 모바일: 카드 --- */}
        <div className="md:hidden p-3">
          {products.length > 0 ? (
            products.map((product) => (
              <div key={product.id} className="data-card">
                <p className="font-semibold text-[15px]" style={{ color: 'var(--text-primary)' }}>
                  {product.name || '-'}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                  <span className="data-card__label">종류 <span className="data-card__value">{product.type || '-'}</span></span>
                  <span className="data-card__label">규격 <span className="data-card__value">{product.standard || '-'}</span></span>
                </div>
                <div className="mt-3 pt-3 border-t flex gap-2" style={{ borderColor: 'var(--border-light)' }}>
                  <button
                    onClick={() => setEditingProductId(product.id)}
                    className="flex-1 min-h-tap flex items-center justify-center gap-1.5 rounded-lg border text-[14px] font-semibold"
                    style={{ borderColor: 'var(--border-strong)', color: 'var(--text-primary)' }}
                  >
                    <Edit className="w-4 h-4" /> 수정
                  </button>
                  <button
                    onClick={() => handleDelete(product.id)}
                    className="min-h-tap px-4 flex items-center justify-center gap-1.5 rounded-lg border text-[14px] font-semibold"
                    style={{ borderColor: 'rgba(220,38,38,0.2)', color: 'var(--danger)' }}
                  >
                    <Trash2 className="w-4 h-4" /> 삭제
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              등록된 제품이 없습니다.
            </p>
          )}
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






