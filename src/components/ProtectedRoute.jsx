import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const ProtectedRoute = ({ children }) => {
  const { user, profile, loading, isApproved } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">로딩 중...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!isApproved()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 max-w-md">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              승인 대기 중
            </h2>
            <p className="text-gray-600 mb-4">
              관리자 승인이 필요합니다. 승인 후 로그인 가능합니다.
            </p>
            <button
              onClick={() => {
                window.location.href = '/login'
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              로그인 페이지로 이동
            </button>
          </div>
        </div>
      </div>
    )
  }

  return children
}

export default ProtectedRoute

