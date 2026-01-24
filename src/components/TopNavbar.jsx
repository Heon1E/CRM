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
    { path: '/map', label: 'Map' },
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
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b-[3px] border-oem-blue h-[50px] shadow-sm flex items-center px-5 font-['Noto_Sans_KR',sans-serif]">
      {/* Left: Logo & Navigation */}
      <div className="flex items-center gap-8 flex-1">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 bg-oem-blue flex items-center justify-center text-white font-black text-xl italic">I</div>
          <span className="text-oem-blue font-black text-lg tracking-tighter group-hover:opacity-80 transition-opacity">IND CRM</span>
        </Link>

        <nav className="hidden lg:flex items-center h-[50px]">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`px-4 h-full flex items-center text-[12px] font-medium transition-colors border-b-2 ${isActive
                    ? 'border-oem-blue text-oem-blue bg-oem-bg-header/50'
                    : 'border-transparent text-oem-text-primary hover:text-oem-blue hover:bg-oem-bg-app'
                  }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Right: Global Tools */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="hidden md:flex items-center relative">
          <input
            type="text"
            placeholder="Search..."
            className="w-48 h-7 bg-oem-bg-panel border border-oem-border px-3 pr-8 rounded-oem text-[11px] focus:outline-none focus:border-oem-blue"
          />
          <div className="absolute right-2 text-oem-text-secondary">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          </div>
        </div>

        <button
          type="button"
          className="p-1.5 text-oem-text-secondary hover:text-oem-blue transition-colors relative"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-oem-red rounded-full border border-white"></span>
        </button>

        <div className="flex items-center gap-3 pl-4 border-l border-oem-border">
          <div className="text-right hidden sm:block">
            <p className="text-[11px] font-bold text-oem-text-primary leading-none uppercase">{user?.user_metadata?.company_name || 'SYSTEM'}</p>
            <p className="text-[10px] text-oem-text-secondary mt-1">{user?.email?.split('@')[0].toUpperCase()}</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-oem-bg-header border border-oem-border flex items-center justify-center text-oem-blue font-bold text-xs">
            {userInitials}
          </div>
        </div>

        <button
          type="button"
          className="lg:hidden p-1.5 text-oem-text-primary"
          onClick={() => setIsMobileOpen((prev) => !prev)}
        >
          {isMobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMobileOpen && (
        <div className="absolute top-[50px] left-0 right-0 bg-white border-b border-oem-border lg:hidden shadow-lg animate-in slide-in-from-top duration-200">
          <div className="p-2 grid grid-cols-2 gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileOpen(false)}
                  className={`px-4 py-3 text-[12px] font-medium rounded-oem ${isActive ? 'bg-oem-bg-header text-oem-blue' : 'text-oem-text-secondary hover:bg-oem-bg-panel'}`}
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
