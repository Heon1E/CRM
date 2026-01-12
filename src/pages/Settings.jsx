import React, { useState, useEffect } from 'react'
import { Plus, Edit, Trash2 } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import AddProductModal from '../components/AddProductModal'
import EditProductModal from '../components/EditProductModal'
import ProductExcelUpload from '../components/ProductExcelUpload'
import ClientExcelUpload from '../components/ClientExcelUpload'
import SalesExcelUpload from '../components/SalesExcelUpload'
import { showSuccess, showError, showConfirm } from '../utils/alert'

const Settings = () => {
  const { products, deleteProduct, loading } = useData()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('general') // 'general' or 'products'
  const [editingProductId, setEditingProductId] = useState(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(true)
  
  // 설정 상태
  const [settings, setSettings] = useState({
    company_name: '',
    email: '',
    email_notification: true,
    new_client_notification: true,
    sales_goal_notification: false,
  })

  // Supabase에서 설정 불러오기
  useEffect(() => {
    if (!user) {
      setSettingsLoading(false)
      return
    }

    const loadSettings = async () => {
      try {
        // 먼저 데이터 조회 시도
        const { data, error } = await supabase
          .from('settings')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle()  // .single() 대신 .maybeSingle() 사용 (데이터 없으면 null 반환, 에러 없음)

        if (error) {
          console.error('❌ [loadSettings] 설정 불러오기 오류:', error)
          // 에러가 있어도 기본값 사용
          setSettingsLoading(false)
          return
        }

        if (data) {
          // 데이터가 있으면 설정에 반영
          setSettings({
            company_name: data.company_name || '',
            email: data.email || '',
            email_notification: data.email_notification !== false,
            new_client_notification: data.new_client_notification !== false,
            sales_goal_notification: data.sales_goal_notification === true,
          })
        } else {
          // 데이터가 없으면 기본값을 DB에 insert하고 다시 불러오기
          const defaultSettings = {
            user_id: user.id,
            company_name: 'Xavian CRM',
            email: '',
            email_notification: true,
            new_client_notification: true,
            sales_goal_notification: false,
          }

          const { data: insertData, error: insertError } = await supabase
            .from('settings')
            .insert([defaultSettings])
            .select()
            .single()

          if (insertError) {
            console.error('❌ [loadSettings] 기본 설정 생성 실패:', insertError)
            // 기본값 생성 실패해도 기본값으로 화면 표시
            setSettings({
              company_name: 'Xavian CRM',
              email: '',
              email_notification: true,
              new_client_notification: true,
              sales_goal_notification: false,
            })
          } else {
            // 생성된 데이터를 설정에 반영
            setSettings({
              company_name: insertData.company_name || 'Xavian CRM',
              email: insertData.email || '',
              email_notification: insertData.email_notification !== false,
              new_client_notification: insertData.new_client_notification !== false,
              sales_goal_notification: insertData.sales_goal_notification === true,
            })
          }
        }
      } catch (error) {
        console.error('❌ [loadSettings] 설정 불러오기 예외:', error)
        // 예외 발생 시에도 기본값으로 화면 표시
        setSettings({
          company_name: 'Xavian CRM',
          email: '',
          email_notification: true,
          new_client_notification: true,
          sales_goal_notification: false,
        })
      } finally {
        setSettingsLoading(false)
      }
    }

    loadSettings()
  }, [user])

  // 저장 핸들러
  const handleSave = async () => {
    if (!user) {
      alert('로그인이 필요합니다.')
      return
    }

    try {
      setSettingsLoading(true)
      
      // Supabase에 upsert (있으면 업데이트, 없으면 삽입)
      const { error } = await supabase
        .from('settings')
        .upsert({
          user_id: user.id,
          company_name: settings.company_name || null,
          email: settings.email || null,
          email_notification: settings.email_notification,
          new_client_notification: settings.new_client_notification,
          sales_goal_notification: settings.sales_goal_notification,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        })

      if (error) throw error

      // 회사명 변경 시 전역 상태 업데이트를 위한 이벤트 발생
      window.dispatchEvent(new Event('settingsUpdated'))
      await showSuccess('설정이 저장되었습니다.')
    } catch (error) {
      console.error('설정 저장 오류:', error)
      await showError('설정 저장 중 오류가 발생했습니다.')
    } finally {
      setSettingsLoading(false)
    }
  }

  // 취소 핸들러 (Supabase에서 다시 불러오기)
  const handleCancel = async () => {
    if (!user) return

    try {
      setSettingsLoading(true)
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('설정 불러오기 오류:', error)
      } else if (data) {
        setSettings({
          company_name: data.company_name || '',
          email: data.email || '',
          email_notification: data.email_notification !== false,
          new_client_notification: data.new_client_notification !== false,
          sales_goal_notification: data.sales_goal_notification === true,
        })
      } else {
        // 데이터가 없으면 기본값으로 리셋
        setSettings({
          company_name: '',
          email: '',
          email_notification: true,
          new_client_notification: true,
          sales_goal_notification: false,
        })
      }
    } catch (error) {
      console.error('설정 불러오기 예외:', error)
    } finally {
      setSettingsLoading(false)
    }
  }

  const handleDelete = async (id) => {
    const confirmed = await showConfirm(
      '이 제품 정보가 영구적으로 삭제되며, 관련된 계약 단가 정보도 함께 삭제됩니다.',
      '정말 삭제하시겠습니까?',
      '삭제',
      '취소'
    )
    if (confirmed) {
      try {
        await deleteProduct(id)
        await showSuccess('제품이 삭제되었습니다.')
      } catch (error) {
        console.error('제품 삭제 오류:', error)
        await showError('제품 삭제 중 오류가 발생했습니다.')
      }
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
                  value={settings.company_name}
                  onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                  disabled={settingsLoading}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all disabled:bg-gray-50 disabled:cursor-not-allowed"
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
                  disabled={settingsLoading}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all disabled:bg-gray-50 disabled:cursor-not-allowed"
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
                  checked={settings.email_notification}
                  onChange={(e) => setSettings({ ...settings, email_notification: e.target.checked })}
                  disabled={settingsLoading}
                  className="rounded border-gray-200 text-purple-600 focus:ring-purple-500 w-4 h-4 disabled:cursor-not-allowed"
                />
                <span className="ml-3 text-sm font-medium text-gray-700">이메일 알림 받기</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.new_client_notification}
                  onChange={(e) => setSettings({ ...settings, new_client_notification: e.target.checked })}
                  disabled={settingsLoading}
                  className="rounded border-gray-200 text-purple-600 focus:ring-purple-500 w-4 h-4 disabled:cursor-not-allowed"
                />
                <span className="ml-3 text-sm font-medium text-gray-700">새 고객 등록 알림</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.sales_goal_notification}
                  onChange={(e) => setSettings({ ...settings, sales_goal_notification: e.target.checked })}
                  disabled={settingsLoading}
                  className="rounded border-gray-200 text-purple-600 focus:ring-purple-500 w-4 h-4 disabled:cursor-not-allowed"
                />
                <span className="ml-3 text-sm font-medium text-gray-700">매출 목표 달성 알림</span>
              </label>
            </div>
          </div>

          {/* 데이터 일괄 관리 섹션 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 md:p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-5">데이터 일괄 관리</h2>
            <div className="space-y-6">
              {/* 거래처 일괄 등록 */}
              <div>
                <h3 className="text-base font-semibold text-gray-800 mb-3">거래처 일괄 등록</h3>
                <p className="text-sm text-gray-600 mb-4">
                  엑셀 파일을 업로드하여 거래처를 일괄 등록할 수 있습니다. 담당자1은 자동으로 키맨으로 지정됩니다.
                </p>
                <ClientExcelUpload />
              </div>

              {/* 매출 일괄 등록 */}
              <div>
                <h3 className="text-base font-semibold text-gray-800 mb-3">매출 일괄 등록</h3>
                <p className="text-sm text-gray-600 mb-4">
                  엑셀 파일을 업로드하여 매출을 일괄 등록할 수 있습니다. 거래처명은 정확히 일치해야 합니다.
                </p>
                <SalesExcelUpload />
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              onClick={handleCancel}
              disabled={settingsLoading}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={settingsLoading}
              className="px-4 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-all duration-200 font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {settingsLoading ? '저장 중...' : '저장'}
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
