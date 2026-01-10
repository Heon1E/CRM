import React, { useState, useEffect, useRef } from 'react'
import Modal from './Modal'
import { useData } from '../contexts/DataContext'
import { Plus, X } from 'lucide-react'
import ProductCombobox from './ProductCombobox'
import useEnterMove from '../hooks/useEnterMove'
import { supabase } from '../lib/supabase'

const EditSaleModal = ({ isOpen, onClose, saleGroup }) => {
  // 모든 Hook 선언을 최상단에 배치 (React Hooks 규칙 준수)
  const { clients, products, deleteSale } = useData()
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
      // saleGroup에 originalRows가 있으면 사용, 없으면 Supabase에서 조회
      const loadOriginalRows = async () => {
        try {
          const clientId = saleGroup?.clientId
          const saleDate = saleGroup?.sale_date || saleGroup?.date

          if (!clientId || !saleDate) {
            console.warn('거래처 또는 날짜 정보가 없습니다.')
            return
          }

          // 날짜 변환
          let dateStr = ''
          if (saleDate instanceof Date) {
            dateStr = saleDate.toISOString().split('T')[0]
          } else if (typeof saleDate === 'string') {
            dateStr = saleDate.split('T')[0]
          } else {
            dateStr = saleDate
          }

          // originalRows가 있으면 사용 (그룹핑된 데이터에서 전달됨)
          let originalRows = saleGroup?.originalRows

          if (!originalRows || originalRows.length === 0) {
            // originalRows가 없으면 Supabase에서 조회
            const { data: fetchedRows, error } = await supabase
              .from('sales')
              .select('*')
              .eq('clientId', clientId)
              .eq('sale_date', dateStr)
              .order('created_at', { ascending: true })

            if (error) {
              console.error('원본 데이터 조회 오류:', error)
              // 에러 발생 시 기존 items 사용
              originalRows = saleGroup?.items || []
            } else {
              originalRows = fetchedRows || []
            }
          }

          // 원본 행들을 items 배열로 변환
          const items =
            originalRows?.map((row) => ({
              id: row.id, // DB 행의 id
              productId: '', // productId는 item_name으로 찾아야 함
              item_name: row.item_name || '',
              quantity: row.quantity || 1,
              unitPrice: row.unit_price || 0,
            })) || []

          // productId 찾기 (item_name으로 products에서 찾기)
          const itemsWithProductId = items.map((item) => {
            const product = products?.find((p) => p.name === item.item_name)
            return {
              ...item,
              productId: product?.id || '',
            }
          })

          // 원본 데이터 저장 (Diff 알고리즘용)
          setOriginalItems(itemsWithProductId)
          setOriginalClientId(clientId)
          setOriginalSaleDate(dateStr)

          setFormData({
            clientId: clientId,
            sale_date: dateStr,
            items: itemsWithProductId,
            notes: originalRows?.[0]?.notes || saleGroup?.notes || '',
          })
        } catch (error) {
          console.error('원본 데이터 로드 중 오류:', error)
          // 에러 발생 시 기존 items 사용
          const items = Array.isArray(saleGroup?.items)
            ? saleGroup.items
                .filter((item) => item != null)
                .map((item) => ({
                  id: item.id || null,
                  productId: item?.productId || '',
                  item_name: item?.item_name || item?.productName || item?.name || '',
                  quantity: item?.quantity || 1,
                  unitPrice: item?.unitPrice || item?.unit_price || 0,
                }))
            : []

          setOriginalItems(items)
          setOriginalClientId(saleGroup?.clientId || '')
          setOriginalSaleDate(saleGroup?.sale_date || saleGroup?.date || '')

          setFormData({
            clientId: saleGroup?.clientId || '',
            sale_date: saleGroup?.sale_date || saleGroup?.date || '',
            items: items,
            notes: saleGroup?.notes || '',
          })
        }
      }

      loadOriginalRows()
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

  // Diff 알고리즘: 삭제/수정/추가 처리
  const handleSubmit = async (e) => {
    e.preventDefault()

    // 기본 유효성 검사
    if (!formData.clientId) {
      alert('거래처를 선택해주세요.')
      return
    }

    // 유효한 품목만 필터링
    const validItems = formData.items.filter((item) => {
      const name = item.item_name || item.itemName || item.product_name || ''
      return name && name.trim() !== ''
    })

    if (validItems.length === 0) {
      alert('저장할 유효한 품목이 없습니다.')
      return
    }

    try {
      // 날짜 정제: 빈 문자열이면 null로 변환
      const saleDate = formData.sale_date === '' || formData.sale_date === undefined ? null : formData.sale_date

      // 1. 삭제: 원본에 있었는데 현재 리스트에 없는 항목 삭제
      const originalIds = originalItems.map((item) => item.id).filter((id) => id != null)
      const currentIds = validItems.map((item) => item.id).filter((id) => id != null)
      const idsToDelete = originalIds.filter((id) => !currentIds.includes(id))

      // 2. 수정: ID가 있고 내용이 바뀐 항목 업데이트
      const itemsToUpdate = validItems.filter((item) => {
        if (!item.id) return false // ID가 없으면 새 항목

        const originalItem = originalItems.find((orig) => orig.id === item.id)
        if (!originalItem) return false

        // 내용이 바뀌었는지 확인
        return (
          originalItem.item_name !== item.item_name ||
          originalItem.quantity !== item.quantity ||
          originalItem.unitPrice !== item.unitPrice ||
          originalClientId !== formData.clientId ||
          originalSaleDate !== formData.sale_date
        )
      })

      // 3. 추가: ID가 없는 새 항목
      const itemsToInsert = validItems.filter((item) => !item.id)

      // 병렬 처리: 삭제, 수정, 추가를 Promise.all로 처리
      const promises = []

      // 삭제 처리
      if (idsToDelete.length > 0) {
        promises.push(
          supabase
            .from('sales')
            .delete()
            .in('id', idsToDelete)
        )
      }

      // 수정 처리
      if (itemsToUpdate.length > 0) {
        itemsToUpdate.forEach((item) => {
          const qty = Number(item.quantity) || 1
          const price = Number(item.unitPrice) || 0
          const total = qty * price

          promises.push(
            supabase
              .from('sales')
              .update({
                clientId: formData.clientId,
                sale_date: saleDate,
                item_name: item.item_name.trim(),
                quantity: qty,
                unit_price: price,
                totalAmount: total,
                notes: formData.notes || '',
              })
              .eq('id', item.id)
          )
        })
      }

      // 추가 처리
      if (itemsToInsert.length > 0) {
        const rowsToInsert = itemsToInsert.map((item) => {
          const qty = Number(item.quantity) || 1
          const price = Number(item.unitPrice) || 0
          const total = qty * price

          return {
            clientId: formData.clientId,
            sale_date: saleDate,
            item_name: item.item_name.trim(),
            quantity: qty,
            unit_price: price,
            totalAmount: total,
            notes: formData.notes || '',
          }
        })

        promises.push(supabase.from('sales').insert(rowsToInsert))
      }

      // 모든 작업 병렬 실행
      const results = await Promise.all(promises)

      // 에러 확인
      const errors = results.filter((result) => result.error)
      if (errors.length > 0) {
        console.error('매출 수정 중 오류:', errors)
        throw new Error('일부 데이터를 저장하지 못했습니다.')
      }

      alert('매출이 수정되었습니다.')
      onClose()

      // 페이지 새로고침하여 최신 데이터 반영
      window.location.reload()
    } catch (error) {
      console.error('매출 수정 중 오류:', error)
      alert(`매출 수정 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`)
    }
  }

  // 그룹 전체 삭제
  const handleDelete = async () => {
    if (!saleGroup) {
      alert('매출 정보를 찾을 수 없습니다.')
      onClose()
      return
    }

    if (window.confirm('정말로 이 매출 기록을 삭제하시겠습니까?')) {
      try {
        // 원본 items의 모든 id를 가져와서 삭제
        const idsToDelete = originalItems.map((item) => item.id).filter((id) => id != null)

        if (idsToDelete.length > 0) {
          await supabase.from('sales').delete().in('id', idsToDelete)
        }

        alert('매출 기록이 삭제되었습니다.')
        onClose()

        // 페이지 새로고침하여 최신 데이터 반영
        window.location.reload()
      } catch (error) {
        console.error('매출 삭제 중 오류:', error)
        alert('매출 삭제 중 오류가 발생했습니다.')
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

        <div className="flex justify-between pt-4">
          <button
            type="button"
            onClick={handleDelete}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            삭제
          </button>
          <div className="space-x-3">
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
        </div>
      </form>
    </Modal>
  )
}

export default EditSaleModal
