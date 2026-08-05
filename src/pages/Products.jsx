import React, { useState, useEffect } from 'react'
import { Edit, Plus, Trash2, RefreshCw } from 'lucide-react'
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

  // 단축키
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); setIsAddModalOpen(true) }
      else if (e.key === 'F5') { e.preventDefault(); fetchData() }
      else if (e.key === 'Escape') { setIsAddModalOpen(false); setEditingProductId(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 제품 삭제 후 데이터 새로고침
  const handleDeleteSuccess = () => {
    fetchData()
  }

  if (loading) {
    return (
      <div className="win" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        데이터를 불러오는 중...
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

  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1

  return (
    <div className="win flex flex-col">
      {/* 타이틀바 */}
      <div className="win-title">
        <span className="flex items-baseline gap-3">
          제품 관리
          <span className="meta">PRODUCT · 전체 {totalCount.toLocaleString()}개 · {page}/{totalPages}</span>
        </span>
      </div>

      {/* 툴바 */}
      <div className="toolbar">
        <button className="tb-btn primary" onClick={() => setIsAddModalOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> 신규 <kbd>F2</kbd>
        </button>
        <button className="tb-btn" onClick={fetchData}>
          <RefreshCw className="w-3.5 h-3.5" /> 새로고침 <kbd>F5</kbd>
        </button>
      </div>

      <div className="grid-scroll flex-1" style={{ minHeight: '280px' }}>
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

      <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
        {/* Pagination */}
        <Pagination
          totalCount={totalCount}
          pageSize={PAGE_SIZE}
          currentPage={page}
          onPageChange={setPage}
        />
      </div>

      <div className="statusbar">
        <span><span className="dot" />준비됨</span>
        <span>표시 {products.length}개 / 전체 {totalCount.toLocaleString()}개</span>
        <span className="flex-1" />
        <span className="hint"><kbd>F2</kbd> 신규 · <kbd>F5</kbd> 새로고침 · 행 더블클릭으로 수정</span>
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






