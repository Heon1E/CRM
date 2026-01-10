import React, { useState, useEffect } from 'react'
import { Plus, Edit, Trash2 } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import AddProductModal from '../components/AddProductModal'
import EditProductModal from '../components/EditProductModal'
import ProductExcelUpload from '../components/ProductExcelUpload'

const Settings = () => {
  const { products, deleteProduct, loading } = useData()
  const [activeTab, setActiveTab] = useState('general') // 'general' or 'products'
  const [editingProductId, setEditingProductId] = useState(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  
  // 설정 상태
  const [settings, setSettings] = useState({
    companyName: '',
    email: '',
    emailNotification: true,
    newClientNotification: true,
    salesGoalNotification: false,
  })

  // localStorage에서 설정 불러오기
  useEffect(() => {
    const savedSettings = localStorage.getItem('crm_settings')
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings)
        setSettings(prev => ({ ...prev, ...parsed }))
      } catch (error) {
        console.error('설정 불러오기 오류:', error)
      }
    } else {
      // 기본값으로 localStorage 초기화
      const defaultSettings = {
        companyName: '',
        email: '',
        emailNotification: true,
        newClientNotification: true,
        salesGoalNotification: false,
      }
      localStorage.setItem('crm_settings', JSON.stringify(defaultSettings))
    }
  }, [])

  // 저장 핸들러
  const handleSave = () => {
    try {
      localStorage.setItem('crm_settings', JSON.stringify(settings))
      // 회사명 변경 시 전역 상태 업데이트를 위한 이벤트 발생
      window.dispatchEvent(new Event('settingsUpdated'))
      alert('설정이 저장되었습니다.')
    } catch (error) {
      console.error('설정 저장 오류:', error)
      alert('설정 저장 중 오류가 발생했습니다.')
    }
  }

  // 취소 핸들러 (변경사항 되돌리기)
  const handleCancel = () => {
    const savedSettings = localStorage.getItem('crm_settings')
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings)
        setSettings(prev => ({ ...prev, ...parsed }))
      } catch (error) {
        console.error('설정 불러오기 오류:', error)
      }
    }
  }

  const handleDelete = (id) => {
    if (window.confirm('정말로 이 제품을 삭제하시겠습니까? 관련된 계약 단가 정보도 함께 삭제됩니다.')) {
      deleteProduct(id)
      alert('제품이 삭제되었습니다.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">데이터를 불러오는 중...</div>
      </div>
    )
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">설정</h1>
        <p className="text-gray-500 mt-1.5 text-sm md:text-base">시스템 설정 및 관리</p>
      </div>

      {/* 탭 메뉴 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('general')}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeTab === 'general'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            일반 설정
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeTab === 'products'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            제품 관리
          </button>
        </div>
      </div>

      {/* 일반 설정 탭 */}
      {activeTab === 'general' && (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 md:p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-5">일반 설정</h2>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  회사명
                </label>
                <input
                  type="text"
                  placeholder="Xavian"
                  value={settings.companyName}
                  onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  대표 이메일
                </label>
                <input
                  type="email"
                  placeholder="contact@xavian-crm.com"
                  value={settings.email}
                  onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 md:p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-5">알림 설정</h2>
            <div className="space-y-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.emailNotification}
                  onChange={(e) => setSettings({ ...settings, emailNotification: e.target.checked })}
                  className="rounded border-gray-200 text-purple-600 focus:ring-purple-500 w-4 h-4"
                />
                <span className="ml-3 text-sm font-medium text-gray-700">이메일 알림 받기</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.newClientNotification}
                  onChange={(e) => setSettings({ ...settings, newClientNotification: e.target.checked })}
                  className="rounded border-gray-200 text-purple-600 focus:ring-purple-500 w-4 h-4"
                />
                <span className="ml-3 text-sm font-medium text-gray-700">새 고객 등록 알림</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.salesGoalNotification}
                  onChange={(e) => setSettings({ ...settings, salesGoalNotification: e.target.checked })}
                  className="rounded border-gray-200 text-purple-600 focus:ring-purple-500 w-4 h-4"
                />
                <span className="ml-3 text-sm font-medium text-gray-700">매출 목표 달성 알림</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              onClick={handleCancel}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 font-medium shadow-sm"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-all duration-200 font-semibold shadow-sm"
            >
              저장
            </button>
          </div>
        </>
      )}

      {/* 제품 관리 탭 */}
      {activeTab === 'products' && (
        <div className="space-y-5 md:space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">제품 관리</h2>
              <p className="text-gray-500 mt-1.5 text-sm md:text-base">총 {products.length}개 제품</p>
            </div>
            <div className="flex items-center space-x-3 w-full sm:w-auto">
              <ProductExcelUpload />
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="btn-success w-full sm:w-auto flex items-center justify-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>제품 추가</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-transparent">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                      품목명
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                      종류
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                      규격
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                      작업
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {products.length > 0 ? (
                    products.map((product) => (
                      <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-5 whitespace-nowrap">
                          <div className="text-sm font-semibold text-gray-900">{product.name || '-'}</div>
                        </td>
                        <td className="px-6 py-5 whitespace-nowrap">
                          <div className="text-sm text-gray-600">{product.type || '-'}</div>
                        </td>
                        <td className="px-6 py-5 whitespace-nowrap">
                          <div className="text-sm text-gray-600">{product.standard || '-'}</div>
                        </td>
                        <td className="px-6 py-5 whitespace-nowrap text-sm">
                          <div className="flex items-center space-x-3">
                            <button
                              onClick={() => setEditingProductId(product.id)}
                              className="text-brand-blue hover:text-brand-blue-hover font-medium flex items-center space-x-1 transition-colors"
                            >
                              <Edit className="w-4 h-4" />
                              <span>수정</span>
                            </button>
                            <button
                              onClick={() => handleDelete(product.id)}
                              className="text-red-500 hover:text-red-600 font-medium flex items-center space-x-1 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span>삭제</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                        등록된 제품이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modals */}
          <AddProductModal
            isOpen={isAddModalOpen}
            onClose={() => setIsAddModalOpen(false)}
          />
          <EditProductModal
            isOpen={editingProductId !== null}
            onClose={() => setEditingProductId(null)}
            productId={editingProductId}
          />
        </div>
      )}
    </div>
  )
}

export default Settings
