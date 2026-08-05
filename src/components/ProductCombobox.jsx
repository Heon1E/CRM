import React, { useState, useRef, useEffect } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'

const ProductCombobox = ({ 
  products = [], 
  value, 
  onSelect, 
  placeholder = '품목을 검색하세요...',
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const comboboxRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // 선택된 제품 찾기
  useEffect(() => {
    if (value && products && Array.isArray(products)) {
      const product = products.find((p) => p.id === value)
      setSelectedProduct(product || null)
      if (product) {
        setSearchTerm(product.name)
      } else {
        setSearchTerm('')
      }
    } else {
      setSelectedProduct(null)
      setSearchTerm('')
    }
  }, [value, products])

  // 필터링된 제품 목록
  const filteredProducts = products && Array.isArray(products)
    ? products.filter((product) =>
        product.name?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : []

  // 제품 선택
  const handleSelect = (product) => {
    setSelectedProduct(product)
    setSearchTerm(product.name)
    setIsOpen(false)
    onSelect(product.id)
  }

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (comboboxRef.current && !comboboxRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // 키보드 네비게이션
  const handleKeyDown = (e) => {
    if (disabled) return

    if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredProducts.length > 0 && !isOpen) {
        setIsOpen(true)
      } else if (isOpen && filteredProducts.length > 0) {
        handleSelect(filteredProducts[0])
        // 부모 컴포넌트에 엔터 키 이벤트 전달
        const quantityInput = comboboxRef.current?.closest('.grid')?.querySelector('input[type="number"]')
        if (quantityInput) {
          setTimeout(() => quantityInput.focus(), 100)
        }
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      inputRef.current?.blur()
    } else if (e.key === 'ArrowDown' && !isOpen) {
      e.preventDefault()
      setIsOpen(true)
    } else if (e.key === 'ArrowDown' && isOpen) {
      e.preventDefault()
      if (listRef.current) {
        const firstItem = listRef.current.querySelector('[role="option"]')
        firstItem?.focus()
      }
    }
  }

  return (
    <div className="relative" ref={comboboxRef} data-combobox>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value)
            setIsOpen(true)
            // 검색어가 비워져도 onSelect를 호출하지 않음 (포커스 유지)
            // 사용자가 명시적으로 품목을 선택했을 때만 onSelect 호출
            if (!e.target.value) {
              setSelectedProduct(null)
              // onSelect('') 제거 - 검색어 삭제 시 포커스 이동 방지
            }
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="input-field w-full pr-8 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={() => {
            setIsOpen(!isOpen)
            inputRef.current?.focus()
          }}
          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
          disabled={disabled}
        >
          <ChevronsUpDown className="w-4 h-4" />
        </button>
      </div>

      {/* 드롭다운 목록 */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-[color:var(--bg-card)] border border-[color:var(--border)] rounded-lg max-h-60 overflow-auto">
          <div ref={listRef} className="py-1">
            {filteredProducts.length > 0 ? (
              filteredProducts.map((product) => (
                <div
                  key={product.id}
                  role="option"
                  tabIndex={0}
                  onClick={() => handleSelect(product)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleSelect(product)
                    }
                  }}
                  className={`px-4 py-2 cursor-pointer hover:bg-[color:var(--bg-subtle)] focus:bg-white/10 focus:outline-none ${
                    selectedProduct?.id === product.id ? 'bg-white/10' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[color:var(--text-primary)]">{product.name}</span>
                    {selectedProduct?.id === product.id && (
                      <Check className="w-4 h-4 text-[color:var(--text-secondary)]" />
                    )}
                  </div>
                  {product.type && (
                    <span className="text-xs text-[color:var(--text-secondary)]">{product.type}</span>
                  )}
                </div>
              ))
            ) : (
              <div className="px-4 py-2 text-sm text-[color:var(--text-secondary)] text-center">
                {searchTerm ? '검색 결과가 없습니다' : '품목이 없습니다'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ProductCombobox




