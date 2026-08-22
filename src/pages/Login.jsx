import React, { useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { HelpCircle, Mail, Lock, Eye } from 'lucide-react'

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

  /*
   * **소개 화면과 같은 세계로 둔다.** 여기까지 오는 길이 `/landing` 하나뿐인데
   * 그쪽은 어두운 화면이고 이쪽은 밝은 화면에 커다란 초록 판이라, 넘어오는 순간
   * 다른 서비스처럼 보였다.
   *
   * **왼쪽 홍보 판을 걷어냈다.** "거래처 · 매출 · 채권 · 견적을 한 곳에서
   * 봅니다"와 기능 네 줄이 화면 절반을 차지하고 있었다. 소개 화면에서 지운 것과
   * 같은 문구다 — 여기 온 사람은 이미 무엇인지 알고 로그인하러 왔다.
   *
   * **입력칸이 든 판은 흰색으로 남긴다.** 어두운 판으로 바꾸면 입력칸·자동완성·
   * 구글 단추까지 전부 다시 맞춰야 하고, 그 과정에서 대비가 깨지기 쉽다.
   * 어두운 바탕 위의 밝은 판은 '들어가는 곳'을 분명히 가리키기도 한다.
   */
  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col relative overflow-hidden">

      {/* 초록 번짐 — 소개 화면과 같은 장식 하나 */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
          w-[620px] h-[420px] max-w-[130vw] bg-oem-blue/20 rounded-full blur-3xl" />
      </div>

      <header className="relative z-20 flex items-center justify-between px-5 sm:px-8 py-4">
        {/* 소개 화면과 같은 글자 로고. 예전에는 로켓 아이콘이었는데 우리 표시가 아니다. */}
        <Link to="/landing" className="flex items-baseline gap-1.5 min-h-[44px] px-1">
          <span className="text-lg font-black text-white">아이앤디</span>
          <span className="text-lg font-black text-oem-blue-light" style={{ fontFamily: 'var(--font-brand-en)' }}>CRM</span>
        </Link>
        {/* 로그인 화면에서 실제로 필요한 것은 도움을 요청할 곳이다.
            예전에는 아무 일도 하지 않는 'Help' 단추였다. */}
        <a href="tel:031-334-9625"
           className="text-white/55 hover:text-white transition-colors flex items-center gap-1.5 text-sm min-h-[44px] px-2">
          <HelpCircle className="w-4 h-4" />
          <span className="hidden sm:inline">문의 031-334-9625</span>
        </a>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-[400px] bg-white p-7 sm:p-9 rounded-2xl shadow-2xl
          animate-in fade-in slide-in-from-bottom-2 duration-500">

          <div className="mb-7">
            <h1 className="text-slate-900 text-2xl font-bold">{appTitle}</h1>
            <p className="text-slate-500 text-sm mt-1">아이디와 비밀번호를 넣어 주세요</p>
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
            <p className="mt-7 text-center text-sm text-slate-500">
              계정이 필요하면 관리자에게 요청하세요.
            </p>
        </div>
      </main>
    </div>
  )
}

export default Login
