import React, { useState, useRef } from 'react'
import Modal from './Modal'
import { useData } from '../contexts/DataContext'
import useEnterMove from '../hooks/useEnterMove'

const AddClientModal = ({ isOpen, onClose }) => {
  const { addClient } = useData()
  const formRef = useRef(null)

  const [formData, setFormData] = useState({
    company: '',
    contact_person: '',
    phone: '',
    email: '',
    status: '활성',
    contract_prices: [],
  })

  // 전역 엔터 네비게이션 적용
  useEnterMove({ formRef, enabled: isOpen })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formData.company.trim()) {
      alert('회사명을 입력해주세요.')
      return
    }

    addClient({
      ...formData,
      contract_prices: formData.contract_prices,
    })

    alert('고객이 추가되었습니다.')
    setFormData({
      company: '',
      contact_person: '',
      phone: '',
      email: '',
      status: '활성',
      contract_prices: [],
    })
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="고객 추가">
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            회사명 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.company}
            onChange={(e) => setFormData({ ...formData, company: e.target.value })}
            className="input-field"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">담당자</label>
          <input
            type="text"
            value={formData.contact_person}
            onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
            className="input-field"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">전화번호</label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="input-field"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">이메일</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="input-field"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">상태</label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            className="input-field"
          >
            <option value="활성">활성</option>
            <option value="대기">대기</option>
            <option value="비활성">비활성</option>
          </select>
        </div>


        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
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

export default AddClientModal

