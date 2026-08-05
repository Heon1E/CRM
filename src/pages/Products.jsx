import React, { useState, useEffect } from 'react'
import { Edit, Plus, Trash2 } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { supabase, supabaseConfigError } from '../lib/supabase'
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
      showError(supabaseConfigError
        ? `서버 연결 설정이 누락되었습니다 (${supabaseConfigError}). 배포 환경변수를 확인해 주세요.`
        : '제품 데이터를 불러오는 중 오류가 발생했습니다.')
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
        <div className="grid-scroll">
          <table className="dgrid">
            <thead>
              <tr>
                <th>품목명</th>
                <th style={{ width: '160px' }}>종류</th>
                <th style={{ width: '160px' }}>규격</th>
                <th style={{ width: '86px' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {products.length > 0 ? (
                products.map((product) => (
                  <tr key={product.id} onDoubleClick={() => setEditingProductId(product.id)}>
                    <td style={{ fontWeight: 600 }}>{product.name || '-'}</td>
                    <td>{product.type || '-'}</td>
                    <td>{product.standard || '-'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="rowbtn" onClick={() => setEditingProductId(product.id)}>수정</button>
                      <button className="rowbtn danger" onClick={() => handleDelete(product.id)}>삭제</button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
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






