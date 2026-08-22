import React, { useState, useRef, useEffect } from 'react'
import Modal from './Modal'
import { todayYmd } from '../utils/day'
import { useData } from '../contexts/DataContext'
import { Plus, X } from 'lucide-react'
import ClientCombobox from './ClientCombobox'
import ProductCombobox from './ProductCombobox'
import useEnterMove from '../hooks/useEnterMove'
import { supabase } from '../lib/supabase'
import { showWarning, showSuccess, showError } from '../utils/alert'

const AddSaleModal = ({ isOpen, onClose , docked = false }) => {
  const { clients, products, addSale, addClient } = useData()
  const formRef = useRef(null)

  // 상태 단순화: DB 컬럼명과 일치하는 키만 사용
  const [formData, setFormData] = useState({
    clientId: '',
    sale_date: todayYmd(),
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

  // 거래처 변경 시 품목 단가 재계산 (새 거래처에 저장된 단가가 없으면 기존 단가 유지)
  const handleClientChange = (clientId) => {
    setFormData((prev) => {
      const newItems = prev.items.map((item) => {
        if (item.productId) {
          const newPrice = getUnitPrice(item.productId, clientId)
          return {
            ...item,
            unitPrice: newPrice > 0 ? newPrice : item.unitPrice,
          }
        }
        return item
      })
      return { ...prev, clientId, items: newItems }
    })
  }

  // 신규 거래처 자동 등록 (ClientCombobox에서 호출)
  const handleNewClient = async (companyName) => {
    try {
      const newClient = await addClient({ company: companyName })
      if (newClient?.id) {
        handleClientChange(newClient.id)
      }
    } catch (error) {
      console.error('신규 거래처 등록 실패:', error)
      await showError('신규 거래처 등록에 실패했습니다.')
    }
  }

  // 총액 계산
  const totalAmount = formData.items.reduce((sum, item) => {
    const quantity = Number(item.quantity) || 0
    const unitPrice = Number(item.unitPrice) || 0
    return sum + (quantity * unitPrice)
  }, 0)

  // 모달이 닫힐 때 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setFormData({
        clientId: '',
        sale_date: todayYmd(),
        items: [{ productId: '', item_name: '', quantity: 1, unitPrice: 0 }],
        notes: '',
      })
    }
  }, [isOpen])

  // 저장 로직: 모든 키 전송 전략 (snake_case와 camelCase 모두 포함)
  const handleSubmit = async (e) => {
    e.preventDefault()

    // 기본 유효성 검사
    if (!formData.clientId) {
      await showWarning('거래처를 선택해주세요.')
      return
    }

    // 1. 데이터 정제: 유효한 품목만 필터링 (품목명이 있는 항목만)
    const validItems = formData.items.filter((item) => {
      const name = item.item_name || item.itemName || item.product_name || ''
      return name && name.trim() !== ''
    })

    if (validItems.length === 0) {
      await showWarning('품목을 목록에서 골라 주세요. 직접 입력한 이름은 저장되지 않습니다.')
      return
    }

    try {
      // 2. 스마트 품목 합산 로직: 품목명과 단가가 모두 일치하는 항목들을 하나로 합치기
      const mergedItemsMap = new Map()

      validItems.forEach((item) => {
        // 숫자 변환 (안전장치)
        const qty = Number(item.quantity) || 1
        // 단가: unitPrice 변수에서 가져오되, 없으면 0
        const price = Number(item.unitPrice) || Number(item.unit_price) || 0

        // 품목명: 여러 변수명 중 값 있는 것 찾기
        const name = (item.item_name || item.product_name || item.itemName || '').trim()

        if (!name || name === '') {
          return // 품목명이 없으면 건너뛰기
        }

        // 합산 키: 품목명 + 단가 (단가까지 일치해야 합산)
        const mergeKey = `${name}|${price}`

        if (mergedItemsMap.has(mergeKey)) {
          // 이미 같은 품목명+단가 조합이 있으면 수량만 더하기
          const existing = mergedItemsMap.get(mergeKey)
          existing.quantity += qty
          existing.totalAmount = existing.quantity * price
        } else {
          // 새로운 항목 추가
          mergedItemsMap.set(mergeKey, {
            item_name: name,
            quantity: qty,
            unitPrice: price,
            totalAmount: qty * price
          })
        }
      })

      // 합산된 항목들을 배열로 변환
      const mergedItems = Array.from(mergedItemsMap.values())

      if (mergedItems.length === 0) {
        await showWarning('품목을 목록에서 골라 주세요. 직접 입력한 이름은 저장되지 않습니다.')
        return
      }

      // 3. Payload 구성: 확인된 실제 DB 컬럼명으로 정확히 매핑
      const rowsToInsert = mergedItems.map((item) => {
        // DB 컬럼명(snake_case)으로 정확히 매핑
        return {
          clientId: formData.clientId,        // addSale 함수에서 client_id로 변환됨
          sale_date: formData.sale_date,       // snake_case
          item_name: item.item_name,           // snake_case
          quantity: item.quantity,
          unitPrice: item.unitPrice,          // addSale 함수에서 unit_price로 변환됨
          totalAmount: item.totalAmount,      // addSale 함수에서 total_amount로 변환됨
          notes: formData.notes || '',
        }
      })

      // 4. 변환된 배열을 그대로 insert (Bulk Insert)
      // payload 생성: Flatten된 rows 배열 전송
      const payload = {
        rows: rowsToInsert,  // 모든 키가 포함된 행 배열
      }

      // 디버깅: 전송 전 최종 확인
      console.log('[AddSaleModal] 전송될 데이터 (최종 검증):', payload)
      console.log('[AddSaleModal] 각 행의 키 목록:', rowsToInsert.map(r => Object.keys(r)))

      await addSale(payload)
      await showSuccess('매출이 추가되었습니다.')

      // 폼 초기화
      setFormData({
        clientId: '',
        sale_date: todayYmd(),
        items: [{ productId: '', item_name: '', quantity: 1, unitPrice: 0 }],
        notes: '',
      })
      onClose()
    } catch (error) {
      console.error('매출 추가 중 오류:', error)
      await showError(error.message || '매출 추가 중 오류가 발생했습니다.')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="매출 등록" size="lg" docked={docked}>
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 text-[11px]">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="font-bold text-black uppercase tracking-tight">
              CLIENT_ID: <span className="text-[color:var(--danger)]">*</span>
            </label>
            <ClientCombobox
              clients={clients || []}
              value={formData.clientId}
              onSelect={(id) => handleClientChange(id)}
              onNewClient={handleNewClient}
              placeholder="거래처 검색 또는 신규 입력..."
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-bold text-black uppercase tracking-tight">
              TRANS_DATE: <span className="text-[color:var(--danger)]">*</span>
            </label>
            <input
              type="date"
              value={formData.sale_date}
              onChange={(e) => setFormData({ ...formData, sale_date: e.target.value })}
              className="oracle-sunken px-2 py-0.5"
              required
            />
          </div>
        </div>

        {/* 품목 리스트 */}
        <div className="oracle-raised bg-[#d0d0d0] p-2 space-y-2">
          <div className="flex items-center justify-between border-b border-gray-400 pb-1 mb-2">
            <label className="font-bold text-black uppercase tracking-tight">품목</label>
            <button
              type="button"
              onClick={addItem}
              className="oracle-raised bg-gray-200 px-2 py-0.5 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              <span>품목 추가</span>
            </button>
          </div>

          <div className="space-y-1 max-h-[300px] overflow-auto oracle-sunken bg-white p-1">
            <table className="w-full text-[10px] border-collapse">
              <thead className="bg-[#c0c0c0] sticky top-0">
                <tr>
                  <th className="border-r border-b border-gray-400 w-8">번호</th>
                  <th className="border-r border-b border-gray-400">품목 (검색)</th>
                  <th className="border-r border-b border-gray-400 w-16">수량</th>
                  <th className="border-r border-b border-gray-400 w-24 text-right">단가</th>
                  <th className="border-r border-b border-gray-400 w-24 text-right">금액</th>
                  <th className="border-b border-gray-400 w-6">삭제</th>
                </tr>
              </thead>
              <tbody>
                {formData.items.map((item, index) => {
                  const itemTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)
                  return (
                    <tr key={index} className="border-b border-gray-100">
                      <td className="text-center bg-gray-50">{index + 1}</td>
                      <td className="p-1" data-product-index={index}>
                        <ProductCombobox
                          products={products || []}
                          value={item.productId || ''}
                          onSelect={(productId) => handleProductSelect(index, productId)}
                          placeholder={formData.clientId ? "품목 고르기" : "거래처를 먼저 고르세요"}
                          disabled={!formData.clientId}
                          className="border-none shadow-none"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          ref={(el) => { if (el) quantityInputRefs.current[`quantity-${index}`] = el }}
                          type="number"
                          value={item.quantity === '' ? '' : item.quantity}
                          onChange={(e) => handleQuantityChange(index, e.target.value)}
                          onBlur={() => handleQuantityBlur(index)}
                          className="w-full border-none outline-none text-center bg-transparent"
                          min="1"
                          required
                        />
                      </td>
                      <td className="p-1">
                        <input
                          ref={(el) => { if (el) unitPriceInputRefs.current[`unitPrice-${index}`] = el }}
                          type="number"
                          value={item.unitPrice === '' ? '' : item.unitPrice}
                          onChange={(e) => handleUnitPriceChange(index, e.target.value)}
                          onBlur={() => handleUnitPriceBlur(index)}
                          className="w-full border-none outline-none text-right bg-transparent"
                          min="0"
                          required
                        />
                      </td>
                      <td className="p-1 text-right font-bold text-oem-blue">
                        {itemTotal.toLocaleString()}
                      </td>
                      <td className="p-1 text-center">
                        {formData.items.length > 1 && (
                          <button type="button" onClick={() => removeItem(index)} className="text-[color:var(--danger)] font-bold">×</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 총액 */}
        <div className="oracle-raised bg-[#808080] p-1 flex justify-between items-center text-white font-bold px-4">
          <span className="uppercase text-[10px]">Grand Total (Commit Amount):</span>
          <span className="text-sm">
            {totalAmount.toLocaleString()} KRW
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-bold text-black uppercase tracking-tight">비고</label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={2}
            className="oracle-sunken px-2 py-1 bg-white resize-none"
            placeholder="메모 (선택)"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-400">
          <button
            type="button"
            onClick={onClose}
            className="oracle-raised bg-gray-200 px-6 py-1 font-bold hover:bg-gray-100"
          >
            취소
          </button>
          <button
            type="submit"
            className="oracle-raised bg-oem-blue text-white px-8 py-1 font-bold hover:bg-oem-blue-dark"
          >
            저장
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default AddSaleModal




