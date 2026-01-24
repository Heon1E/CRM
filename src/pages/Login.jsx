import React, { useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const Login = () => {
  const navigate = useNavigate()
  const { signInWithGoogle, user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 동적 앱 타이틀: 회사명이 있으면 '회사이름 CRM', 없으면 기본값 'Xavian CRM'
  const appTitle = useMemo(() => {
    // user.user_metadata.company_name 또는 user.app_metadata.company_name 확인
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
      // 사용자는 Google 인증 페이지로 리다이렉트되고, 승인 후 자동으로 돌아옴
    } catch (error) {
      console.error('Google login error:', error)
      setError('Google 로그인 중 오류가 발생했습니다.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-oem-bg-app flex items-center justify-center p-6 font-['Noto_Sans_KR',sans-serif]">
      <div className="max-w-[420px] w-full oem-panel bg-white shadow-xl overflow-hidden border-t-4 border-t-oem-blue">

        {/* Login Branding */}
        <div className="p-10 space-y-8">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-oem-bg-header rounded-xl mb-2">
              <span className="text-2xl font-black text-oem-blue">IND</span>
            </div>
            <h2 className="text-2xl font-bold text-oem-text-primary tracking-tight">
              {appTitle}
            </h2>
            <p className="text-[12px] text-oem-text-secondary font-medium uppercase tracking-widest">
              Enterprise Management Console
            </p>
          </div>

          {error && (
            <div className="bg-oem-red/10 border border-oem-red/20 text-oem-red px-4 py-3 rounded-oem text-[11px] font-bold">
              AUTH_ERROR: {error}
            </div>
          )}

          <div className="space-y-4">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-white border border-oem-border py-2.5 rounded-oem hover:bg-oem-bg-header hover:border-oem-blue transition-all group active:scale-[0.98]"
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
              <span className="text-[13px] font-bold text-oem-text-primary group-hover:text-oem-blue">
                {loading ? 'AUTHENTICATING...' : 'Sign in with Google Account'}
              </span>
            </button>

            <div className="pt-6 border-t border-oem-border text-center">
              <p className="text-[11px] text-oem-text-secondary leading-relaxed font-medium">
                Authorized personnel only. Interaction logs are recorded for compliance and security auditing.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Ribbon */}
        <div className="bg-oem-bg-header/50 border-t border-oem-border px-6 py-3 flex justify-between items-center text-[10px] text-oem-text-secondary font-bold uppercase tracking-tighter">
          <span>Version 13.5.0.0.0</span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-oem-green"></span>
            Service Node: IND_PROD_ASIA_01
          </span>
        </div>
      </div>
    </div>
  )
}

export default Login





