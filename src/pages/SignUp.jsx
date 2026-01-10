import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const SignUp = () => {
  const navigate = useNavigate()
  const { signUp } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    user_id: '',
    password: '',
    passwordConfirm: '',
    full_name: '',
    phone: '',
    position: '',
    company_name: '',
    department: '',
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // 유효성 검사
    if (!formData.user_id.trim()) {
      setError('아이디를 입력해주세요.')
      return
    }

    if (formData.password.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.')
      return
    }

    if (formData.password !== formData.passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.')
      return
    }

    if (!formData.full_name.trim()) {
      setError('이름을 입력해주세요.')
      return
    }

    if (!formData.company_name.trim()) {
      setError('회사명을 입력해주세요.')
      return
    }

    setLoading(true)

    try {
      const result = await signUp({
        user_id: formData.user_id.trim(),
        password: formData.password,
        full_name: formData.full_name.trim() || null,
        phone: formData.phone.trim() || null,
        position: formData.position.trim() || null,
        company_name: formData.company_name.trim(),
        department: formData.department.trim() || null,
      })

      if (result.success) {
        alert('가입 신청이 완료되었습니다. 관리자 승인을 기다려주세요.')
        navigate('/login')
      } else {
        setError(result.error || '회원가입 중 오류가 발생했습니다.')
      }
    } catch (error) {
      console.error('SignUp component error:', error)
      setError('회원가입 중 예상치 못한 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          회원가입
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          또는{' '}
          <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">
            로그인
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="user_id" className="block text-sm font-medium text-gray-700">
                아이디 <span className="text-red-500">*</span>
              </label>
              <input
                id="user_id"
                name="user_id"
                type="text"
                required
                value={formData.user_id}
                onChange={handleChange}
                className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="로그인에 사용할 아이디"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                비밀번호 <span className="text-red-500">*</span>
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={formData.password}
                onChange={handleChange}
                className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="최소 6자 이상"
              />
            </div>

            <div>
              <label htmlFor="passwordConfirm" className="block text-sm font-medium text-gray-700">
                비밀번호 확인 <span className="text-red-500">*</span>
              </label>
              <input
                id="passwordConfirm"
                name="passwordConfirm"
                type="password"
                required
                value={formData.passwordConfirm}
                onChange={handleChange}
                className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-gray-700">
                이름 <span className="text-red-500">*</span>
              </label>
              <input
                id="full_name"
                name="full_name"
                type="text"
                required
                value={formData.full_name}
                onChange={handleChange}
                className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                연락처
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="010-1234-5678"
              />
            </div>

            <div>
              <label htmlFor="position" className="block text-sm font-medium text-gray-700">
                직급
              </label>
              <input
                id="position"
                name="position"
                type="text"
                value={formData.position}
                onChange={handleChange}
                className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="예: 대리, 과장, 차장 등"
              />
            </div>

            <div>
              <label htmlFor="company_name" className="block text-sm font-medium text-gray-700">
                회사명 <span className="text-red-500">*</span>
              </label>
              <input
                id="company_name"
                name="company_name"
                type="text"
                required
                value={formData.company_name}
                onChange={handleChange}
                className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label htmlFor="department" className="block text-sm font-medium text-gray-700">
                부서명
              </label>
              <input
                id="department"
                name="department"
                type="text"
                value={formData.department}
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
                {loading ? '가입 중...' : '회원가입'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default SignUp

