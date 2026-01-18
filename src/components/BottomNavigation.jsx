import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Users, Activity, Settings, TrendingUp } from 'lucide-react'

const BottomNavigation = () => {
  const location = useLocation()

  // 모바일에서만 표시할 메뉴 항목 (5개 메뉴)
  const menuItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/clients', label: 'Clients', icon: Users },
    { path: '/pipeline', label: 'Pipeline', icon: TrendingUp },
    { path: '/activities', label: 'Activities', icon: Activity },
    { path: '/settings', label: 'Settings', icon: Settings },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#121212]/85 backdrop-blur border-t border-gray-800 z-50 md:hidden">
      <div className="flex items-center justify-around h-16 px-2">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path
          const Icon = item.icon
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`
                flex flex-col items-center justify-center flex-1 h-full
                transition-all duration-200
                ${isActive ? 'text-white' : 'text-gray-300'}
                active:bg-white/5
                touch-manipulation
              `}
              style={{ 
                minHeight: '44px', // iOS 터치 가이드라인 (최소 44x44px)
                WebkitTapHighlightColor: 'transparent'
              }}
            >
              <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'text-white' : 'text-gray-300'}`} />
              <span className={`text-[10px] font-medium ${isActive ? 'text-white' : 'text-gray-300'}`}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
      {/* iOS Safe Area 대응 (iPhone X 이후 노치 영역) */}
      <div className="h-safe-area-inset-bottom bg-[#121212]/85"></div>
      <style>{`
        @supports (padding: max(0px)) {
          .h-safe-area-inset-bottom {
            height: max(0px, env(safe-area-inset-bottom));
          }
        }
      `}</style>
    </nav>
  )
}

export default BottomNavigation



