import React, { useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Rocket, HelpCircle, Mail, Lock, Eye } from 'lucide-react'

const Login = () => {
  const navigate = useNavigate()
  const { signIn, signInWithGoogle, user } = useAuth()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  /*
   * **스스로 가입하는 길을 없앴다.** 이 앱은 사내 도구인데 배포 주소는 공개돼
   * 있다. 가입 버튼 하나로 거래처 1,150곳과 매출 15,221건을 전부 읽고 쓸 수
   * 있었다. 계정은 관리자가 만든다.
   * 화면에서 버튼만 지우면 안 된다 — 요청을 직접 보내면 그만이다.
   * DB에서도 막았다: 새 계정은 '승인 대기'로 들어와 아무것도 못 읽는다
   * (execution/sql/pending_role.sql).
   */

  // 회사명이 있으면 '회사이름 CRM'. 없으면 우리 회사 이름을 쓴다 —
  // 예전 기본값이 'Xavian CRM'이라 우리 회사 로그인 화면에 남의 이름이 떴다.
  const appTitle = useMemo(() => {
    const companyName = user?.user_metadata?.company_name || user?.app_metadata?.company_name || null
    return companyName ? `${companyName} CRM` : '아이앤디 CRM'
  }, [user])

  const handleGoogleSignIn = async () => {
    setError('')
    setLoading(true)

    try {
      const result = await signInWithGoogle()

      if (!result.success) {
        setError(result.error || 'Google 로그인에 실패했습니다.')
        setLoading(false)
      }
      // 성공 시 OAuth 리다이렉트가 발생하므로 여기서는 아무것도 하지 않음
    } catch (error) {
      console.error('Google login error:', error)
      setError('Google 로그인 중 오류가 발생했습니다.')
      setLoading(false)
    }
  }

  /**
   * 아이디 + 비밀번호. 아이디만 넣으면 AuthContext가 도메인을 붙여 준다.
   * (예전에는 '준비 중입니다'만 띄우고 Google로만 들어갈 수 있었다.)
   */
  const handleEmailAuth = async (e) => {
    e.preventDefault()
    setError('')
    if (!loginId.trim() || !password) {
      setError('아이디와 비밀번호를 넣어 주세요.')
      return
    }
    setLoading(true)
    const result = await signIn(loginId.trim(), password)
    setLoading(false)
    if (!result.success) {
      setError(result.error || '로그인하지 못했습니다.')
      return
    }
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-['Inter',_sans-serif] relative overflow-hidden">

      {/* Header */}
      <header className="absolute top-0 w-full flex items-center justify-between px-6 sm:px-12 py-6 z-20">
        <Link to="/landing" className="flex items-center gap-2 group min-h-[44px]">
          <div className="bg-[#007538] text-white p-1.5 rounded-lg shadow-sm">
            <Rocket className="w-5 h-5" />
          </div>
          <h2 className="text-slate-900 text-xl font-bold leading-tight tracking-tight group-hover:text-[#007538] transition-colors">{appTitle}</h2>
        </Link>
        {/* 예전에는 아무 일도 하지 않는 'Help' 버튼이었다. 누를 것이 있는 것처럼
            보이면 누르게 되고, 아무 일도 안 일어나면 고장으로 읽힌다.
            로그인 화면에서 실제로 필요한 것은 도움을 요청할 곳이다. */}
        <a href="tel:031-334-9625"
           className="text-slate-500 hover:text-slate-700 transition-colors flex items-center gap-1.5 text-sm font-medium min-h-[44px] px-2">
          <HelpCircle className="w-4 h-4" />
          <span className="hidden sm:inline">문의 031-334-9625</span>
        </a>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex flex-col lg:flex-row w-full max-w-[1600px] mx-auto min-h-screen pt-20 lg:pt-0">

        {/* Left Panel - Branding & Testimonial (Desktop) */}
        <div className="hidden lg:flex w-1/2 p-12 flex-col justify-center relative">
          <div className="relative overflow-hidden rounded-2xl bg-[#007538] h-full max-h-[800px] w-full flex flex-col justify-end p-12 shadow-2xl shadow-[#007538]/20">
            {/* Abstract Pattern Overlay */}
            <div className="absolute inset-0 opacity-20 pointer-events-none">
              <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                <path d="M0 100 L100 0 L100 100 Z" fill="white"></path>
                <circle cx="80" cy="30" r="40" fill="white" opacity="0.3"></circle>
              </svg>
            </div>

            {/*
              여기에는 원래 지어낸 고객 추천사("Sarah Jenkins, VP of Sales at
              TechFlow")와 'Join 10,000+ teams'가 박혀 있었다. 둘 다 사실이
              아니다. 사내 도구의 로그인 화면에 없는 고객의 말을 실어 둘 이유가
              없고, 거래처가 이 화면을 볼 수도 있다. 실제로 하는 일을 적는다.
            */}
            <div className="relative z-10 space-y-7 max-w-lg">
              {/* 흰색 20%를 깔면 초록이 밝아져 흰 글씨 대비가 3.94로 떨어진다
                  (12px는 4.5 필요). 어둡게 깔아야 읽힌다 — 브라우저에서 쟀다. */}
              <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-black/20 backdrop-blur-md border border-white/25">
                <span className="text-white text-xs font-bold tracking-wide">아이앤디 주식회사 영업관리</span>
              </div>
              <p className="text-white text-3xl font-bold leading-snug">
                거래처 · 매출 · 채권 · 견적을<br />한 곳에서 봅니다.
              </p>
              <ul className="space-y-2.5 text-white/90 text-[15px] leading-relaxed">
                <li>· 매일 아침 오늘 할 일과 지난 약속을 알려 줍니다</li>
                <li>· 매출이 꺾인 곳과 연락이 끊긴 곳을 짚어 줍니다</li>
                <li>· 견적서 · 발주서 · 거래명세서를 바로 만듭니다</li>
                <li>· 결제가 밀린 순서로 채권을 세웁니다</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Right Panel - Auth Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 lg:p-24 bg-[#F8FAFC]">
          <div className="w-full max-w-[440px] bg-white p-8 sm:p-10 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 relative z-10">

            <div className="text-center sm:text-left mb-8">
              <h1 className="text-slate-900 text-3xl font-bold mb-2">{appTitle}</h1>
              <p className="text-slate-500 text-sm">아이디와 비밀번호를 넣어 주세요</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50/50 border-l-4 border-red-500 rounded-r-lg">
                <p className="text-sm text-[color:var(--danger)] font-medium">{error}</p>
              </div>
            )}

            <form onSubmit={handleEmailAuth} className="space-y-5">
              {/* Email Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider" htmlFor="email">아이디</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
                  <input
                    id="email"
                    type="text"
                    autoComplete="username"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#007538]/20 focus:border-[#007538] outline-none transition-all text-slate-900 sm:text-sm"
                    placeholder="아이디 또는 이메일"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider" htmlFor="password">비밀번호</label>
                  {/* 예전에 href="#" 인 '비밀번호 찾기'가 있었다. 눌러도 아무 일이
                      일어나지 않는다. 아이디가 회사 내부용(@idibc.local)이라 메일로
                      보낼 수도 없다. 관리자에게 요청하는 것이 실제 절차다. */}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-3 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#007538]/20 focus:border-[#007538] outline-none transition-all text-slate-900 sm:text-sm"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? '비밀번호 가리기' : '비밀번호 보기'}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-slate-500 hover:text-slate-600 focus:outline-none"
                  >
                    <Eye className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* CTA Button */}
              <button
                type="submit"
                className="w-full py-3.5 bg-[#007538] hover:bg-[#005C2B] text-white font-bold rounded-lg shadow-lg shadow-[#007538]/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                disabled={loading}
              >
                {loading ? '들어가는 중…' : '로그인'}
              </button>
            </form>

            {/* Divider */}
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-widest">
                <span className="bg-white px-4 text-slate-500 font-medium">또는</span>
              </div>
            </div>

            {/* Social Logins */}
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="flex items-center justify-center gap-3 w-full py-3.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors focus:ring-2 focus:ring-[#007538]/20 outline-none"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                <span className="text-sm font-semibold text-slate-700">구글 계정으로 로그인</span>
              </button>
            </div>

            {/*
              예전에는 여기에 '계정이 없으신가요? Sign up'이 있었다. 그런데 이
              앱은 사내 도구이고 배포 주소는 공개돼 있다. 스스로 가입하면 곧바로
              거래처·매출을 전부 읽고 쓸 수 있었다. 계정은 관리자가 만든다.
              (DB에서도 막았다 — execution/sql/pending_role.sql)
            */}
            <p className="mt-8 text-center text-sm text-slate-500">
              계정이 필요하면 관리자에게 요청하세요.
            </p>
          </div>
        </div>
      </div>

    </div>
  )
}

export default Login
