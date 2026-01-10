import React from 'react'

const Settings = () => {
  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">설정</h1>
        <p className="text-gray-500 mt-1.5 text-sm md:text-base">시스템 설정 및 관리</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 md:p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-5">일반 설정</h2>
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              회사명
            </label>
            <input
              type="text"
              defaultValue="아이앤디"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              대표 이메일
            </label>
            <input
              type="email"
              defaultValue="contact@ind-crm.com"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 md:p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-5">알림 설정</h2>
        <div className="space-y-4">
          <label className="flex items-center cursor-pointer">
            <input type="checkbox" defaultChecked className="rounded border-gray-200 text-purple-600 focus:ring-purple-500 w-4 h-4" />
            <span className="ml-3 text-sm font-medium text-gray-700">이메일 알림 받기</span>
          </label>
          <label className="flex items-center cursor-pointer">
            <input type="checkbox" defaultChecked className="rounded border-gray-200 text-purple-600 focus:ring-purple-500 w-4 h-4" />
            <span className="ml-3 text-sm font-medium text-gray-700">새 고객 등록 알림</span>
          </label>
          <label className="flex items-center cursor-pointer">
            <input type="checkbox" className="rounded border-gray-200 text-purple-600 focus:ring-purple-500 w-4 h-4" />
            <span className="ml-3 text-sm font-medium text-gray-700">매출 목표 달성 알림</span>
          </label>
        </div>
      </div>

      <div className="flex justify-end space-x-3">
        <button className="px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 font-medium shadow-sm">
          취소
        </button>
        <button className="px-4 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-all duration-200 font-semibold shadow-sm">
          저장
        </button>
      </div>
    </div>
  )
}

export default Settings
