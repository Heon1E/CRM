import React, { useState, useEffect, useRef } from 'react'
import Modal from './Modal'
import { useData } from '../contexts/DataContext'
import { Plus, X } from 'lucide-react'
import ProductCombobox from './ProductCombobox'
import useEnterMove from '../hooks/useEnterMove'
import { supabase } from '../lib/supabase'
import { showWarning, showSuccess, showError, showConfirm } from '../utils/alert'

const EditSaleModal = ({ isOpen, onClose, saleGroup }) => {
  // 모든 Hook 선언을 최상단에 배치 (React Hooks 규칙 준수)
  const { clients, products, updateSale, deleteSale } = useData()
  const formRef = useRef(null)

  // 원본 데이터 저장 (Diff 알고리즘용)
  const [originalItems, setOriginalItems] = useState([])
  const [originalClientId, setOriginalClientId] = useState('')
  const [originalSaleDate, setOriginalSaleDate] = useState('')

  // 상태 단순화: DB 컬럼명과 일치하는 키만 사용
  const [formData, setFormData] = useState({
    clientId: '',
    sale_date: '',
    items: [],
    notes: '',
  })

  const quantityInputRefs = useRef({})
  const unitPriceInputRefs = useRef({})

  // saleGroup이 변경되거나 모달이 열릴 때 폼 초기화
  useEffect(() => {
    if (saleGroup && isOpen) {
      // 모달이 열릴 때 상세 데이터 다시 조회 (items 배열 확보)
      const loadSaleData = async () => {
        try {
          // saleGroup에 id가 있으면 상세 데이터 다시 조회
          let saleData = saleGroup
          
          if (saleGroup.id && (!saleGroup.items || saleGroup.items.length === 0)) {
            const { data: fetchedData, error } = await supabase
              .from('sales')
              .select(`
                *,
                sales_items (*)
              `)
              .eq('id', saleGroup.id)
              .single()

            if (!error && fetchedData) {
              saleData = fetchedData
            }
          }

          // 디버깅: 조회된 데이터 구조 확인
          console.log('[EditSaleModal] Fetched Data:', saleData)
          console.log('[EditSaleModal] sales_items:', saleData?.sales_items)
          console.log('[EditSaleModal] items:', saleData?.items)
          console.log('[EditSaleModal] saleGroup.items:', saleGroup?.items)

          // items 배열 추출 (우선순위: sales_items > saleData.items > saleGroup.items)
          // 변수명 매핑: sales_items 테이블의 데이터를 items로 연결
          const itemsArray = saleData.sales_items || saleData.items || saleGroup.items || []
          
          // items 배열이 비어있으면 빈 배열로 처리
          const items = Array.isArray(itemsArray) && itemsArray.length > 0
            ? itemsArray
                .filter((item) => item != null)
                .map((item) => {
                  // item_name으로 productId 찾기
                  const product = products?.find((p) => p.name === (item.item_name || item.productName || item.name))
                  
                  // unit_price 매핑 (DB 컬럼명 우선, fallback으로 unitPrice)
                  const unitPrice = item.unit_price !== undefined && item.unit_price !== null 
                    ? Number(item.unit_price) 
                    : (item.unitPrice !== undefined && item.unitPrice !== null ? Number(item.unitPrice) : 0)
                  
                  const mappedItem = {
                    id: item.id, // 개별 레코드 ID (있으면)
                    productId: product?.id || '',
                    item_name: item.item_name || item.productName || item.name || '',
                    quantity: item.quantity || 1,
                    unitPrice: unitPrice,
                  }
                  
                  // 디버깅: 단가 매핑 확인
                  console.log('[EditSaleModal] 품목 매핑:', {
                    원본: { unit_price: item.unit_price, unitPrice: item.unitPrice },
                    매핑된_unitPrice: mappedItem.unitPrice,
                    item_name: mappedItem.item_name
                  })
                  
                  return mappedItem
                })
            : []

          // 날짜 변환 (YYYY-MM-DD 형식)
          let dateStr = ''
          const saleDate = saleData.sale_date || saleGroup.sale_date || saleData.date || saleGroup.date
          if (saleDate instanceof Date) {
            dateStr = saleDate.toISOString().split('T')[0]
          } else if (typeof saleDate === 'string') {
            dateStr = saleDate.split('T')[0]
          } else {
            dateStr = saleDate || ''
          }

          // 거래처 ID
          const clientId = saleData.client_id || saleGroup.client_id || saleData.clientId || saleGroup.clientId || ''

          // 원본 데이터 저장
          setOriginalItems(items)
          setOriginalClientId(clientId)
          setOriginalSaleDate(dateStr)

          // 폼 데이터 설정
          setFormData({
            clientId: clientId,
            sale_date: dateStr,
            items: items,
            notes: saleData.notes || saleGroup.notes || '',
          })

          console.log('[EditSaleModal] 로드된 데이터:', { 
            clientId, 
            sale_date: dateStr, 
            itemsCount: items.length, 
            items,
            saleData: saleData
          })
        } catch (error) {
          console.error('매출 데이터 로드 중 오류:', error)
          // 에러 발생 시 빈 데이터로 초기화
          setFormData({
            clientId: '',
            sale_date: '',
            items: [],
            notes: '',
          })
          setOriginalItems([])
          setOriginalClientId('')
          setOriginalSaleDate('')
        }
      }

      loadSaleData()
    } else if (!isOpen) {
      // 모달이 닫힐 때도 폼 초기화
      setFormData({
        clientId: '',
        sale_date: '',
        items: [],
        notes: '',
      })
      setOriginalItems([])
      setOriginalClientId('')
      setOriginalSaleDate('')
    }
  }, [saleGroup, isOpen, products])

  useEnterMove({
    formRef,
    enabled: isOpen,
    skipSelectors: ['textarea', '[data-combobox] input', '.combobox-input'],
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

  // 품목 선택 시점에 데이터 확정
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
      const currentItem = newItems[index] || {}
      newItems[index] = {
        ...currentItem,
        productId: productId,
        item_name: product.name || '',
        quantity: currentItem.quantity || 1,
        unitPrice: unitPrice,
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
          quantity: 1, // 기본값 1
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
          unitPrice: 0, // 기본값 0
        }
      }
      return { ...prev, items: newItems }
    })
  }

  // 품목 추가
  const addItem = (focusToNewRow = false) => {
    setFormData((prev) => {
      const newItems = [
        ...prev.items,
        {
          id: null, // 새 항목은 id가 없음
          productId: '',
          item_name: '',
          quantity: 1,
          unitPrice: 0,
        },
      ]

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

  // 날짜 변경 시 모든 품목의 날짜도 일괄 변경 (실제로는 저장 시 처리)
  const handleSaleDateChange = (saleDate) => {
    setFormData((prev) => ({ ...prev, sale_date: saleDate }))
  }

  // 총액 계산
  const totalAmount = formData.items.reduce((sum, item) => {
    const quantity = Number(item.quantity) || 0
    const unitPrice = Number(item.unitPrice) || 0
    return sum + quantity * unitPrice
  }, 0)

  // 하나의 주문 레코드로 업데이트
  const handleSubmit = async (e) => {
    e.preventDefault()

    // 기본 유효성 검사
    if (!formData.clientId) {
      await showWarning('거래처를 선택해주세요.')
      return
    }

    // 유효한 품목만 필터링
    const validItems = formData.items.filter((item) => {
      const name = item.item_name || item.itemName || item.product_name || ''
      return name && name.trim() !== ''
    })

    if (validItems.length === 0) {
      await showWarning('저장할 유효한 품목이 없습니다.')
      return
    }

    try {
      // 스마트 품목 합산 로직: 품목명과 단가가 모두 일치하는 항목들을 하나로 합치기
      const mergedItemsMap = new Map()
      
      validItems.forEach((item) => {
        const name = (item.item_name || item.itemName || item.product_name || '').trim()
        const qty = Number(item.quantity) || 1
        const price = Number(item.unitPrice) || Number(item.unit_price) || 0
        
        if (!name || name === '') {
          return // 품목명이 없으면 건너뛰기
        }
        
        // 합산 키: 품목명 + 단가 (단가까지 일치해야 합산)
        const mergeKey = `${name}|${price}`
        
        if (mergedItemsMap.has(mergeKey)) {
          // 이미 같은 품목명+단가 조합이 있으면 수량만 더하기
          const existing = mergedItemsMap.get(mergeKey)
          existing.quantity += qty
        } else {
          // 새로운 항목 추가
          mergedItemsMap.set(mergeKey, {
            item_name: name,
            quantity: qty,
            unit_price: price
          })
        }
      })
      
      // 합산된 항목들을 배열로 변환
      const mergedItems = Array.from(mergedItemsMap.values())
      
      if (mergedItems.length === 0) {
        await showWarning('저장할 유효한 품목이 없습니다.')
        return
      }
      
      // updateSale 함수 호출 (DataContext의 updateSale이 단일 레코드 업데이트를 처리)
      await updateSale(saleGroup.id, {
        clientId: formData.clientId,
        sale_date: formData.sale_date,
        notes: formData.notes,
        items: mergedItems
      })

      await showSuccess('매출이 수정되었습니다.')
      onClose()
    } catch (error) {
      console.error('매출 수정 중 오류:', error)
      await showError(`매출 수정 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`)
    }
  }

  // 주문 전체 삭제
  const handleDelete = async () => {
    if (!saleGroup) {
      await showWarning('매출 정보를 찾을 수 없습니다.')
      onClose()
      return
    }

    const isConfirmed = await showConfirm(
      '정말 삭제하시겠습니까?',
      '이 매출 기록이 영구적으로 삭제됩니다.',
      '삭제',
      '취소'
    )

    if (isConfirmed) {
      try {
        // 하나의 레코드만 삭제
        await deleteSale(saleGroup.id)
        await showSuccess('매출 기록이 삭제되었습니다.')
        onClose()
      } catch (error) {
        console.error('매출 삭제 중 오류:', error)
        await showError('매출 삭제 중 오류가 발생했습니다.')
      }
    }
  }

  // Guard Clause: saleGroup이 없으면 아무것도 렌더링하지 않음
  if (!isOpen || !saleGroup) {
    return null
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="매출 수정" size="lg">
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              거래처 <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.clientId || ''}
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
              value={formData.sale_date || ''}
              onChange={(e) => handleSaleDateChange(e.target.value || '')}
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
                        placeholder={formData.clientId ? '품목을 검색하세요...' : '먼저 거래처를 선택하세요'}
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
            <span className="text-xl font-bold text-purple-600">{totalAmount.toLocaleString()}원</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">비고</label>
          <textarea
            value={formData.notes || ''}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value || '' })}
            rows={3}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
            placeholder="비고 사항을 입력하세요"
          />
        </div>

        <div className="flex justify-between items-center pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={handleDelete}
            className="px-5 py-2.5 bg-red-500 text-white rounded-md hover:bg-red-600 transition-all duration-200 font-medium shadow-sm hover:shadow"
          >
            삭제
          </button>
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-all duration-200 font-medium"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-all duration-200 font-medium shadow-sm hover:shadow"
            >
              저장
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

export default EditSaleModal
