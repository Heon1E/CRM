import React, { useState, useEffect, useRef } from 'react'
import Modal from './Modal'
import { useData } from '../contexts/DataContext'
import { supabase } from '../lib/supabase'
import { loadKakaoMaps, geocodeAddress } from '../utils/kakaoMap'
import { useAuth } from '../contexts/AuthContext'
import { Plus, X } from 'lucide-react'
import useEnterMove from '../hooks/useEnterMove'
import { showWarning, showSuccess, showError, showConfirm } from '../utils/alert'
import { formatKoreanPhone } from '../utils/phoneFormatter'
import { CLIENT_STATUS_OPTIONS } from '../utils/clientStatus'

/*
 * 예전에는 회색 돋움 테두리(oracle-raised · #d0d0d0 · #808080) + 9~11px 글씨 +
 * `BROWSE...`·`EXIT`·`Add`·`DELETE_RECORD`·`KM` 같은 영어 단추였다 — 'PC 업무
 * 프로그램' 방향의 잔재다. 담당자 표는 10px 글씨에 테두리 없는 칸이라 어디에
 * 적는지조차 안 보였다. 앱의 다른 입력 창과 같은 모양으로 맞춘다.
 */
// 컴포넌트 바깥에 둔다 — 안에 두면 그릴 때마다 새 타입이 되어 입력칸이 포커스를 잃는다.
const Label = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="block text-[13px] font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
    {children}
  </label>
)
const Section = ({ title, action, children }) => (
  <section className="rounded-lg border border-oem-border p-4 space-y-3">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-extrabold" style={{ color: 'var(--ind-ink)' }}>{title}</h3>
      {action}
    </div>
    {children}
  </section>
)

