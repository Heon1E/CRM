import React, { useState, useRef, useEffect } from 'react'
import { Search, Check, ChevronsUpDown } from 'lucide-react'

const ClientCombobox = ({ 
  clients = [], 
  value, 
  onSelect, 
  placeholder = '거래처를 검색하세요...',
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedClient, setSelectedClient] = useState(null)
  const comboboxRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // 선택된 거래처 찾기
  useEffect(() => {
    if (value && clients && Array.isArray(clients)) {
      const client = clients.find((c) => c.id === value)
      setSelectedClient(client || null)
      if (client) {
        setSearchTerm(client.company || '')
      } else {
        setSearchTerm('')
      }
    } else {
      setSelectedClient(null)
      setSearchTerm('')
    }
  }, [value, clients])

  // 필터링된 거래처 목록
  const filteredClients = clients && Array.isArray(clients)
    ? clients.filter((client) =>
        (client.company || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (client.contact_person || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    : []

  // 거래처 선택
  const handleSelect = (client) => {
    setSelectedClient(client)
    setSearchTerm(client.company || '')
    setIsOpen(false)
    onSelect(client.id)
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
      if (filteredClients.length > 0 && !isOpen) {
        setIsOpen(true)
      } else if (isOpen && filteredClients.length > 0) {
        handleSelect(filteredClients[0])
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
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-300 w-4 h-4" />
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value)
            setIsOpen(true)
            if (!e.target.value) {
              setSelectedClient(null)
            }
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="input-field w-full pl-10 pr-10 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={() => {
            setIsOpen(!isOpen)
            inputRef.current?.focus()
          }}
          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-300 hover:text-white"
          disabled={disabled}
        >
          <ChevronsUpDown className="w-4 h-4" />
        </button>
      </div>

      {/* 드롭다운 목록 */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-[#1E1E1E] border border-gray-800 rounded-lg max-h-60 overflow-auto">
          <div ref={listRef} className="py-1">
            {filteredClients.length > 0 ? (
              filteredClients.map((client) => (
                <div
                  key={client.id}
                  role="option"
                  tabIndex={0}
                  onClick={() => handleSelect(client)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleSelect(client)
                    }
                  }}
                  className={`px-4 py-2 cursor-pointer hover:bg-white/5 focus:bg-white/10 focus:outline-none ${
                    selectedClient?.id === client.id ? 'bg-white/10' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-white">{client.company || '알 수 없음'}</span>
                      {client.contact_person && (
                        <span className="text-xs text-gray-300 ml-2">({client.contact_person})</span>
                      )}
                    </div>
                    {selectedClient?.id === client.id && (
                      <Check className="w-4 h-4 text-gray-300" />
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="px-4 py-2 text-sm text-gray-300 text-center">
                {searchTerm ? '검색 결과가 없습니다' : '거래처가 없습니다'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ClientCombobox



