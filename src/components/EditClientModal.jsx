import React, { useState, useEffect, useRef } from 'react'
import Modal from './Modal'
import { useData } from '../contexts/DataContext'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Plus, X } from 'lucide-react'
import useEnterMove from '../hooks/useEnterMove'
import { showWarning, showSuccess, showError, showConfirm } from '../utils/alert'
import { formatKoreanPhone } from '../utils/phoneFormatter'

const EditClientModal = ({ isOpen, onClose, clientId, onDelete }) => {
  // 모든 Hook 선언을 최상단에 배치 (React Hooks 규칙 준수)
  const { clients, updateClient, deleteClient, products, fetchClientContacts } = useData()
  const { user } = useAuth()
  const client = clients?.find((c) => c?.id === clientId)
  const formRef = useRef(null)

  const [formData, setFormData] = useState({
    company: '',
    phone: '',
    email: '',
    status: '신규',
    sales_rep: '', // Sales Rep 필드 추가
    contract_prices: [],
  })

  // Sales Rep 옵션
  const SALES_REP_OPTIONS = ['박민철', '송원기', '이헌일']

  // 담당자 목록 (동적 배열)
  const [contacts, setContacts] = useState([
    { name: '', department_role: '', phone: '', email: '', is_primary: false }
  ])

  const [newContractPrice, setNewContractPrice] = useState({
    productId: '',
    price: '',
  })

  // clientId나 client가 변경될 때마다 폼 초기화 (.cursorrules 규칙: 모달 재오픈 시 폼 상태 초기화)
  useEffect(() => {
    const loadClientData = async () => {
      if (client && clientId) {
        setFormData({
          company: client?.company || '',
          phone: client?.phone || '',
          email: client?.email || '',
          status: client?.status || '신규',
          sales_rep: client?.sales_rep || '',
          contract_prices: Array.isArray(client?.contract_prices) ? client.contract_prices : [],
        })
        // 계약 단가 입력 필드도 초기화
        setNewContractPrice({ productId: '', price: '' })

        // 기존 담당자 목록 불러오기
        try {
          const existingContacts = await fetchClientContacts(clientId)
          if (existingContacts && existingContacts.length > 0) {
            setContacts(existingContacts.map(contact => ({
              name: contact.name || '',
              department_role: contact.department_role || '',
              phone: contact.phone || '',
              email: contact.email || '',
              is_primary: contact.is_primary === true || contact.is_primary === 'true' || false,
            })))
          } else {
            // 데이터 마이그레이션: client_contacts가 없는데 clients 테이블의 contact_person, phone, email 필드에 데이터가 있으면 자동으로 client_contacts로 옮기기
            const contactPerson = client?.contact_person
            const clientPhone = client?.phone
            const clientEmail = client?.email
            
            if (contactPerson && (contactPerson.trim() || clientPhone || clientEmail)) {
              try {
                const userId = user?.id || (await supabase.auth.getUser()).data?.user?.id
                if (userId) {
                  const { error: migrationError } = await supabase
                    .from('client_contacts')
                    .insert([{
                      client_id: clientId,
                      name: contactPerson || '',
                      department_role: '',
                      phone: clientPhone || '',
                      email: clientEmail || '',
                      is_primary: true,
                      created_by: userId
                    }])
                  
                  if (!migrationError) {
                    // 마이그레이션 성공 후 다시 담당자 목록 불러오기
                    const migratedContacts = await fetchClientContacts(clientId)
                    if (migratedContacts && migratedContacts.length > 0) {
                      setContacts(migratedContacts.map(contact => ({
                        name: contact.name || '',
                        department_role: contact.department_role || '',
                        phone: contact.phone || '',
                        email: contact.email || '',
                        is_primary: contact.is_primary === true || contact.is_primary === 'true' || false,
                      })))
                    } else {
                      setContacts([{ name: '', department_role: '', phone: '', email: '', is_primary: false }])
                    }
                  } else {
                    console.error('담당자 마이그레이션 오류:', migrationError)
                    setContacts([{ name: '', department_role: '', phone: '', email: '', is_primary: false }])
                  }
                } else {
                  setContacts([{ name: '', department_role: '', phone: '', email: '', is_primary: false }])
                }
              } catch (migrationErr) {
                console.error('담당자 마이그레이션 중 오류:', migrationErr)
                setContacts([{ name: '', department_role: '', phone: '', email: '', is_primary: false }])
              }
            } else {
              // 담당자가 없으면 빈 한 줄
              setContacts([{ name: '', department_role: '', phone: '', email: '', is_primary: false }])
            }
          }
        } catch (error) {
          console.error('담당자 목록 불러오기 오류:', error)
          setContacts([{ name: '', department_role: '', phone: '', email: '', is_primary: false }])
        }
      } else if (!isOpen) {
        // 모달이 닫힐 때도 폼 초기화 (.cursorrules 규칙 준수)
        setFormData({
          company: '',
          phone: '',
          email: '',
          status: '신규',
          sales_rep: '',
          contract_prices: [],
        })
        setContacts([{ name: '', department_role: '', phone: '', email: '', is_primary: false }])
        setNewContractPrice({ productId: '', price: '' })
      }
    }

    loadClientData()
  }, [client, clientId, isOpen, fetchClientContacts])

  // 전역 엔터 네비게이션 적용
  useEnterMove({ formRef, enabled: isOpen })

  // Guard Clause: client가 없으면 아무것도 렌더링하지 않음 (.cursorrules 규칙 준수)
  // 모든 Hook 선언이 끝난 후에 조기 리턴
  if (!isOpen || !clientId || !client) {
    return null
  }

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
    if (!clientId || !client) {
      await showError('고객 정보를 찾을 수 없습니다.')
      onClose()
      return
    }
    if (!formData.company?.trim()) {
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
        sales_rep: formData.sales_rep || null, // Sales Rep 필드 추가
        contract_prices: Array.isArray(formData.contract_prices) ? formData.contract_prices : [],
        contacts: validContacts, // 담당자 목록 전달 (별도 처리)
      }
      
      // 디버깅: 전송 전 최종 확인
      console.log('[EditClientModal] 전송될 데이터 (최종 검증):', clientData)
      console.log('[EditClientModal] 담당자 데이터:', validContacts)
      
      await updateClient(clientId, clientData)
      await showSuccess('고객 정보가 수정되었습니다.')
      onClose()
    } catch (error) {
      console.error('고객 수정 중 오류:', error)
      await showError('고객 정보 수정 중 오류가 발생했습니다.')
    }
  }

  const handleDelete = async () => {
    if (!clientId || !client) {
      await showError('고객 정보를 찾을 수 없습니다.')
      onClose()
      return
    }
    const confirmed = await showConfirm(
      '이 고객 정보가 영구적으로 삭제되며, 관련된 모든 활동 내역도 함께 삭제됩니다.',
      '정말 삭제하시겠습니까?',
      '삭제',
      '취소'
    )
    if (confirmed) {
      try {
        await deleteClient(clientId)
        await showSuccess('고객이 삭제되었습니다.')
        onClose()
      } catch (error) {
        console.error('고객 삭제 중 오류:', error)
        await showError('고객 삭제 중 오류가 발생했습니다.')
      }
    }
  }

  const handleAddContractPrice = async () => {
    if (!newContractPrice?.productId) {
      await showWarning('제품을 선택해주세요.')
      return
    }
    if (!newContractPrice?.price || parseFloat(newContractPrice.price) <= 0) {
      await showWarning('단가를 입력해주세요.')
      return
    }

    // 이미 등록된 제품인지 확인
    const currentPrices = Array.isArray(formData.contract_prices) ? formData.contract_prices : []
    if (currentPrices.some((cp) => cp?.productId === newContractPrice.productId)) {
      await showWarning('이미 등록된 제품입니다.')
      return
    }

    setFormData({
      ...formData,
      contract_prices: [
        ...currentPrices,
        {
          productId: newContractPrice.productId,
          price: parseFloat(newContractPrice.price),
        },
      ],
    })

    setNewContractPrice({ productId: '', price: '' })
  }

  const handleRemoveContractPrice = (productId) => {
    const currentPrices = Array.isArray(formData.contract_prices) ? formData.contract_prices : []
    setFormData({
      ...formData,
      contract_prices: currentPrices.filter((cp) => cp?.productId !== productId),
    })
  }

  const handleUpdateContractPrice = (productId, newPrice) => {
    const currentPrices = Array.isArray(formData.contract_prices) ? formData.contract_prices : []
    setFormData({
      ...formData,
      contract_prices: currentPrices.map((cp) =>
        cp?.productId === productId ? { ...cp, price: parseFloat(newPrice || 0) } : cp
      ),
    })
  }

  // 이미 등록된 제품 ID 목록
  const currentPrices = Array.isArray(formData.contract_prices) ? formData.contract_prices : []
  const registeredProductIds = currentPrices.map((cp) => cp?.productId).filter(Boolean)
  const availableProducts = Array.isArray(products) 
    ? products.filter((p) => p?.id && !registeredProductIds.includes(p.id))
    : []

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="고객 정보 수정" size="lg">
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              회사명 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.company || ''}
              onChange={(e) => setFormData({ ...formData, company: e.target.value || '' })}
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
                      value={contact.name || ''}
                      onChange={(e) => handleContactChange(index, 'name', e.target.value)}
                      className="input-field text-sm"
                      placeholder="이름"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">부서/직책</label>
                    <input
                      type="text"
                      value={contact.department_role || ''}
                      onChange={(e) => handleContactChange(index, 'department_role', e.target.value)}
                      className="input-field text-sm"
                      placeholder="부서/직책"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">연락처</label>
                    <input
                      type="tel"
                      value={contact.phone || ''}
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
                      value={contact.email || ''}
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
          <label className="block text-sm font-medium text-gray-700 mb-1">상태</label>
          <select
            value={formData.status || '신규'}
            onChange={(e) => setFormData({ ...formData, status: e.target.value || '신규' })}
            className="input-field"
          >
            <option value="매출">매출</option>
            <option value="신규">신규</option>
            <option value="단절">단절</option>
          </select>
        </div>

        {/* 계약 단가 관리 섹션 */}
        <div className="border-t border-gray-200 pt-4 mt-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">계약 단가 관리</h3>
          
          {/* 계약 단가 추가 */}
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">제품 선택</label>
                <select
                  value={newContractPrice.productId || ''}
                  onChange={(e) => setNewContractPrice({ ...newContractPrice, productId: e.target.value || '' })}
                  className="input-field text-sm"
                >
                  <option value="">제품 선택</option>
                  {Array.isArray(availableProducts) && availableProducts.map((product) => (
                    <option key={product?.id} value={product?.id || ''}>
                      {product?.name || ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">단가 (원)</label>
                <input
                  type="number"
                  value={newContractPrice.price || ''}
                  onChange={(e) => setNewContractPrice({ ...newContractPrice, price: e.target.value || '' })}
                  className="input-field text-sm"
                  placeholder="단가 입력"
                  min="0"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleAddContractPrice}
                  className="btn-success flex items-center justify-center space-x-1 text-sm px-4 py-2 h-full"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add</span>
                </button>
              </div>
            </div>
          </div>

          {/* 등록된 계약 단가 리스트 */}
          {currentPrices.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-700 mb-2">등록된 계약 단가</p>
              {Array.isArray(currentPrices) && currentPrices
                .filter((cp) => cp != null && cp?.productId) // null/undefined 제거
                .map((cp) => {
                  if (!cp?.productId) return null
                  const product = Array.isArray(products) 
                    ? products.find((p) => p?.id === cp?.productId)
                    : null
                  return (
                    <div key={cp?.productId} className="flex items-center justify-between bg-white border border-border-light rounded-card p-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{product?.name || '알 수 없음'}</p>
                      </div>
                      <div className="flex items-center space-x-3">
                        <input
                          type="number"
                          value={cp?.price || 0}
                          onChange={(e) => handleUpdateContractPrice(cp?.productId, e.target.value || '0')}
                          className="w-32 px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all text-sm"
                          min="0"
                        />
                        <span className="text-sm text-gray-500">원</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveContractPrice(cp?.productId)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>

        <div className="flex justify-between pt-4">
          <button
            type="button"
            onClick={handleDelete}
            className="btn px-4 py-2.5 bg-red-400/20 text-red-200 border border-red-400/30 hover:bg-red-400/30 font-medium"
          >
            삭제
          </button>
          <div className="space-x-3">
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
        </div>
      </form>
    </Modal>
  )
}

export default EditClientModal




