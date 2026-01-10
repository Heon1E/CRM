import React, { useState, useRef, useEffect } from 'react'
import Modal from './Modal'
import { useData } from '../contexts/DataContext'
import { Plus, X } from 'lucide-react'
import ProductCombobox from './ProductCombobox'
import useEnterMove from '../hooks/useEnterMove'
import { supabase } from '../lib/supabase'

const AddSaleModal = ({ isOpen, onClose }) => {
  const { clients, products, addSale } = useData()
  const formRef = useRef(null)

  // 상태 단순화: DB 컬럼명과 일치하는 키만 사용
  const [formData, setFormData] = useState({
    clientId: '',
    sale_date: new Date().toISOString().split('T')[0],
    items: [{ 
      productId: '', 
      item_name: '',  // DB 컬럼명과 일치
      quantity: 1, 
      unitPrice: 0,   // DB 컬럼명과 일치 (unit_price)
    }],
    notes: '',
  })

  const quantityInputRefs = useRef({})
  const unitPriceInputRefs = useRef({})


  useEnterMove({ 
    formRef, 
    enabled: isOpen,
    skipSelectors: ['textarea', '[data-combobox] input', '.combobox-input']
  })

  // 지능형 단가 불러오기 (우선순위: 계약 단가 > 기본가 > 0)
  const getUnitPrice = (productId, clientId) => {
    if (!productId || !clientId) return 0

    const client = clients?.find((c) => c.id === clientId)
    
    // 1순위: 계약 단가
    if (client?.contract_prices?.length > 0) {
      const contractPrice = client.contract_prices.find((cp) => cp.productId === productId)
      if (contractPrice?.price > 0) {
        return contractPrice.price
      }
    }

    // 2순위: 제품 기본가
    const product = products?.find((p) => p.id === productId)
    if (product) {
      const basePrice = product.basePrice || product.price || product.defaultPrice || 0
      if (basePrice > 0) {
        return basePrice
      }
    }

    return 0
  }

  // 품목 선택 시점에 데이터 확정 (가장 중요)
  const handleProductSelect = (index, productId) => {
    if (!productId || !productId.trim()) return

    const product = products?.find((p) => p.id === productId)
    if (!product) {
      console.warn('제품을 찾을 수 없습니다:', productId)
      return
    }

    // 입력 즉시 데이터 표준화: DB 컬럼명과 일치하는 형태로 즉시 저장
    const unitPrice = getUnitPrice(productId, formData.clientId)
    
    setFormData((prev) => {
      const newItems = [...prev.items]
      newItems[index] = {
        productId: productId,
        item_name: product.name || '',  // 즉시 확정
        quantity: newItems[index]?.quantity || 1,
        unitPrice: unitPrice,  // 즉시 확정
      }
      return { ...prev, items: newItems }
    })

    // 품목 선택 후 수량 입력창으로 포커스 이동
    setTimeout(() => {
      const quantityInput = quantityInputRefs.current[`quantity-${index}`]
      if (quantityInput) {
        quantityInput.focus()
        quantityInput.select()
      }
    }, 100)
  }

  // 수량 변경
  const handleQuantityChange = (index, value) => {
    // 선행 0 제거
    let cleanValue = value
    if (value.length > 1 && value.startsWith('0') && value[1] !== '.') {
      cleanValue = value.replace(/^0+/, '') || '0'
    }

    // 숫자로 변환 (빈 문자열은 빈 문자열로 유지)
    const numValue = cleanValue === '' ? '' : Number(cleanValue) || 0

    setFormData((prev) => {
      const newItems = [...prev.items]
      const currentItem = newItems[index] || {}
      newItems[index] = {
        ...currentItem,
        quantity: numValue,
      }
      return { ...prev, items: newItems }
    })
  }

  // 수량 blur 처리
  const handleQuantityBlur = (index) => {
    setFormData((prev) => {
      const newItems = [...prev.items]
      const currentItem = newItems[index] || {}
      const quantity = currentItem.quantity || 0
      
      if (quantity === '' || quantity === 0) {
        newItems[index] = {
          ...currentItem,
          quantity: 1,  // 기본값 1
        }
      }
      return { ...prev, items: newItems }
    })
  }

  // 단가 변경
  const handleUnitPriceChange = (index, value) => {
    // 선행 0 제거
    let cleanValue = value
    if (value.length > 1 && value.startsWith('0') && value[1] !== '.') {
      cleanValue = value.replace(/^0+/, '') || '0'
    }

    // 숫자로 변환 (빈 문자열은 빈 문자열로 유지)
    const numValue = cleanValue === '' ? '' : Number(cleanValue) || 0

    setFormData((prev) => {
      const newItems = [...prev.items]
      const currentItem = newItems[index] || {}
      newItems[index] = {
        ...currentItem,
        unitPrice: numValue,
      }
      return { ...prev, items: newItems }
    })
  }

  // 단가 blur 처리
  const handleUnitPriceBlur = (index) => {
    setFormData((prev) => {
      const newItems = [...prev.items]
      const currentItem = newItems[index] || {}
      const unitPrice = currentItem.unitPrice || 0
      
      if (unitPrice === '') {
        newItems[index] = {
          ...currentItem,
          unitPrice: 0,  // 기본값 0
        }
      }
      return { ...prev, items: newItems }
    })
  }

  // 품목 추가
  const addItem = (focusToNewRow = false) => {
    setFormData((prev) => {
      const newItems = [...prev.items, { 
        productId: '', 
        item_name: '', 
        quantity: 1, 
        unitPrice: 0 
      }]
      
      if (focusToNewRow) {
        setTimeout(() => {
          const newIndex = newItems.length - 1
          const productContainer = formRef.current?.querySelector(`[data-product-index="${newIndex}"]`)
          const comboboxInput = productContainer?.querySelector('input[type="text"]')
          if (comboboxInput) {
            comboboxInput.focus()
          }
        }, 150)
      }
      
      return { ...prev, items: newItems }
    })
  }

  // 품목 삭제
  const removeItem = (index) => {
    setFormData((prev) => {
      if (prev.items.length > 1) {
        return { ...prev, items: prev.items.filter((_, i) => i !== index) }
      }
      return prev
    })
  }

  // 거래처 변경 시 품목 단가 재계산
  const handleClientChange = (clientId) => {
    setFormData((prev) => {
      const newItems = prev.items.map((item) => {
        if (item.productId) {
          const unitPrice = getUnitPrice(item.productId, clientId)
          return {
            ...item,
            unitPrice: unitPrice,
          }
        }
        return item
      })
      return { ...prev, clientId, items: newItems }
    })
  }

  // 총액 계산
  const totalAmount = formData.items.reduce((sum, item) => {
    const quantity = Number(item.quantity) || 0
    const unitPrice = Number(item.unitPrice) || 0
    return sum + (quantity * unitPrice)
  }, 0)

  // 저장 로직: 모든 키 전송 전략 (snake_case와 camelCase 모두 포함)
  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // 기본 유효성 검사
    if (!formData.clientId) {
      alert('거래처를 선택해주세요.')
      return
    }
    
    // 1. 데이터 정제: 유효한 품목만 필터링 (품목명이 있는 항목만)
    const validItems = formData.items.filter((item) => {
      const name = item.item_name || item.itemName || item.product_name || ''
      return name && name.trim() !== ''
    })
    
    if (validItems.length === 0) {
      alert('저장할 유효한 품목이 없습니다.')
      return
    }

    try {
      // 2. Payload 구성: 확인된 실제 DB 컬럼명으로 정확히 매핑
      const rowsToInsert = validItems.map((item) => {
        // 숫자 변환 (안전장치)
        const qty = Number(item.quantity) || 1
        // 단가: unitPrice 변수에서 가져오되, 없으면 0
        const price = Number(item.unitPrice) || Number(item.unit_price) || 0
        const total = qty * price
        
        // 품목명: 여러 변수명 중 값 있는 것 찾기
        const name = (item.item_name || item.product_name || item.itemName || '').trim()
        
        if (!name || name === '') {
          throw new Error('품목명이 없습니다.')
        }
        
        // 확인된 실제 DB 컬럼명으로 정확히 매핑
        return {
          clientId: formData.clientId,        // camelCase (확인됨: client_id 아님!)
          sale_date: formData.sale_date,       // snake_case
          item_name: name,                     // snake_case
          quantity: qty,
          unit_price: price,                   // snake_case
          totalAmount: total,                  // camelCase (NOT NULL 제약조건)
          notes: formData.notes || '',
        }
      })

      // 3. 변환된 배열을 그대로 insert (Bulk Insert)
      // payload 생성: Flatten된 rows 배열 전송
      const payload = {
        rows: rowsToInsert,  // 모든 키가 포함된 행 배열
      }

      await addSale(payload)

      alert('매출이 추가되었습니다.')
      
      // 폼 초기화
      setFormData({
        clientId: '',
        sale_date: new Date().toISOString().split('T')[0],
        items: [{ productId: '', item_name: '', quantity: 1, unitPrice: 0 }],
        notes: '',
      })
      onClose()
    } catch (error) {
      console.error('매출 추가 중 오류:', error)
      alert(`매출 추가 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="매출 추가" size="lg">
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              거래처 <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.clientId}
              onChange={(e) => handleClientChange(e.target.value)}
              className="input-field"
              required
            >
              <option value="">거래처 선택</option>
              {clients?.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.company} ({client.contact_person || ''})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              날짜 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={formData.sale_date}
              onChange={(e) => setFormData({ ...formData, sale_date: e.target.value })}
              className="input-field"
              required
            />
          </div>
        </div>

        {/* 품목 리스트 */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <label className="block text-sm font-medium text-gray-700">
              품목 <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={addItem}
              className="text-sm text-purple-600 hover:text-purple-700 font-medium flex items-center space-x-1 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>품목 추가</span>
            </button>
          </div>

          <div className="space-y-3">
            {formData.items.map((item, index) => {
              const itemTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)
              
              return (
                <div key={index} className="border border-border-light rounded-card p-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-medium text-gray-700">품목 {index + 1}</span>
                    {formData.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="relative z-50" data-product-index={index}>
                      <label className="block text-xs font-medium text-gray-700 mb-1">품목명</label>
                      <ProductCombobox
                        products={products || []}
                        value={item.productId || ''}
                        onSelect={(productId) => handleProductSelect(index, productId)}
                        placeholder={formData.clientId ? "품목을 검색하세요..." : "먼저 거래처를 선택하세요"}
                        disabled={!formData.clientId}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">수량</label>
                      <input
                        ref={(el) => {
                          if (el) quantityInputRefs.current[`quantity-${index}`] = el
                        }}
                        type="number"
                        value={item.quantity === '' ? '' : item.quantity}
                        onChange={(e) => handleQuantityChange(index, e.target.value)}
                        onBlur={() => handleQuantityBlur(index)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            const unitPriceInput = unitPriceInputRefs.current[`unitPrice-${index}`]
                            if (unitPriceInput) {
                              unitPriceInput.focus()
                              unitPriceInput.select()
                            }
                          }
                        }}
                        className="input-field text-sm"
                        min="1"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">단가 (원)</label>
                      <input
                        ref={(el) => {
                          if (el) unitPriceInputRefs.current[`unitPrice-${index}`] = el
                        }}
                        type="number"
                        value={item.unitPrice === '' ? '' : item.unitPrice}
                        onChange={(e) => handleUnitPriceChange(index, e.target.value)}
                        onBlur={() => handleUnitPriceBlur(index)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addItem(true)
                          }
                        }}
                        className="input-field text-sm"
                        min="0"
                        required
                      />
                    </div>
                  </div>

                  <div className="mt-2 text-right">
                    <span className="text-sm font-medium text-gray-900">
                      공급가액: {itemTotal.toLocaleString()}원
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 총액 */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex justify-between items-center">
            <span className="text-lg font-semibold text-gray-900">총 매출액</span>
            <span className="text-xl font-bold text-purple-600">
              {totalAmount.toLocaleString()}원
            </span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">비고</label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={3}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
            placeholder="비고 사항을 입력하세요"
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

export default AddSaleModal
