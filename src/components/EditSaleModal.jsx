import React, { useState, useEffect, useRef } from 'react'
import Modal from './Modal'
import { useData } from '../contexts/DataContext'
import { Plus, X } from 'lucide-react'
import ProductCombobox from './ProductCombobox'
import ClientCombobox from './ClientCombobox'
import useEnterMove from '../hooks/useEnterMove'
import { supabase } from '../lib/supabase'
import { showWarning, showSuccess, showError, showConfirm } from '../utils/alert'

const EditSaleModal = ({ isOpen, onClose, saleGroup , docked = false }) => {
  // 모든 Hook 선언을 최상단에 배치 (React Hooks 규칙 준수)
  const { clients, products, updateSale, deleteSale, addClient } = useData()
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
          // saleGroup에 id가 있고, items가 없거나 비어있는 경우에만 상세 데이터 다시 조회
          let saleData = saleGroup

          const hasItems = saleGroup.items && Array.isArray(saleGroup.items) && saleGroup.items.length > 0

          if (saleGroup.id && !hasItems) {
            console.log('[EditSaleModal] Fetching detail from SB for ID:', saleGroup.id)
            const { data: fetchedSaleData, error: saleError } = await supabase
              .from('sales')
              .select('*')
              .eq('id', saleGroup.id)
              .single()

            if (saleError) {
              console.error('[EditSaleModal] sales 조회 오류:', saleError)
            } else if (fetchedSaleData) {
              saleData = fetchedSaleData
              // items 배열 확보 로직 생략 (이미 hasItems 체크로 필터링됨)
            }
          }

          // items 배열 추출
          const itemsArray = saleData.items || saleGroup.items || []

          // items 배열 매핑
          const items = Array.isArray(itemsArray)
            ? itemsArray
              .filter((item) => item != null)
              .map((item) => {
                // 제품 찾기: id가 있으면 id로, 없으면 이름으로 찾기
                const itemId = item.product_id || item.productId || ''
                const itemName = item.item_name || item.itemName || item.product_name || item.productName || item.name || ''

                const product = products?.find((p) =>
                  (itemId && p.id === itemId) ||
                  (itemName && p.name === itemName)
                )

                // unitPrice 매핑
                const unitPrice = Number(item.unit_price ?? item.unitPrice ?? item.price ?? 0)

                return {
                  id: item.id || null,
                  productId: product?.id || itemId || '',
                  item_name: itemName || product?.name || '',
                  quantity: Number(item.quantity) || 1,
                  unitPrice: unitPrice,
                }
              })
            : []

          // 날짜 및 거래처 ID 추출 (Defensive)
          const dateStr = (saleData.sale_date || saleGroup.sale_date || saleData.date || saleGroup.date || '').split('T')[0]
          const clientId = saleData.client_id || saleGroup.client_id || saleData.clientId || saleGroup.clientId || ''

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

  // 날짜 변경 시 모든 품목의 날짜도 일괄 변경 (실제로는 저장 시 처리)
  const handleSaleDateChange = (saleDate) => {
    setFormData((prev) => ({ ...prev, sale_date: saleDate }))
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
    <Modal isOpen={isOpen} onClose={onClose} title="매출 수정" size="lg" docked={docked}>
      <form ref={formRef} onSubmit={handleSubmit}>
        {/* 머리 정보 — 라벨을 왼쪽에 두어 세로 공간을 아낀다 */}
        <div className="fields">
          <div className="f">
            <label>거래처 <span className="req">*</span></label>
            <ClientCombobox
              clients={clients || []}
              value={formData.clientId}
              onSelect={(id) => handleClientChange(id)}
              onNewClient={handleNewClient}
              placeholder="거래처 검색 또는 신규 입력"
            />
          </div>
          <div className="f">
            <label htmlFor="edit-sale-date">날짜 <span className="req">*</span></label>
            <input
              id="edit-sale-date"
              type="date"
              value={formData.sale_date || ''}
              onChange={(e) => handleSaleDateChange(e.target.value || '')}
              required
            />
          </div>
        </div>

        {/* 품목 — 카드가 아니라 표로 입력한다. 한 줄이 한 품목. */}
        <div className="lines">
          <table>
            <thead>
              <tr>
                <th style={{ width: '32px' }}>#</th>
                <th>품목명</th>
                <th style={{ width: '80px' }}>수량</th>
                <th style={{ width: '110px' }}>단가</th>
                <th style={{ width: '120px' }}>공급가액</th>
                <th style={{ width: '40px' }}></th>
              </tr>
            </thead>
            <tbody>
              {formData.items.map((item, index) => {
                const itemTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)
                return (
                  <tr key={index}>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-data)' }}>
                      {index + 1}
                    </td>
                    <td style={{ padding: '2px 4px' }}>
                      <div className="relative z-50" data-product-index={index}>
                        <ProductCombobox
                          products={products || []}
                          value={item.productId || ''}
                          onSelect={(productId) => handleProductSelect(index, productId)}
                          placeholder={formData.clientId ? '품목 검색' : '먼저 거래처를 선택하세요'}
                          disabled={!formData.clientId}
                        />
                      </div>
                    </td>
                    <td className="num">
                      <input
                        ref={(el) => { if (el) quantityInputRefs.current[`quantity-${index}`] = el }}
                        type="number"
                        value={item.quantity === '' ? '' : item.quantity}
                        onChange={(e) => handleQuantityChange(index, e.target.value)}
                        onBlur={() => handleQuantityBlur(index)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            const el = unitPriceInputRefs.current[`unitPrice-${index}`]
                            if (el) { el.focus(); el.select() }
                          }
                        }}
                        min="1"
                        required
                        aria-label={`품목 ${index + 1} 수량`}
                      />
                    </td>
                    <td className="num">
                      <input
                        ref={(el) => { if (el) unitPriceInputRefs.current[`unitPrice-${index}`] = el }}
                        type="number"
                        value={item.unitPrice === '' ? '' : item.unitPrice}
                        onChange={(e) => handleUnitPriceChange(index, e.target.value)}
                        onBlur={() => handleUnitPriceBlur(index)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); addItem(true) }
                        }}
                        min="0"
                        required
                        aria-label={`품목 ${index + 1} 단가`}
                      />
                    </td>
                    <td className="num" style={{ padding: '3px 7px', color: 'var(--text-secondary)' }}>
                      {itemTotal.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {formData.items.length > 1 && (
                        <button type="button" className="rowbtn danger" onClick={() => removeItem(index)}
                          aria-label={`품목 ${index + 1} 삭제`}>×</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="4" style={{ textAlign: 'right' }}>총 매출액</td>
                <td className="num" style={{ fontFamily: 'var(--font-data)', fontSize: '13px' }}>
                  {totalAmount.toLocaleString()}
                </td>
                <td>
                  <button type="button" className="rowbtn" onClick={() => addItem()} title="품목 추가">+</button>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="fields one">
          <div className="f">
            <label htmlFor="edit-sale-notes">비고</label>
            <input
              id="edit-sale-notes"
              type="text"
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value || '' })}
              placeholder="(선택)"
            />
          </div>
        </div>

        <div className="editor-foot">
          <button type="submit" className="tb-btn primary">저장 <kbd>Ctrl+S</kbd></button>
          <button type="button" className="tb-btn" onClick={onClose}>취소 <kbd>Esc</kbd></button>
          <span className="tb-sep" />
          <button type="button" className="tb-btn danger" onClick={handleDelete}>삭제</button>
          <span className="flex-1" />
          <span className="hint"><kbd>Enter</kbd> 다음 칸 · 단가에서 <kbd>Enter</kbd> 시 품목 줄 추가</span>
        </div>
      </form>
    </Modal>
  )
}

export default EditSaleModal




