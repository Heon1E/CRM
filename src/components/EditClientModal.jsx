import React, { useState, useEffect, useRef } from 'react'
import Modal from './Modal'
import { useData } from '../contexts/DataContext'
import { Plus, X } from 'lucide-react'
import useEnterMove from '../hooks/useEnterMove'

const EditClientModal = ({ isOpen, onClose, clientId, onDelete }) => {
  // 모든 Hook 선언을 최상단에 배치 (React Hooks 규칙 준수)
  const { clients, updateClient, deleteClient, products } = useData()
  const client = clients?.find((c) => c?.id === clientId)
  const formRef = useRef(null)

  const [formData, setFormData] = useState({
    company: '',
    contact_person: '',
    phone: '',
    email: '',
    status: '활성',
    contract_prices: [],
  })

  const [newContractPrice, setNewContractPrice] = useState({
    productId: '',
    price: '',
  })

  // clientId나 client가 변경될 때마다 폼 초기화 (.cursorrules 규칙: 모달 재오픈 시 폼 상태 초기화)
  useEffect(() => {
    if (client && clientId) {
      setFormData({
        company: client?.company || '',
        contact_person: client?.contact_person || '',
        phone: client?.phone || '',
        email: client?.email || '',
        status: client?.status || '활성',
        contract_prices: Array.isArray(client?.contract_prices) ? client.contract_prices : [],
      })
      // 계약 단가 입력 필드도 초기화
      setNewContractPrice({ productId: '', price: '' })
    } else if (!isOpen) {
      // 모달이 닫힐 때도 폼 초기화 (.cursorrules 규칙 준수)
      setFormData({
        company: '',
        contact_person: '',
        phone: '',
        email: '',
        status: '활성',
        contract_prices: [],
      })
      setNewContractPrice({ productId: '', price: '' })
    }
  }, [client, clientId, isOpen])

  // 전역 엔터 네비게이션 적용
  useEnterMove({ formRef, enabled: isOpen })

  // Guard Clause: client가 없으면 아무것도 렌더링하지 않음 (.cursorrules 규칙 준수)
  // 모든 Hook 선언이 끝난 후에 조기 리턴
  if (!isOpen || !clientId || !client) {
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!clientId || !client) {
      alert('고객 정보를 찾을 수 없습니다.')
      onClose()
      return
    }
    if (!formData.company?.trim()) {
      alert('회사명을 입력해주세요.')
      return
    }

    try {
      await updateClient(clientId, {
        ...formData,
        contract_prices: Array.isArray(formData.contract_prices) ? formData.contract_prices : [],
      })
      alert('고객 정보가 수정되었습니다.')
      onClose()
    } catch (error) {
      console.error('고객 수정 중 오류:', error)
      alert('고객 정보 수정 중 오류가 발생했습니다.')
    }
  }

  const handleDelete = async () => {
    if (!clientId || !client) {
      alert('고객 정보를 찾을 수 없습니다.')
      onClose()
      return
    }
    if (window.confirm('정말 삭제하시겠습니까?\n\n이 고객 정보가 영구적으로 삭제되며, 관련된 모든 활동 내역도 함께 삭제됩니다.')) {
      try {
        await deleteClient(clientId)
        alert('고객이 삭제되었습니다.')
        onClose()
      } catch (error) {
        console.error('고객 삭제 중 오류:', error)
        alert('고객 삭제 중 오류가 발생했습니다.')
      }
    }
  }

  const handleAddContractPrice = () => {
    if (!newContractPrice?.productId) {
      alert('제품을 선택해주세요.')
      return
    }
    if (!newContractPrice?.price || parseFloat(newContractPrice.price) <= 0) {
      alert('단가를 입력해주세요.')
      return
    }

    // 이미 등록된 제품인지 확인
    const currentPrices = Array.isArray(formData.contract_prices) ? formData.contract_prices : []
    if (currentPrices.some((cp) => cp?.productId === newContractPrice.productId)) {
      alert('이미 등록된 제품입니다.')
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
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            회사명 <span className="text-red-500">*</span>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">담당자</label>
          <input
            type="text"
            value={formData.contact_person || ''}
            onChange={(e) => setFormData({ ...formData, contact_person: e.target.value || '' })}
            className="input-field"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
          <input
            type="tel"
            value={formData.phone || ''}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value || '' })}
            className="input-field"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
          <input
            type="email"
            value={formData.email || ''}
            onChange={(e) => setFormData({ ...formData, email: e.target.value || '' })}
            className="input-field"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">상태</label>
          <select
            value={formData.status || '활성'}
            onChange={(e) => setFormData({ ...formData, status: e.target.value || '활성' })}
            className="input-field"
          >
            <option value="활성">활성</option>
            <option value="대기">대기</option>
            <option value="비활성">비활성</option>
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
                  className="btn-success flex items-center justify-center space-x-2 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>추가</span>
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
                          className="text-red-600 hover:text-red-800"
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
            className="px-4 py-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all duration-200 font-semibold shadow-sm"
          >
            삭제
          </button>
          <div className="space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 font-medium shadow-sm"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-all duration-200 font-semibold shadow-sm"
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
