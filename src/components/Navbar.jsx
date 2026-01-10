import React, { useState, useMemo, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, Activity, Settings, DollarSign, LogOut, User, TrendingUp } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const Navbar = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [companyName, setCompanyName] = useState('')

  // Supabase에서 회사명 불러오기
  useEffect(() => {
    if (!user) {
      setCompanyName('')
      return
    }

    const loadCompanyName = async () => {
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('company_name')
          .eq('user_id', user.id)
          .single()

        if (error && error.code !== 'PGRST116') {
          console.error('회사명 불러오기 오류:', error)
        } else if (data && data.company_name) {
          setCompanyName(data.company_name)
        } else {
          setCompanyName('')
        }
      } catch (error) {
        console.error('회사명 불러오기 예외:', error)
        setCompanyName('')
      }
    }

    loadCompanyName()
    
    // settingsUpdated 이벤트 리스너 등록 (설정 변경 시 즉시 반영)
    const handleSettingsUpdate = () => {
      loadCompanyName()
    }
    
    window.addEventListener('settingsUpdated', handleSettingsUpdate)
    
    return () => {
      window.removeEventListener('settingsUpdated', handleSettingsUpdate)
    }
  }, [user])

  // 동적 앱 타이틀: Supabase settings의 company_name이 있으면 '회사이름 CRM', 없으면 기본값 'Xavian CRM'
  const appTitle = useMemo(() => {
    if (companyName && companyName.trim()) {
      return `${companyName.trim()} CRM`
    }
    // user.user_metadata.company_name 또는 user.app_metadata.company_name 확인 (백업)
    const userCompanyName = user?.user_metadata?.company_name || user?.app_metadata?.company_name || null
    return userCompanyName ? `${userCompanyName} CRM` : 'Xavian CRM'
  }, [user, companyName])

  // 메뉴에서 '제품 관리'와 'ISSUE' 제거
  const menuItems = [
    { path: '/', label: '대시보드', icon: LayoutDashboard },
    { path: '/clients', label: '고객 관리', icon: Users },
    { path: '/activities', label: '영업 활동', icon: Activity },
    { path: '/pipeline', label: '영업 파이프라인', icon: TrendingUp },
    { path: '/sales', label: '매출 관리', icon: DollarSign },
    { path: '/settings', label: '설정', icon: Settings },
  ]

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true)
    try {
      // 현재 전체 URL을 redirectTo로 사용 (경로 포함)
      const redirectTo = window.location.href
      console.log('Navbar: Starting Google login, redirectTo:', redirectTo)
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectTo, // 현재 페이지 전체 URL로 리다이렉트
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
          // ★ 핵심: 구글 캘린더 권한 필수 요청
          scopes: 'https://www.googleapis.com/auth/calendar',
        },
      })
      if (error) {
        console.error('Navbar: Google login error:', error)
        alert('로그인 에러: ' + error.message)
        setIsLoggingIn(false)
      } else {
        console.log('Navbar: OAuth redirect initiated')
        // 성공 시 OAuth 리다이렉트가 발생하므로 여기서는 아무것도 하지 않음
      }
    } catch (error) {
      console.error('Navbar: Google login exception:', error)
      alert('로그인 중 오류가 발생했습니다.')
      setIsLoggingIn(false)
    }
  }

  const handleLogout = async () => {
    if (window.confirm('로그아웃 하시겠습니까?')) {
      await signOut()
      navigate('/login')
    }
  }

  return (
    <nav className="fixed top-0 left-0 right-0 bg-white border-b border-border-light z-50" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
      <div className="flex items-center justify-between h-16 px-2 md:px-6">
        {/* Logo */}
        <div className="flex items-center space-x-4 flex-shrink-0">
          <h1 className="text-xl font-bold text-brand-blue">{appTitle}</h1>
        </div>

        {/* Menu Items - 가로 스크롤 가능 (모바일 대응) */}
        <div className="flex-1 overflow-x-auto mx-2 md:mx-4 scrollbar-hide">
          <div className="flex items-center space-x-1 min-w-max">
            {menuItems.map((item) => {
              const isActive = location.pathname === item.path
              const Icon = item.icon
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`
                    relative flex items-center space-x-1 md:space-x-2 px-2 md:px-3 lg:px-4 py-2 rounded-button transition-all whitespace-nowrap
                    ${
                      isActive
                        ? 'bg-blue-50 text-brand-blue font-semibold'
                        : 'text-text-body hover:bg-gray-50 hover:text-text-primary'
                    }
                  `}
                >
                  <Icon className={`w-4 h-4 md:w-5 md:h-5 flex-shrink-0 ${isActive ? 'text-brand-blue' : 'text-text-secondary'}`} />
                  <span className="text-xs md:text-sm lg:text-base">{item.label}</span>
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue rounded-t"></div>
                  )}
                </Link>
              )
            })}
          </div>
        </div>

        {/* User Section */}
        <div className="flex items-center space-x-2 md:space-x-3 flex-shrink-0">
          {!user ? (
            /* 로그인 안 된 상태: Google 로그인 버튼 */
            <button
              onClick={handleGoogleLogin}
              disabled={isLoggingIn}
              className="flex items-center space-x-2 px-3 md:px-4 py-2 bg-white border border-border-input rounded-button shadow-sm text-text-primary hover:bg-gray-50 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span className="text-sm font-medium">
                {isLoggingIn ? '로그인 중...' : 'Google로 시작하기'}
              </span>
            </button>
          ) : (
            /* 로그인 된 상태: 사용자 정보 + 로그아웃 버튼 */
            <>
              <div className="hidden md:flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-brand-blue" />
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-text-primary">
                    {user.user_metadata?.full_name || user.email?.split('@')[0] || '사용자'}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {user.email || ''}
                  </p>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="flex items-center space-x-1 md:space-x-2 px-2 md:px-3 py-2 text-text-body hover:bg-gray-50 hover:text-text-primary rounded-button transition-colors"
                title="로그아웃"
              >
                <LogOut className="w-4 h-4 md:w-5 md:h-5" />
                <span className="hidden lg:inline text-sm">로그아웃</span>
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}

export default Navbar

