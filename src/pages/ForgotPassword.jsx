import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const ForgotPassword = () => {
  const navigate = useNavigate()
  const { resetPassword } = useAuth()
  const [step, setStep] = useState(1) // 1: 정보 입력, 2: 인증번호 입력, 3: 비밀번호 재설정
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    user_id: '',
    phone: '',
    verificationCode: '',
    newPassword: '',
    newPasswordConfirm: '',
  })
  const [verificationCode, setVerificationCode] = useState('')

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
    setError('')
  }

  const handleSendVerification = async (e) => {
    e.preventDefault()
    setError('')

    if (!formData.user_id.trim() || !formData.phone.trim()) {
      setError('아이디와 휴대폰 번호를 입력해주세요.')
      return
    }

    setLoading(true)

    try {
      // 실제로는 SMS 발송 API를 호출하지만, 여기서는 모의 구현
      // 랜덤 6자리 인증번호 생성
      const code = Math.floor(100000 + Math.random() * 900000).toString()
      setVerificationCode(code)

      // 콘솔에 출력

      // 알림창으로 표시
      alert(`인증번호가 발송되었습니다.\n인증번호: ${code}\n(실제 서비스에서는 SMS로 발송됩니다)`)
      
      setStep(2)
    } catch (err) {
      setError('인증번호 발송 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = (e) => {
    e.preventDefault()
    setError('')

    if (formData.verificationCode !== verificationCode) {
      setError('인증번호가 일치하지 않습니다.')
      return
    }

    setStep(3)
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    setError('')

    if (formData.newPassword.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.')
      return
    }

    if (formData.newPassword !== formData.newPasswordConfirm) {
      setError('비밀번호가 일치하지 않습니다.')
      return
    }

    setLoading(true)

    const result = await resetPassword(
      formData.user_id.trim(),
      formData.phone.trim(),
      formData.newPassword
    )

    if (result.success) {
      alert('비밀번호가 재설정되었습니다. 로그인 페이지로 이동합니다.')
      navigate('/login')
    } else {
      setError(result.error || '비밀번호 재설정 중 오류가 발생했습니다.')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          비밀번호 찾기
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">
            로그인으로 돌아가기
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {step === 1 && (
            <form className="space-y-6" onSubmit={handleSendVerification}>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="user_id" className="block text-sm font-medium text-gray-700">
                  아이디
                </label>
                <input
                  id="user_id"
                  name="user_id"
                  type="text"
                  required
                  value={formData.user_id}
                  onChange={handleChange}
                  className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                  휴대폰 번호
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={handleChange}
                  className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="010-1234-5678"
                />
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {loading ? '발송 중...' : '인증번호 발송'}
                </button>
              </div>
            </form>
          )}

          {step === 2 && (
            <form className="space-y-6" onSubmit={handleVerifyCode}>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="verificationCode" className="block text-sm font-medium text-gray-700">
                  인증번호
                </label>
                <input
                  id="verificationCode"
                  name="verificationCode"
                  type="text"
                  required
                  value={formData.verificationCode}
                  onChange={handleChange}
                  className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="6자리 인증번호"
                  maxLength={6}
                />
                <p className="mt-2 text-sm text-gray-500">
                  콘솔(Console)에서 인증번호를 확인하세요.
                </p>
              </div>

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  이전
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  확인
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            <form className="space-y-6" onSubmit={handleResetPassword}>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
                  새 비밀번호
                </label>
                <input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  required
                  value={formData.newPassword}
                  onChange={handleChange}
                  className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="최소 6자 이상"
                />
              </div>

              <div>
                <label htmlFor="newPasswordConfirm" className="block text-sm font-medium text-gray-700">
                  새 비밀번호 확인
                </label>
                <input
                  id="newPasswordConfirm"
                  name="newPasswordConfirm"
                  type="password"
                  required
                  value={formData.newPasswordConfirm}
                  onChange={handleChange}
                  className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {loading ? '재설정 중...' : '비밀번호 재설정'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword

