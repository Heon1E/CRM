import React, { useState, useRef } from 'react'
import Modal from './Modal'
import { useData } from '../contexts/DataContext'
import useEnterMove from '../hooks/useEnterMove'

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

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      alert('품목명을 입력해주세요.')
      return
    }

    addProduct(formData)
    alert('제품이 추가되었습니다.')
    setFormData({
      name: '',
      type: 'IBC',
      standard: '',
    })
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="제품 추가">
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            품목명 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="input-field"
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
            className="input-field"
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
            className="input-field"
            placeholder="규격을 자유롭게 입력하세요"
          />
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
          >
            취소
          </button>
          <button
            type="submit"
            className="btn-success"
          >
            저장
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default AddProductModal

