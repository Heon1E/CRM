import React, { useState, useEffect, useRef } from 'react'
import Modal from './Modal'
import { useJsApiLoader } from '@react-google-maps/api'
import { useData } from '../contexts/DataContext'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Plus, X } from 'lucide-react'
import useEnterMove from '../hooks/useEnterMove'
import { showWarning, showSuccess, showError, showConfirm } from '../utils/alert'
import { formatKoreanPhone } from '../utils/phoneFormatter'
import { CLIENT_STATUS_OPTIONS } from '../utils/clientStatus'

const EditClientModal = ({ isOpen, onClose, clientId, client: clientProp, onDelete }) => {
  // 모든 Hook 선언을 최상단에 배치 (React Hooks 규칙 준수)
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  })
  const { clients, updateClient, deleteClient, products, fetchClientContacts } = useData()
  const { user } = useAuth()
  // Use provided client prop if available, otherwise find in context
  const client = clientProp || clients?.find((c) => c?.id === clientId)
  const formRef = useRef(null)

  const [formData, setFormData] = useState({
    company: '',
    phone: '',
    email: '',
    status: '신규',
    sales_rep: '',
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
          address: client?.address || '',
          address_detail: client?.address_detail || '',
          postal_code: client?.postal_code || '',
          latitude: client?.latitude || null,
          longitude: client?.longitude || null,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, clientId, isOpen])

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

  // 카카오 주소 검색 (Daum Postcode는 독립적)
  const handleAddressSearch = () => {
    if (!window.daum || !window.daum.Postcode) {
      alert('주소 검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.')
      return
    }

    new window.daum.Postcode({
      oncomplete: function (data) {
        const fullAddress = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress

        console.log('[Address Search] Selected:', fullAddress, data.zonecode)

        setFormData(prev => ({
          ...prev,
          address: fullAddress,
          postal_code: data.zonecode,
        }))

        // Google Geocoding API 사용
        if (isLoaded && window.google && window.google.maps) {
          try {
            const geocoder = new window.google.maps.Geocoder()
            geocoder.geocode({ address: fullAddress }, (results, status) => {
              if (status === 'OK' && results[0]) {
                const location = results[0].geometry.location
                console.log('[Geocoding] Success:', location.lat(), location.lng())

                setFormData(prev => ({
                  ...prev,
                  latitude: location.lat(),
                  longitude: location.lng(),
                }))
              } else {
                console.warn('[Geocoding] Failed:', status)
              }
            })
          } catch (error) {
            console.error('[Geocoding] Error:', error)
          }
        } else {
          console.warn('[Geocoding] Google Maps SDK not loaded')
        }
      }
    }).open()
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
    <Modal isOpen={isOpen} onClose={onClose} title={`CLIENT_DETAILS: ${client?.company || 'NEW_RECORD'}`} size="lg">
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 text-[11px]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="font-bold text-black uppercase tracking-tight">
              COMPANY_NAME:
            </label>
            <input
              type="text"
              value={formData.company || ''}
              onChange={(e) => setFormData({ ...formData, company: e.target.value || '' })}
              className="oracle-sunken px-2 py-0.5"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-bold text-black uppercase tracking-tight">
              SALES_REP_ID:
            </label>
            <select
              value={formData.sales_rep || ''}
              onChange={(e) => setFormData({ ...formData, sales_rep: e.target.value })}
              className="oracle-sunken px-2 py-0.5"
            >
              <option value="">(None)</option>
              {SALES_REP_OPTIONS.map((rep) => (
                <option key={rep} value={rep}>
                  {rep}
                </option>
              ))}
            </select>
          </div>

          {/* 주소 입력 섹션 */}
          <div className="col-span-1 md:col-span-2 oracle-raised bg-[#d0d0d0] p-2 space-y-2">
            <label className="font-bold text-black uppercase tracking-tight block border-b border-gray-400 pb-1 mb-2">주소</label>
            <div className="flex gap-2 items-center">
              <label className="w-20">우편번호</label>
              <input
                type="text"
                value={formData.postal_code}
                className="oracle-sunken w-24 bg-gray-100"
                readOnly
              />
              <button
                type="button"
                onClick={handleAddressSearch}
                className="oracle-raised bg-gray-200 px-3 py-0.5 hover:bg-gray-100"
              >
                BROWSE...
              </button>
            </div>
            <div className="flex gap-2 items-center">
              <label className="w-20">주소</label>
              <input
                type="text"
                value={formData.address}
                className="oracle-sunken flex-1 bg-gray-100"
                readOnly
              />
            </div>
            <div className="flex gap-2 items-center">
              <label className="w-20">상세주소</label>
              <input
                type="text"
                value={formData.address_detail}
                onChange={(e) => setFormData({ ...formData, address_detail: e.target.value })}
                className="oracle-sunken flex-1"
              />
            </div>
          </div>
        </div>

        {/* 담당자 관리 섹션 */}
        <div className="oracle-raised bg-[#d0d0d0] p-2 space-y-2">
          <div className="flex items-center justify-between border-b border-gray-400 pb-1 mb-2">
            <label className="font-bold text-black uppercase tracking-tight">담당자</label>
            <button
              type="button"
              onClick={handleAddContact}
              className="oracle-raised bg-gray-200 px-2 py-0.5 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              <span>담당자 추가</span>
            </button>
          </div>

          <div className="space-y-1 max-h-[160px] overflow-auto oracle-sunken bg-white p-1">
            <table className="w-full text-[10px] border-collapse">
              <thead className="bg-gray-200 sticky top-0">
                <tr>
                  <th className="w-6">KM</th>
                  <th>이름</th>
                  <th>직급</th>
                  <th>전화</th>
                  <th>이메일</th>
                  <th className="w-6">삭제</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact, index) => (
                  <tr key={index} className="border-b border-gray-100">
                    <td className="p-1 text-center">
                      <input
                        type="checkbox"
                        checked={contact.is_primary || false}
                        onChange={(e) => handleContactChange(index, 'is_primary', e.target.checked)}
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        value={contact.name || ''}
                        onChange={(e) => handleContactChange(index, 'name', e.target.value)}
                        className="w-full border-none outline-none bg-transparent"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        value={contact.department_role || ''}
                        onChange={(e) => handleContactChange(index, 'department_role', e.target.value)}
                        className="w-full border-none outline-none bg-transparent"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="tel"
                        value={contact.phone || ''}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^\d-]/g, '')
                          handleContactChange(index, 'phone', value)
                        }}
                        onBlur={() => handleContactPhoneBlur(index)}
                        className="w-full border-none outline-none bg-transparent"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="email"
                        value={contact.email || ''}
                        onChange={(e) => handleContactChange(index, 'email', e.target.value)}
                        className="w-full border-none outline-none bg-transparent"
                      />
                    </td>
                    <td className="p-1 text-center">
                      {contacts.length > 1 && (
                        <button type="button" onClick={() => handleRemoveContact(index)} className="text-red-600 font-bold">×</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-bold text-black uppercase tracking-tight">CLIENT_STATUS:</label>
          <select
            value={formData.status || '신규'}
            onChange={(e) => setFormData({ ...formData, status: e.target.value || '신규' })}
            className="oracle-sunken px-2 py-0.5"
          >
            {CLIENT_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>

        {/* 계약 단가 관리 섹션 */}
        <div className="oracle-raised bg-[#d0d0d0] p-2 space-y-2">
          <label className="font-bold text-black uppercase tracking-tight block border-b border-gray-400 pb-1 mb-2">계약 단가</label>

          <div className="bg-white p-2 oracle-sunken space-y-2">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-[9px] font-bold">품목 고르기</label>
                <select
                  value={newContractPrice.productId || ''}
                  onChange={(e) => setNewContractPrice({ ...newContractPrice, productId: e.target.value || '' })}
                  className="w-full border border-gray-300 outline-none h-6 px-1"
                >
                  <option value="">-- Choose --</option>
                  {Array.isArray(availableProducts) && availableProducts.map((product) => (
                    <option key={product?.id} value={product?.id || ''}>
                      {product?.name || ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-24">
                <label className="block text-[9px] font-bold">단가</label>
                <input
                  type="number"
                  value={newContractPrice.price || ''}
                  onChange={(e) => setNewContractPrice({ ...newContractPrice, price: e.target.value || '' })}
                  className="w-full border border-gray-300 outline-none h-6 px-1"
                  min="0"
                />
              </div>
              <button
                type="button"
                onClick={handleAddContractPrice}
                className="oracle-raised bg-gray-200 px-3 h-6 text-[10px] uppercase font-bold"
              >
                Add
              </button>
            </div>

            {currentPrices.length > 0 && (
              <div className="mt-2 border-t border-gray-200 pt-2 space-y-1">
                {currentPrices.filter(cp => cp?.productId).map((cp) => {
                  const product = Array.isArray(products) ? products.find((p) => p?.id === cp?.productId) : null
                  return (
                    <div key={cp?.productId} className="flex items-center justify-between border-b border-gray-100 pb-1">
                      <span className="font-bold w-40 truncate">{product?.name || 'UNKNOWN'}</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={cp?.price || 0}
                          onChange={(e) => handleUpdateContractPrice(cp?.productId, e.target.value || '0')}
                          className="w-16 border border-gray-300 outline-none px-1 text-right"
                        />
                        <button type="button" onClick={() => handleRemoveContractPrice(cp?.productId)} className="text-red-600 font-bold px-1">×</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-between pt-2 border-t border-gray-400">
          <button
            type="button"
            onClick={handleDelete}
            className="oracle-raised bg-[#808080] text-red-100 px-3 py-1 font-bold hover:bg-red-800"
          >
            DELETE_RECORD
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="oracle-raised bg-gray-200 px-4 py-1 hover:bg-gray-100"
            >
              EXIT
            </button>
            <button
              type="submit"
              className="oracle-raised bg-blue-800 text-white px-6 py-1 font-bold hover:bg-blue-700"
            >
              저장
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

export default EditClientModal




