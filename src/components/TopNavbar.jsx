import React, { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bell, Menu, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const TopNavbar = () => {
  const location = useLocation()
  const { user } = useAuth()
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  const navItems = [
    { path: '/', label: 'Dashboard' },
    { path: '/clients', label: 'Customers' },
    { path: '/sales', label: 'Sales' },
    { path: '/activities', label: 'Activities' },
    { path: '/pipeline', label: 'Pipeline' },
    { path: '/settings', label: 'Settings' },
  ]

  const userInitials = useMemo(() => {
    const name = user?.user_metadata?.full_name || user?.email || ''
    if (!name) return 'U'
    const parts = name.split(' ').filter(Boolean)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }, [user])

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white shadow-sm">
      <div className="h-16">
        <div className="container mx-auto px-6 flex items-center justify-between h-full">
        <div className="flex items-center gap-8">
          <Link to="/" className="text-slate-900 font-semibold text-lg">
            IND CRM
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`text-sm font-medium transition-colors ${
                    isActive ? 'text-primary-teal' : 'text-slate-500 hover:text-ink-teal'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="p-2 rounded-full text-slate-500 hover:text-ink-teal hover:bg-slate-100 transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
          </button>
          <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-semibold">
            {userInitials}
          </div>
          <button
            type="button"
            className="md:hidden p-2 rounded-full text-slate-500 hover:text-ink-teal hover:bg-slate-100 transition-colors"
            aria-label="Open menu"
            onClick={() => setIsMobileOpen((prev) => !prev)}
          >
            {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>
      </div>
      {isMobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white">
          <div className="container mx-auto px-6 py-4 flex flex-col gap-3">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileOpen(false)}
                  className={`text-sm font-medium transition-colors ${
                    isActive ? 'text-primary-teal' : 'text-slate-500 hover:text-ink-teal'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </header>
  )
}

export default TopNavbar
