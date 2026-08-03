import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Command, Users, LayoutDashboard, Calendar, Settings, FileText, ArrowRight } from 'lucide-react'
import { useData } from '../contexts/DataContext'

const CommandPalette = () => {
    const [isOpen, setIsOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)
    const inputRef = useRef(null)
    const listRef = useRef(null)
    const navigate = useNavigate()
    const { clients } = useData()

    // Toggle with Ctrl+K / Cmd+K
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault()
                setIsOpen(prev => !prev)
            }
            if (e.key === 'Escape') {
                setIsOpen(false)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50)
            setQuery('')
            setSelectedIndex(0)
        }
    }, [isOpen])

    // Define Searchable Items
    const pages = [
        { id: 'dashboard', type: 'page', name: 'Dashboard', path: '/', icon: LayoutDashboard },
        { id: 'clients', type: 'page', name: 'Clients (List)', path: '/clients', icon: Users },
        { id: 'calendar', type: 'page', name: 'Calendar', path: '/calendar', icon: Calendar },
        { id: 'pipeline', type: 'page', name: 'Sales Pipeline', path: '/pipeline', icon: FileText },
        { id: 'settings', type: 'page', name: 'Settings', path: '/settings', icon: Settings },
    ]

    // Filter Logic
    const filteredItems = React.useMemo(() => {
        if (!query) return pages

        const lowerQuery = query.toLowerCase()

        // Filter Pages
        const matchedPages = pages.filter(p => p.name.toLowerCase().includes(lowerQuery))

        // Filter Clients (Limit 5)
        const matchedClients = (clients || [])
            .filter(c => c.company.toLowerCase().includes(lowerQuery) || (c.contact_person && c.contact_person.toLowerCase().includes(lowerQuery)))
            .slice(0, 5)
            .map(c => ({
                id: `client-${c.id}`,
                type: 'client',
                name: c.company,
                sub: c.contact_person,
                path: `/clients/${c.id}`,
                icon: Users
            }))

        return [...matchedPages, ...matchedClients]
    }, [query, clients])

    // Keyboard Navigation
    const handleInputKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSelectedIndex(prev => (prev + 1) % filteredItems.length)
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length)
        } else if (e.key === 'Enter') {
            e.preventDefault()
            if (filteredItems.length > 0) {
                handleSelect(filteredItems[selectedIndex])
            }
        }
    }

    const handleSelect = (item) => {
        navigate(item.path)
        setIsOpen(false)
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-24 animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">

                {/* Search Input */}
                <div className="flex items-center px-4 py-3 border-b border-slate-100">
                    <Search className="w-5 h-5 text-slate-400 mr-3" />
                    <input
                        ref={inputRef}
                        type="text"
                        className="flex-1 bg-transparent outline-none text-slate-700 placeholder:text-slate-400 text-lg"
                        placeholder="Type a command or search..."
                        value={query}
                        onChange={e => {
                            setQuery(e.target.value)
                            setSelectedIndex(0)
                        }}
                        onKeyDown={handleInputKeyDown}
                    />
                    <div className="flex items-center gap-1">
                        <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-xs font-semibold text-slate-400 bg-slate-100 border border-slate-200 rounded">ESC</kbd>
                    </div>
                </div>

                {/* Results List */}
                <div ref={listRef} className="max-h-[300px] overflow-y-auto p-2">
                    {filteredItems.length > 0 ? (
                        filteredItems.map((item, idx) => {
                            const Icon = item.icon
                            return (
                                <button
                                    key={item.id}
                                    className={`w-full flex items-center px-3 py-2.5 rounded-lg text-left transition-colors ${idx === selectedIndex ? 'bg-indigo-50 text-indigo-900' : 'text-slate-700 hover:bg-slate-50'
                                        }`}
                                    onClick={() => handleSelect(item)}
                                    onMouseEnter={() => setSelectedIndex(idx)}
                                >
                                    <div className={`w-8 h-8 rounded-md flex items-center justify-center mr-3 ${idx === selectedIndex ? 'bg-white text-indigo-600 shadow-sm' : 'bg-slate-100 text-slate-500'
                                        }`}>
                                        <Icon className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <p className={`text-sm font-medium truncate ${idx === selectedIndex ? 'font-bold' : ''}`}>{item.name}</p>
                                        {item.sub && <p className="text-xs text-slate-400 truncate">Contact: {item.sub}</p>}
                                    </div>
                                    {idx === selectedIndex && (
                                        <ArrowRight className="w-4 h-4 text-indigo-400" />
                                    )}
                                </button>
                            )
                        })
                    ) : (
                        <div className="py-8 text-center text-slate-400">
                            <Command className="w-8 h-8 mx-auto mb-2 opacity-20" />
                            <p className="text-sm">No results found.</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-medium">
                    <span>ProTip: Use arrows to navigate, Enter to select</span>
                    <span>Open Quick Actions with Ctrl+K</span>
                </div>
            </div>
        </div>
    )
}

export default CommandPalette
