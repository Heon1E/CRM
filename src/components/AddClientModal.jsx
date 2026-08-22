import React, { useState, useRef } from 'react'
import Modal from './Modal'
import { useData } from '../contexts/DataContext'
import useEnterMove from '../hooks/useEnterMove'
import { showWarning, showSuccess, showError } from '../utils/alert'
import { formatKoreanPhone } from '../utils/phoneFormatter'
import { Plus, X } from 'lucide-react'
import { CLIENT_STATUS_OPTIONS } from '../utils/clientStatus'
import { loadKakaoMaps, geocodeAddress } from '../utils/kakaoMap'

const AddClientModal = ({ isOpen, onClose, initialData = null }) => {
  const { addClient } = useData()
  const formRef = useRef(null)

  const [formData, setFormData] = useState({
    company: '',
    phone: '',
    email: '',
    status: '신규',
    sales_rep: '', // Sales Rep 필드 추가
    address: '',
    address_detail: '',
    postal_code: '',
    latitude: null,
    longitude: null,
    contract_prices: [],
  })

  // Sales Rep 옵션
  const SALES_REP_OPTIONS = ['박민철', '송원기', '이헌일']

  // 담당자 목록 (동적 배열)
  const [contacts, setContacts] = useState([
    { name: '', department_role: '', phone: '', email: '', is_primary: false }
  ])

  // 전역 엔터 네비게이션 적용
  useEnterMove({ formRef, enabled: isOpen })

  // 모달이 열릴 때 initialData가 있으면 폼에 채우기 (initialData 변경 시 즉시 반영)
  React.useEffect(() => {
    if (isOpen && initialData) {
      // 회사명만 있어도 폼이 정상적으로 열리고 등록 준비 상태가 되어야 함
      // initialData의 모든 필드를 안전하게 처리 (null, undefined 대응)
      setFormData({
        company: String(initialData.company || '').trim(),
        phone: String(initialData.phone || '').trim(),
        email: String(initialData.email || '').trim(),
        status: initialData.status || '신규',
        sales_rep: initialData.sales_rep || '',
        address: String(initialData.address || '').trim(),
        address_detail: String(initialData.address_detail || '').trim(),
        postal_code: String(initialData.postal_code || '').trim(),
        latitude: initialData.latitude || null,
        longitude: initialData.longitude || null,
        contract_prices: Array.isArray(initialData.contract_prices) ? initialData.contract_prices : [],
      })

      // 담당자 정보가 있으면 contacts에 추가, 없어도 빈 배열로 등록 가능
      if (initialData.contact_person || initialData.position) {
        setContacts([{
          name: String(initialData.contact_person || '').trim(),
          department_role: String(initialData.position || '').trim(),
          phone: String(initialData.phone || '').trim(),
          email: String(initialData.email || '').trim(),
          is_primary: true, // 명함 스캔으로 추가된 담당자는 대표 담당자로 설정
        }])
      } else {
        // 담당자 정보가 없어도 빈 배열로 등록 가능 (회사명만 있어도 등록 가능)
        setContacts([{ name: '', department_role: '', phone: '', email: '', is_primary: false }])
      }
    } else if (!isOpen) {
      // 모달이 닫힐 때 상태 초기화
      setFormData({
        company: '',
        phone: '',
        email: '',
        status: '신규',
        address: '',
        address_detail: '',
        postal_code: '',
        latitude: null,
        longitude: null,
        contract_prices: [],
      })
      setContacts([{ name: '', department_role: '', phone: '', email: '', is_primary: false }])
    }
  }, [isOpen, initialData])

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

  // 카카오 주소 검색 (Daum Postcode는 독립적)
  const handleAddressSearch = () => {
    if (!window.daum || !window.daum.Postcode) {
      alert('주소 검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.')
      return
    }

    new window.daum.Postcode({
      oncomplete: function (data) {
        // 도로명 주소 또는 지번 주소 선택
        const fullAddress = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress

        console.log('[Address Search] Selected:', fullAddress, data.zonecode)

        setFormData(prev => ({
          ...prev,
          address: fullAddress,
          postal_code: data.zonecode,
        }))

        // Google Geocoding API 사용
        /*
         * 주소 → 좌표. **카카오로 옮겼다** (구글은 결제 수단이 있어야 켜진다).
         * 실패해도 저장을 막지 않는다 — 주소만 있으면 지도에서 나중에
         * '주소 좌표 채우기'로 한 번에 채울 수 있다.
         */
        loadKakaoMaps()
          .then((maps) => geocodeAddress(maps, fullAddress))
          .then((p) => { if (p) setFormData(prev => ({ ...prev, latitude: p.lat, longitude: p.lng })) })
          .catch(() => { /* 키가 없거나 못 불러왔다. 주소는 이미 채워졌다. */ })
      }
    }).open()
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
        sales_rep: formData.sales_rep || null,
        address: formData.address || null,
        address_detail: formData.address_detail || null,
        postal_code: formData.postal_code || null,
        latitude: formData.latitude,
        longitude: formData.longitude,
        contract_prices: Array.isArray(formData.contract_prices) ? formData.contract_prices : [],
        contacts: validContacts,
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
        address: '',
        address_detail: '',
        postal_code: '',
        latitude: null,
        longitude: null,
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              회사명 <span className="text-red-400">*</span>
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
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              담당자 (Sales Rep)
            </label>
            <select
              value={formData.sales_rep || ''}
              onChange={(e) => setFormData({ ...formData, sales_rep: e.target.value })}
              className="input-field"
            >
              <option value="">선택 안 함</option>
              {SALES_REP_OPTIONS.map((rep) => (
                <option key={rep} value={rep}>
                  {rep}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 주소 입력 섹션 */}
        <div className="border-t border-gray-200 pt-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">주소</label>
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={formData.postal_code}
                onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                placeholder="우편번호"
                className="input-field w-32"
              />
              <button
                type="button"
                onClick={handleAddressSearch}
                className="px-4 py-2 bg-oem-blue text-white rounded-lg hover:bg-oem-blue-dark transition-colors text-sm font-medium"
              >
                주소 검색
              </button>
            </div>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="기본 주소"
              className="input-field"
            />
            <input
              type="text"
              value={formData.address_detail}
              onChange={(e) => setFormData({ ...formData, address_detail: e.target.value })}
              placeholder="상세 주소 (건물명, 층, 호수 등)"
              className="input-field"
            />
          </div>
        </div>

        {/* 담당자 관리 섹션 */}
        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-semibold text-gray-700">담당자</label>
            <button
              type="button"
              onClick={handleAddContact}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-oem-grey-light text-oem-blue hover:bg-oem-grey-light rounded-md transition-colors"
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
                      className="text-red-400 hover:text-red-300 transition-colors"
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
                      className="w-4 h-4 text-oem-blue border-gray-300 rounded focus:ring-oem-blue"
                    />
                    <span className="text-xs font-medium text-oem-blue">Key-man (주요 연락처)</span>
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
            {CLIENT_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>


        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary px-4 py-2.5 font-medium"
          >
            취소
          </button>
          <button
            type="submit"
            className="btn px-4 py-2.5 bg-oem-blue text-white hover:bg-oem-blue-dark font-medium"
          >
            저장
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default AddClientModal