const EditClientModal = ({ isOpen, onClose, clientId, client: clientProp, onDelete }) => {
  // 모든 Hook 선언을 최상단에 배치 (React Hooks 규칙 준수)
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
    <Modal isOpen={isOpen} onClose={onClose} title={client?.company ? `거래처 수정 · ${client.company}` : '새 거래처'} size="lg">
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="ec-company">회사명</Label>
            <input
              id="ec-company"
              type="text"
              value={formData.company || ''}
              onChange={(e) => setFormData({ ...formData, company: e.target.value || '' })}
              className="w-full"
              required
            />
          </div>
          <div>
            <Label htmlFor="ec-rep">담당 영업사원</Label>
            <select
              id="ec-rep"
              value={formData.sales_rep || ''}
              onChange={(e) => setFormData({ ...formData, sales_rep: e.target.value })}
              className="w-full"
            >
              <option value="">지정 안 함</option>
              {SALES_REP_OPTIONS.map((rep) => (
                <option key={rep} value={rep}>
                  {rep}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="ec-status">상태</Label>
            <select
              id="ec-status"
              value={formData.status || '신규'}
              onChange={(e) => setFormData({ ...formData, status: e.target.value || '신규' })}
              className="w-full"
            >
              {CLIENT_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>

        <Section title="주소">
          <div className="flex gap-2">
            <input
              type="text"
              value={formData.postal_code || ''}
              placeholder="우편번호"
              aria-label="우편번호"
              className="w-28"
              style={{ background: 'var(--bg-subtle)' }}
              readOnly
            />
            <button type="button" onClick={handleAddressSearch} className="oem-btn-secondary">
              주소 찾기
            </button>
          </div>
          <input
            type="text"
            value={formData.address || ''}
            placeholder="'주소 찾기'로 고르면 채워집니다"
            aria-label="주소"
            className="w-full"
            style={{ background: 'var(--bg-subtle)' }}
            readOnly
          />
          <input
            type="text"
            value={formData.address_detail || ''}
            onChange={(e) => setFormData({ ...formData, address_detail: e.target.value })}
            placeholder="상세주소 (동·호수 등)"
            aria-label="상세주소"
            className="w-full"
          />
        </Section>

        <Section
          title={`담당자 ${contacts.length}명`}
          action={
            <button type="button" onClick={handleAddContact} className="oem-btn-secondary inline-flex items-center gap-1">
              <Plus className="w-4 h-4" />
              담당자 추가
            </button>
          }
        >
          <div className="space-y-2">
            {contacts.map((contact, index) => (
              <div key={index} className="rounded-md p-3 grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_1.4fr_auto] gap-2 items-center"
                style={{ background: contact.is_primary ? 'var(--bg-header)' : 'transparent', border: '1px solid var(--border-light)' }}>
                <input
                  type="text"
                  value={contact.name || ''}
                  onChange={(e) => handleContactChange(index, 'name', e.target.value)}
                  placeholder="이름"
                  aria-label="이름"
                  className="w-full"
                />
                <input
                  type="text"
                  value={contact.department_role || ''}
                  onChange={(e) => handleContactChange(index, 'department_role', e.target.value)}
                  placeholder="직급"
                  aria-label="직급"
                  className="w-full"
                />
                <input
                  type="tel"
                  value={contact.phone || ''}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^\d-]/g, '')
                    handleContactChange(index, 'phone', value)
                  }}
                  onBlur={() => handleContactPhoneBlur(index)}
                  placeholder="전화"
                  aria-label="전화"
                  className="w-full"
                />
                <input
                  type="email"
                  value={contact.email || ''}
                  onChange={(e) => handleContactChange(index, 'email', e.target.value)}
                  placeholder="이메일"
                  aria-label="이메일"
                  className="w-full"
                />
                <div className="flex items-center justify-end gap-1">
                  <label className="tap-box inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap cursor-pointer">
                    <input
                      type="checkbox"
                      checked={contact.is_primary || false}
                      onChange={(e) => handleContactChange(index, 'is_primary', e.target.checked)}
                    />
                    대표
                  </label>
                  {contacts.length > 1 && (
                    <button type="button" onClick={() => handleRemoveContact(index)}
                      className="icon-btn icon-btn-danger" aria-label={`담당자 ${index + 1} 빼기`} title="빼기">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="계약 단가">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[180px]">
              <Label htmlFor="ec-cp-product">품목</Label>
              <select
                id="ec-cp-product"
                value={newContractPrice.productId || ''}
                onChange={(e) => setNewContractPrice({ ...newContractPrice, productId: e.target.value || '' })}
                className="w-full"
              >
                <option value="">품목을 고르세요</option>
                {Array.isArray(availableProducts) && availableProducts.map((product) => (
                  <option key={product?.id} value={product?.id || ''}>
                    {product?.name || ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-32">
              <Label htmlFor="ec-cp-price">단가 (원)</Label>
              <input
                id="ec-cp-price"
                type="number"
                value={newContractPrice.price || ''}
                onChange={(e) => setNewContractPrice({ ...newContractPrice, price: e.target.value || '' })}
                className="w-full text-right"
                min="0"
              />
            </div>
            <button type="button" onClick={handleAddContractPrice} className="oem-btn-secondary">
              추가
            </button>
          </div>

          {currentPrices.length > 0 ? (
            <ul className="divide-y" style={{ borderTop: '1px solid var(--border-light)' }}>
              {currentPrices.filter(cp => cp?.productId).map((cp) => {
                const product = Array.isArray(products) ? products.find((p) => p?.id === cp?.productId) : null
                return (
                  <li key={cp?.productId} className="flex items-center justify-between gap-3 py-2" style={{ borderColor: 'var(--border-light)' }}>
                    <span className="font-bold truncate">{product?.name || '(지운 품목)'}</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={cp?.price || 0}
                        onChange={(e) => handleUpdateContractPrice(cp?.productId, e.target.value || '0')}
                        aria-label={`${product?.name || '품목'} 단가`}
                        className="w-28 text-right num"
                      />
                      <button type="button" onClick={() => handleRemoveContractPrice(cp?.productId)}
                        className="icon-btn icon-btn-danger" aria-label="단가 빼기" title="빼기">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              정해 둔 단가가 없습니다. 품목을 고르고 단가를 적어 추가하세요.
            </p>
          )}
        </Section>

        <div className="flex justify-between gap-2 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button type="button" onClick={handleDelete} className="btn-danger">
            거래처 삭제
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="oem-btn-secondary">
              닫기
            </button>
            <button type="submit" className="oem-btn-primary px-6">
              저장
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

export default EditClientModal




