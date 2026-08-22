import React, { useState, useRef, useEffect } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'

const ClientCombobox = ({
  clients = [],
  value,
  onSelect,
  onNewClient,
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

  // 신규 거래처 생성
  const handleCreateNew = () => {
    if (onNewClient && searchTerm.trim()) {
      onNewClient(searchTerm.trim())
      setIsOpen(false)
    }
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
      } else if (isOpen && filteredClients.length === 0 && onNewClient && searchTerm.trim()) {
        handleCreateNew()
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
            if (!e.target.value) {
              setSelectedClient(null)
            }
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="oem-input pr-8 disabled:opacity-60 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={() => {
            setIsOpen(!isOpen)
            inputRef.current?.focus()
          }}
          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-oem-text-secondary hover:text-oem-blue"
          disabled={disabled}
        >
          <ChevronsUpDown className="w-4 h-4" />
        </button>
      </div>

      {/* 드롭다운 목록 */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-oem-border rounded-sm shadow-lg max-h-60 overflow-auto">
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
                  className={`px-4 py-2 cursor-pointer hover:bg-gray-50 focus:bg-gray-100 focus:outline-none ${selectedClient?.id === client.id ? 'bg-oem-grey-light text-oem-blue' : 'text-oem-text-primary'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold">{client.company || 'Unknown Client'}</span>
                      {client.contact_person && (
                        <span className="text-xs text-oem-text-secondary ml-2">({client.contact_person})</span>
                      )}
                    </div>
                    {selectedClient?.id === client.id && (
                      <Check className="w-4 h-4 text-oem-blue" />
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="px-4 py-2 text-sm text-oem-text-secondary text-center">
                {searchTerm ? 'No results found.' : 'No clients available.'}
              </div>
            )}
            {/* 신규 거래처 등록 옵션 */}
            {onNewClient && searchTerm.trim() && filteredClients.length === 0 && (
              <div
                onClick={handleCreateNew}
                className="px-4 py-2.5 cursor-pointer hover:bg-green-50 text-green-700 font-bold text-sm border-t border-gray-100 flex items-center gap-1"
              >
                <span className="text-lg leading-none">+</span> "{searchTerm.trim()}" 신규 거래처로 등록
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ClientCombobox



