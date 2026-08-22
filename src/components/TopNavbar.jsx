import React, { useMemo, useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bell, Menu, X, Search } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import GlobalSearch from './GlobalSearch'

const TopNavbar = () => {
  const location = useLocation()
  const { user } = useAuth()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // Ctrl+K / Cmd+K 로 검색 열기 (업무용 프로그램의 관례)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 한국어 제품인데 메뉴가 영문이라 '설정'을 찾지 못한다는 이야기가 나왔다.
  // 견적서·발주서·채권관리만 한글이고 나머지가 영문이라 더 헷갈렸다.
  const navItems = [
    { path: '/', label: '대시보드' },
    { path: '/clients', label: '거래처' },
    { path: '/sales', label: '매출' },
    { path: '/quotes', label: '견적서' },
    { path: '/statements', label: '거래명세서' },
    { path: '/purchase-orders', label: '발주서' },
    { path: '/receivables', label: '채권관리' },
    { path: '/activities', label: '영업활동' },
    { path: '/pipeline', label: '영업기회' },
    { path: '/my-accounts', label: '내 담당' },
    { path: '/settings', label: '설정' },
  ]

  const userInitials = useMemo(() => {
    const name = user?.user_metadata?.full_name || user?.email || ''
    if (!name) return 'U'
    const parts = name.split(' ').filter(Boolean)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }, [user])

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 h-[56px] flex items-center px-6 font-['Inter',sans-serif]"
      style={{
        backgroundColor: 'var(--bg-header)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 1px 12px rgba(0,0,0,0.4)'
      }}
    >
      {/* Left: Logo & Navigation */}
      <div className="flex items-center gap-8 flex-1">
        {/*
          **회사 로고를 쓴다.** 예전에는 초록 네모 안에 'X' 한 글자였다 —
          템플릿에서 온 자리이고 우리 표시가 아니다. 매일 여는 화면의 왼쪽 위는
          그 회사가 누구인지 말하는 자리다.
          `public/brand-logo.png`는 견적서·발주서에 쓰는 것과 같은 파일이다 —
          화면과 문서가 같은 것을 보여야 한 회사가 만든 것처럼 보인다.
        */}
        <Link to="/" className="flex items-center gap-2.5 group min-h-[44px]" aria-label="아이앤디 CRM 홈">
          {/*
            **IND 마크만 쓴다** (`brand-mark.png`). 원본 로고에는 아래에
            'PACKAGING SOLUTION'이 붙어 있는데, 상단바 높이(22px)로 줄이면
            그 줄이 회색 얼룩이 된다. 옆에 회사 이름이 글자로 있으니 마크만으로
            충분하다. 문서(견적서·발주서)에는 원본을 그대로 쓴다 — 거기서는
            크게 들어가 다 읽힌다.
            배경은 투명하게 따 두었다. 흰 네모가 붙어 있으면 상단바 회색과
            부딪힌다.
          */}
          <img
            src="/brand-mark.png"
            alt=""
            style={{ height: 22, width: 'auto', objectFit: 'contain' }}
          />
          <span className="font-bold text-base sm:text-lg tracking-tight transition-colors"
            style={{ color: 'var(--text-primary)' }}
          >아이앤디 CRM</span>
        </Link>

        <nav className="hidden lg:flex items-center h-[56px] gap-6">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className="relative py-4 text-[13px] font-semibold transition-all border-b-2"
                style={{
                  color: isActive ? 'var(--accent-light)' : 'var(--text-secondary)',
                  borderBottomColor: isActive ? 'var(--accent)' : 'transparent',
                }}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Right: Global Tools */}
      <div className="flex items-center gap-5">
        {/* Search */}
        <div className="hidden md:flex items-center relative group">
          {/* 예전에는 핸들러가 없는 장식용 input이었다. 눌러서 검색을 연다. */}
          <button
          onClick={() => setSearchOpen(true)}
          className="md:hidden icon-btn"
          title="거래처 찾기"
        >
          <Search className="w-4 h-4" />
        </button>

        <button
            onClick={() => setSearchOpen(true)}
            className="w-52 h-8 px-3 pl-9 rounded-lg text-sm outline-none transition-all text-left"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
            }}
          >
            거래처 찾기
            <kbd style={{ float: 'right', fontSize: 10, opacity: 0.7 }}>Ctrl K</kbd>
          </button>
          <div className="absolute left-3 pointer-events-none" style={{ color: 'var(--text-muted)' }}>
            <Search className="w-4 h-4" />
          </div>
        </div>

        <button
          type="button"
          className="p-2 relative transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent)' }}></span>
        </button>

        <div className="flex items-center gap-3 pl-5 h-8" style={{ borderLeft: '1px solid var(--border)' }}>
          <div className="text-right hidden sm:block">
            <p className="text-[12px] font-bold leading-none" style={{ color: 'var(--text-primary)' }}>
              {user?.user_metadata?.company_name || '아이앤디'}
            </p>
            <div className="flex items-center justify-end gap-1 mt-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--success)' }}></span>
              <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>접속 중</span>
            </div>
          </div>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs cursor-pointer transition-all"
            style={{
              backgroundColor: 'var(--accent-subtle)',
              border: '1px solid rgba(16,185,129,0.3)',
              color: 'var(--accent-light)',
            }}
          >
            {userInitials}
          </div>
        </div>

        <button
          type="button"
          className="lg:hidden p-2"
          style={{ color: 'var(--text-secondary)' }}
          onClick={() => setIsMobileOpen((prev) => !prev)}
        >
          {isMobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMobileOpen && (
        <div
          className="absolute top-[56px] left-0 right-0 lg:hidden z-40"
          style={{ backgroundColor: 'var(--bg-header)', borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex flex-col">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileOpen(false)}
                  className="px-6 py-4 text-[13px] font-semibold border-l-4 transition-colors"
                  style={{
                    color: isActive ? 'var(--accent-light)' : 'var(--text-secondary)',
                    borderLeftColor: isActive ? 'var(--accent)' : 'transparent',
                    backgroundColor: isActive ? 'var(--accent-subtle)' : 'transparent',
                  }}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      )}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  )
}

export default TopNavbar
