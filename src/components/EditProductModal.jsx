import React, { useState, useEffect, useRef } from 'react'
import Modal from './Modal'
import { useData } from '../contexts/DataContext'
import useEnterMove from '../hooks/useEnterMove'
import { showWarning, showSuccess, showError, showConfirm } from '../utils/alert'

const EditProductModal = ({ isOpen, onClose, productId }) => {
  // 모든 Hook 선언을 최상단에 배치 (React Hooks 규칙 준수)
  const { products, updateProduct, deleteProduct } = useData()
  const product = products?.find((p) => p.id === productId)
  const formRef = useRef(null)

  const [formData, setFormData] = useState({
    name: '',
    type: 'IBC',
    standard: '',
  })

  // product가 변경되거나 모달이 닫힐 때 폼 초기화 (.cursorrules 규칙: 모달 재오픈 시 폼 상태 초기화)
  useEffect(() => {
    if (product && productId) {
      setFormData({
        name: product?.name || '',
        type: product?.type || 'IBC',
        standard: product?.standard || '',
      })
    } else if (!isOpen) {
      // 모달이 닫힐 때도 폼 초기화
      setFormData({
        name: '',
        type: 'IBC',
        standard: '',
      })
    }
  }, [product, productId, isOpen])

  // 전역 엔터 네비게이션 적용
  useEnterMove({ formRef, enabled: isOpen })

  // Guard Clause: product가 없으면 아무것도 렌더링하지 않음 (.cursorrules 규칙 준수)
  // 모든 Hook 선언이 끝난 후에 조기 리턴
  if (!isOpen || !productId || !product) {
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!productId || !product) {
      await showError('제품 정보를 찾을 수 없습니다.')
      onClose()
      return
    }
    if (!formData.name?.trim()) {
      await showWarning('품목명을 입력해주세요.')
      return
    }

    try {
      await updateProduct(productId, formData)
      await showSuccess('제품이 수정되었습니다.')
      onClose()
    } catch (error) {
      console.error('제품 수정 중 오류:', error)
      await showError(error.message || '제품 수정 중 오류가 발생했습니다.')
    }
  }

  const handleDelete = async () => {
    if (!productId || !product) {
      await showError('제품 정보를 찾을 수 없습니다.')
      onClose()
      return
    }
    const confirmed = await showConfirm(
      '이 제품 정보가 영구적으로 삭제되며, 관련된 계약 단가 정보도 함께 삭제됩니다.',
      '정말 삭제하시겠습니까?',
      '삭제',
      '취소'
    )
    if (confirmed) {
      try {
        await deleteProduct(productId)
        await showSuccess('제품이 삭제되었습니다.')
        onClose()
      } catch (error) {
        console.error('제품 삭제 중 오류:', error)
        await showError(error.message || '제품 삭제 중 오류가 발생했습니다.')
      }
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="제품 수정">
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            품목명 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
            placeholder="품목명을 입력하세요"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            품목 종류 <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-white"
            required
          >
            <option value="IBC">IBC</option>
            <option value="드럼">드럼</option>
            <option value="제리캔">제리캔</option>
            <option value="부품">부품</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">규격</label>
          <input
            type="text"
            value={formData.standard}
            onChange={(e) => setFormData({ ...formData, standard: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
            placeholder="규격을 입력하세요 (선택사항)"
          />
        </div>

        <div className="flex justify-between items-center pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={handleDelete}
            className="px-5 py-2.5 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors duration-200 font-medium shadow-sm hover:shadow"
          >
            삭제
          </button>
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors duration-200 font-medium"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors duration-200 font-medium shadow-sm hover:shadow"
            >
              저장
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

export default EditProductModal

