import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Home, Users, Map as MapIcon, Menu } from 'lucide-react'

const BottomNavigation = () => {
  const location = useLocation()
  const currentPath = location.pathname

  const navItems = [
    { path: '/', label: '홈', icon: Home },
    { path: '/clients', label: '거래처', icon: Users },
    { path: '/map', label: '주변', icon: MapIcon },
    { path: '/settings', label: '더보기', icon: Menu },
  ]

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-bottom shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
      <div className="flex justify-between items-center px-2 h-16">
        {navItems.map((item) => {
          const isActive = currentPath === item.path

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-colors ${isActive ? 'text-oem-blue' : 'text-gray-500 hover:text-gray-600'
                }`}
            >
              <item.icon className={`w-6 h-6 mb-1 ${isActive ? 'fill-current opacity-20' : ''}`} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export default BottomNavigation
