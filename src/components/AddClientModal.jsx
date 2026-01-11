import React, { useState, useRef } from 'react'
import Modal from './Modal'
import { useData } from '../contexts/DataContext'
import useEnterMove from '../hooks/useEnterMove'
import { showWarning, showSuccess, showError } from '../utils/alert'
import { formatKoreanPhone } from '../utils/phoneFormatter'
import { Plus, X } from 'lucide-react'

const AddClientModal = ({ isOpen, onClose }) => {
  const { addClient } = useData()
  const formRef = useRef(null)

  const [formData, setFormData] = useState({
    company: '',
    phone: '',
    email: '',
    status: '신규',
    contract_prices: [],
  })

  // 담당자 목록 (동적 배열)
  const [contacts, setContacts] = useState([
    { name: '', department_role: '', phone: '', email: '', is_primary: false }
  ])

  // 전역 엔터 네비게이션 적용
  useEnterMove({ formRef, enabled: isOpen })

  // 모달이 닫힐 때 상태 초기화
  React.useEffect(() => {
    if (!isOpen) {
      setFormData({
        company: '',
        phone: '',
        email: '',
        status: '신규',
        contract_prices: [],
      })
      setContacts([{ name: '', department_role: '', phone: '', email: '', is_primary: false }])
    }
  }, [isOpen])

  // 담당자 추가
  const handleAddContact = () => {
    setContacts([...contacts, { name: '', department_role: '', phone: '', email: '', is_primary: false }])
  }

  // 담당자 삭제
  const handleRemoveContact = (index) => {
    if (contacts.length > 1) {
      setContacts(contacts.filter((_, i) => i !== index))
    }
  }

  // 담당자 정보 업데이트
  const handleContactChange = (index, field, value) => {
    const updatedContacts = [...contacts]
    
    // Key-man 체크박스 처리: 한 명만 Key-man이 될 수 있도록
    if (field === 'is_primary' && value === true) {
      // 다른 모든 담당자의 is_primary를 false로 설정
      updatedContacts.forEach((contact, i) => {
        if (i !== index) {
          contact.is_primary = false
        }
      })
    }
    
    updatedContacts[index] = { ...updatedContacts[index], [field]: value }
    setContacts(updatedContacts)
  }

  // 전화번호 포맷팅 (onBlur)
  const handleContactPhoneBlur = (index) => {
    const contact = contacts[index]
    if (contact.phone) {
      const formatted = formatKoreanPhone(contact.phone)
      handleContactChange(index, 'phone', formatted)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.company.trim()) {
      await showWarning('회사명을 입력해주세요.')
      return
    }

    try {
      // 담당자 목록에서 이름이 있는 것만 필터링
      const validContacts = contacts.filter(contact => contact.name.trim())
      
      // DB 스키마와 일치하는 데이터 객체 생성 (snake_case 확인)
      const clientData = {
        company: formData.company || '',
        status: formData.status || '신규',
        contract_prices: Array.isArray(formData.contract_prices) ? formData.contract_prices : [],
        contacts: validContacts, // 담당자 목록 전달 (별도 처리)
      }
      
      // 디버깅: 전송 전 최종 확인
      console.log('[AddClientModal] 전송될 데이터 (최종 검증):', clientData)
      console.log('[AddClientModal] 담당자 데이터:', validContacts)
      
      await addClient(clientData)

      await showSuccess('고객이 추가되었습니다.')
      setFormData({
        company: '',
        phone: '',
        email: '',
        status: '신규',
        contract_prices: [],
      })
      setContacts([{ name: '', department_role: '', phone: '', email: '', is_primary: false }])
      onClose()
    } catch (error) {
      console.error('고객 추가 중 오류:', error)
      await showError(error.message || '고객 추가 중 알 수 없는 오류가 발생했습니다.')
    }
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

        {/* 담당자 관리 섹션 */}
        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-semibold text-gray-700">담당자</label>
            <button
              type="button"
              onClick={handleAddContact}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>담당자 추가</span>
            </button>
          </div>

          <div className="space-y-3">
            {contacts.map((contact, index) => (
              <div key={index} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-medium text-gray-600">담당자 {index + 1}</span>
                  {contacts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveContact(index)}
                      className="text-red-500 hover:text-red-700 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="mb-3">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={contact.is_primary || false}
                      onChange={(e) => handleContactChange(index, 'is_primary', e.target.checked)}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <span className="text-xs font-medium text-indigo-600">Key-man (주요 연락처)</span>
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">이름</label>
                    <input
                      type="text"
                      value={contact.name}
                      onChange={(e) => handleContactChange(index, 'name', e.target.value)}
                      className="input-field text-sm"
                      placeholder="이름"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">부서/직책</label>
                    <input
                      type="text"
                      value={contact.department_role}
                      onChange={(e) => handleContactChange(index, 'department_role', e.target.value)}
                      className="input-field text-sm"
                      placeholder="부서/직책"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">연락처</label>
                    <input
                      type="tel"
                      value={contact.phone}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^\d-]/g, '')
                        handleContactChange(index, 'phone', value)
                      }}
                      onBlur={() => handleContactPhoneBlur(index)}
                      className="input-field text-sm"
                      placeholder="예: 010-1234-5678"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">이메일</label>
                    <input
                      type="email"
                      value={contact.email}
                      onChange={(e) => handleContactChange(index, 'email', e.target.value)}
                      className="input-field text-sm"
                      placeholder="이메일"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">상태</label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            className="input-field"
          >
            <option value="매출">매출</option>
            <option value="신규">신규</option>
            <option value="단절">단절</option>
          </select>
        </div>


        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary px-4 py-2.5 font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn px-4 py-2.5 bg-blue-600 text-white hover:bg-blue-700 font-medium"
          >
            Save
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default AddClientModal

