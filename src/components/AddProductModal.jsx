import React, { useState, useRef } from 'react'
import Modal from './Modal'
import { useData } from '../contexts/DataContext'
import useEnterMove from '../hooks/useEnterMove'
import { showWarning, showSuccess, showError } from '../utils/alert'

const AddProductModal = ({ isOpen, onClose }) => {
  const { addProduct } = useData()
  const formRef = useRef(null)

  const [formData, setFormData] = useState({
    name: '',
    type: 'IBC',
    standard: '',
  })

  // 전역 엔터 네비게이션 적용
  useEnterMove({ formRef, enabled: isOpen })

  // 모달이 닫힐 때 상태 초기화
  React.useEffect(() => {
    if (!isOpen) {
      setFormData({
        name: '',
        type: 'IBC',
        standard: '',
      })
    }
  }, [isOpen])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      await showWarning('품목명을 입력해주세요.')
      return
    }

    try {
      await addProduct(formData)
      await showSuccess('제품이 추가되었습니다.')
      setFormData({
        name: '',
        type: 'IBC',
        standard: '',
      })
      onClose()
    } catch (error) {
      console.error('제품 추가 중 오류:', error)
      await showError(error.message || '제품 추가 중 오류가 발생했습니다.')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="제품 추가">
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            품목명 <span className="text-red-400">*</span>
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
            품목 종류 <span className="text-red-400">*</span>
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

        <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors duration-200 font-medium"
          >
            취소
          </button>
          <button
            type="submit"
            className="px-5 py-2.5 bg-oem-blue text-white rounded-md hover:bg-oem-blue-dark transition-colors duration-200 font-medium shadow-sm hover:shadow"
          >
            저장
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default AddProductModal





