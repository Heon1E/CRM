import React, { useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Rocket, HelpCircle, Mail, Lock, Eye } from 'lucide-react'

const Login = () => {
  const navigate = useNavigate()
  const { signInWithGoogle, user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [authMode, setAuthMode] = useState('login') // 'login' or 'signup'
  const [showPassword, setShowPassword] = useState(false)

  // 동적 앱 타이틀: 회사명이 있으면 '회사이름 CRM', 없으면 기본값 'Xavian CRM'
  const appTitle = useMemo(() => {
    const companyName = user?.user_metadata?.company_name || user?.app_metadata?.company_name || null
    return companyName ? `${companyName} CRM` : 'Xavian CRM'
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

  const handleEmailAuth = (e) => {
    e.preventDefault()
    setError('현재 이메일 로그인은 준비 중입니다. Google 로그인을 이용해주세요.')
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-['Inter',_sans-serif] relative overflow-hidden">

      {/* Header */}
      <header className="absolute top-0 w-full flex items-center justify-between px-6 sm:px-12 py-6 z-20">
        <Link to="/landing" className="flex items-center gap-2 group">
          <div className="bg-[#833CF6] text-white p-1.5 rounded-lg shadow-sm">
            <Rocket className="w-5 h-5" />
          </div>
          <h2 className="text-slate-900 text-xl font-bold leading-tight tracking-tight group-hover:text-[#833CF6] transition-colors">{appTitle}</h2>
        </Link>
        <button className="text-slate-500 hover:text-slate-700 transition-colors flex items-center gap-1 text-sm font-medium">
          <HelpCircle className="w-4 h-4" />
          <span className="hidden sm:inline">Help</span>
        </button>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex flex-col lg:flex-row w-full max-w-[1600px] mx-auto min-h-screen pt-20 lg:pt-0">

        {/* Left Panel - Branding & Testimonial (Desktop) */}
        <div className="hidden lg:flex w-1/2 p-12 flex-col justify-center relative">
          <div className="relative overflow-hidden rounded-2xl bg-[#833CF6] h-full max-h-[800px] w-full flex flex-col justify-end p-12 shadow-2xl shadow-[#833CF6]/20">
            {/* Abstract Pattern Overlay */}
            <div className="absolute inset-0 opacity-20 pointer-events-none">
              <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                <path d="M0 100 L100 0 L100 100 Z" fill="white"></path>
                <circle cx="80" cy="30" r="40" fill="white" opacity="0.3"></circle>
              </svg>
            </div>

            <div className="relative z-10 space-y-8 max-w-lg">
              <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-white/20 backdrop-blur-md border border-white/30">
                <span className="text-white text-xs font-bold tracking-wide uppercase">Join 10,000+ top performing teams</span>
              </div>
              <p className="text-white text-3xl font-bold leading-snug">
                "Xavian transformed our sales workflow. We closed 40% more deals in the first quarter alone."
              </p>
              <div className="flex items-center gap-4 pt-4">
                <div className="h-12 w-12 rounded-full bg-slate-200 border-2 border-white/50 flex items-center justify-center font-bold text-slate-600 overflow-hidden">
                  SJ
                </div>
                <div>
                  <p className="text-white text-base font-bold">Sarah Jenkins</p>
                  <p className="text-white/80 text-sm">VP of Sales at TechFlow</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Auth Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 lg:p-24 bg-[#F8FAFC]">
          <div className="w-full max-w-[440px] bg-white p-8 sm:p-10 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 relative z-10">

            <div className="text-center sm:text-left mb-8">
              <h1 className="text-slate-900 text-3xl font-bold mb-2">Welcome back</h1>
              <p className="text-slate-500 text-sm">Enter your details to access your dashboard</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50/50 border-l-4 border-red-500 rounded-r-lg">
                <p className="text-sm text-red-600 font-medium">{error}</p>
              </div>
            )}

            {/* Tab Control */}
            <div className="flex p-1 bg-slate-100 rounded-lg mb-8">
              <button
                onClick={() => setAuthMode('login')}
                className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${authMode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Log in
              </button>
              <button
                onClick={() => setAuthMode('signup')}
                className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${authMode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Sign up
              </button>
            </div>

            <form onSubmit={handleEmailAuth} className="space-y-5">
              {/* Email Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider" htmlFor="email">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    id="email"
                    type="email"
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#833CF6]/20 focus:border-[#833CF6] outline-none transition-all text-slate-900 sm:text-sm"
                    placeholder="name@company.com"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider" htmlFor="password">Password</label>
                  {authMode === 'login' && (
                    <a href="#" className="text-xs font-semibold text-[#833CF6] hover:underline">Forgot password?</a>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className="w-full pl-10 pr-12 py-3 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#833CF6]/20 focus:border-[#833CF6] outline-none transition-all text-slate-900 sm:text-sm"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    <Eye className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* CTA Button */}
              <button
                type="submit"
                className="w-full py-3.5 bg-[#833CF6] hover:bg-[#722EE0] text-white font-bold rounded-lg shadow-lg shadow-[#833CF6]/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                disabled={loading}
              >
                {authMode === 'login' ? 'Log in' : 'Create account'}
              </button>
            </form>

            {/* Divider */}
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-widest">
                <span className="bg-white px-4 text-slate-400 font-medium">Or continue with</span>
              </div>
            </div>

            {/* Social Logins */}
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="flex items-center justify-center gap-3 w-full py-3.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors focus:ring-2 focus:ring-[#833CF6]/20 outline-none"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                <span className="text-sm font-semibold text-slate-700">Continue with Google</span>
              </button>
            </div>

            {/* Footer */}
            <p className="mt-8 text-center text-sm text-slate-500">
              {authMode === 'login' ? "Don't have an account? " : "Already have an account? "}
              <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="font-bold text-[#833CF6] hover:underline">
                {authMode === 'login' ? "Sign up" : "Log in"}
              </button>
            </p>
          </div>
        </div>
      </div>

    </div>
  )
}

export default Login
