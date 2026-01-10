import React, { useState, useMemo, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, Activity, Settings, DollarSign, LogOut, User, TrendingUp, Cloud, Bell } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { showLocalNotification, requestNotificationPermission } from '../utils/pushNotification'

const Navbar = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [isBackingUp, setIsBackingUp] = useState(false)

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

  // 데이터 백업 기능
  const handleBackup = async () => {
    if (!user) {
      alert('로그인이 필요합니다.')
      return
    }

    if (isBackingUp) {
      return
    }

    setIsBackingUp(true)

    try {
      // 알림: 백업 시작
      alert('데이터 백업을 시작합니다...')

      // Supabase에서 모든 테이블 데이터 가져오기
      const [productsResult, clientsResult, activitiesResult, salesResult, issuesResult, settingsResult] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('clients').select('*'),
        supabase.from('activities').select('*'),
        supabase.from('sales').select('*'),
        supabase.from('issues').select('*'),
        supabase.from('settings').select('*').eq('user_id', user.id)
      ])

      // 에러 확인
      const errors = []
      if (productsResult.error) errors.push(`제품 데이터: ${productsResult.error.message}`)
      if (clientsResult.error) errors.push(`고객 데이터: ${clientsResult.error.message}`)
      if (activitiesResult.error) errors.push(`활동 데이터: ${activitiesResult.error.message}`)
      if (salesResult.error) errors.push(`매출 데이터: ${salesResult.error.message}`)
      if (issuesResult.error) errors.push(`이슈 데이터: ${issuesResult.error.message}`)
      if (settingsResult.error && settingsResult.error.code !== 'PGRST116') {
        errors.push(`설정 데이터: ${settingsResult.error.message}`)
      }

      if (errors.length > 0) {
        console.error('백업 중 일부 데이터 로드 실패:', errors)
        alert(`백업 중 일부 데이터를 불러오지 못했습니다:\n${errors.join('\n')}`)
      }

      // 백업 데이터 객체 생성
      const backupData = {
        metadata: {
          backup_date: new Date().toISOString(),
          backup_version: '1.0',
          user_email: user.email || '',
          user_id: user.id || '',
          company_name: companyName || 'Xavian CRM'
        },
        data: {
          products: productsResult.data || [],
          clients: clientsResult.data || [],
          activities: activitiesResult.data || [],
          sales: salesResult.data || [],
          issues: issuesResult.data || [],
          settings: settingsResult.data || []
        },
        summary: {
          products_count: (productsResult.data || []).length,
          clients_count: (clientsResult.data || []).length,
          activities_count: (activitiesResult.data || []).length,
          sales_count: (salesResult.data || []).length,
          issues_count: (issuesResult.data || []).length,
          settings_count: (settingsResult.data || []).length
        }
      }

      // JSON 문자열로 변환 (가독성을 위해 들여쓰기 적용)
      const jsonString = JSON.stringify(backupData, null, 2)

      // 파일 이름 생성: backup_YYYYMMDD_XavianCRM.json
      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      const fileName = `backup_${year}${month}${day}_XavianCRM.json`

      // Blob 생성 및 다운로드
      const blob = new Blob([jsonString], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      // 알림: 백업 완료 (브라우저 alert)
      const totalCount = backupData.summary.products_count + backupData.summary.clients_count + backupData.summary.activities_count + backupData.summary.sales_count + backupData.summary.issues_count
      alert(`데이터 백업이 완료되었습니다!\n\n백업 파일: ${fileName}\n\n총 ${totalCount}건의 데이터가 백업되었습니다.`)

      // 푸시 알림 표시 (모바일 알림)
      try {
        await showLocalNotification('백업 완료', {
          body: `데이터 백업이 성공적으로 완료되었습니다.\n파일: ${fileName}\n총 ${totalCount}건의 데이터`,
          icon: '/vite.svg',
          badge: '/vite.svg',
          tag: 'backup-complete',
          requireInteraction: false,
          vibrate: [200, 100, 200],
          data: {
            type: 'backup',
            fileName: fileName,
            totalCount: totalCount,
            timestamp: new Date().toISOString()
          },
          actions: [
            {
              action: 'open',
              title: '열기',
              icon: '/vite.svg'
            },
            {
              action: 'close',
              title: '닫기'
            }
          ]
        })
      } catch (error) {
        console.error('푸시 알림 표시 실패:', error)
      }

    } catch (error) {
      console.error('데이터 백업 중 오류 발생:', error)
      alert(`데이터 백업 중 오류가 발생했습니다:\n${error.message}`)
    } finally {
      setIsBackingUp(false)
    }
  }

  return (
    <nav className="fixed top-0 left-0 right-0 bg-white border-b border-border-light z-50" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
      <div className="flex items-center justify-between h-16 px-2 md:px-6">
        {/* Logo */}
        <div className="flex items-center space-x-4 flex-shrink-0">
          <h1 className="text-xl font-bold text-brand-blue">{appTitle}</h1>
        </div>

        {/* Menu Items - PC에서만 표시 (모바일에서는 하단 탭바 사용) */}
        <div className="hidden md:flex flex-1 overflow-x-auto mx-2 md:mx-4 scrollbar-hide">
          <div className="flex items-center space-x-1 min-w-max">
            {menuItems.map((item) => {
              const isActive = location.pathname === item.path
              const Icon = item.icon
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`
                    relative flex items-center space-x-1 md:space-x-2 px-2 md:px-3 lg:px-4 py-2 rounded-button transition-all whitespace-nowrap touch-manipulation
                    ${
                      isActive
                        ? 'bg-blue-50 text-brand-blue font-semibold'
                        : 'text-text-body hover:bg-gray-50 hover:text-text-primary'
                    }
                  `}
                  style={{ minHeight: '44px', WebkitTapHighlightColor: 'transparent' }}
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
        
        {/* 모바일: 앱 타이틀만 표시 (메뉴는 하단 탭바로 이동) */}
        <div className="md:hidden flex-1 flex items-center justify-center">
          <h1 className="text-lg font-bold text-brand-blue">{appTitle}</h1>
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
            /* 로그인 된 상태: 백업 버튼 + 사용자 정보 + 로그아웃 버튼 */
            <>
              {/* 데이터 백업 버튼 */}
              <button
                onClick={handleBackup}
                disabled={isBackingUp}
                className="flex items-center space-x-1 md:space-x-2 px-2 md:px-3 py-2 text-text-body hover:bg-gray-50 hover:text-text-primary rounded-button transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="데이터 백업"
              >
                <Cloud className="w-4 h-4 md:w-5 md:h-5" />
                <span className="hidden lg:inline text-sm">
                  {isBackingUp ? '백업 중...' : '데이터 백업'}
                </span>
              </button>

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

