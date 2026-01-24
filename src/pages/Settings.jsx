import React, { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, Download, RefreshCw, TriangleAlert } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import AddProductModal from '../components/AddProductModal'
import EditProductModal from '../components/EditProductModal'
import ProductExcelUpload from '../components/ProductExcelUpload'
import ClientExcelUpload from '../components/ClientExcelUpload'
import SalesExcelUpload from '../components/SalesExcelUpload'
import { showSuccess, showError, showConfirm, showWarning } from '../utils/alert'
import { exportClientsToExcel } from '../utils/excelExport'
import { exportSalesToExcel } from '../utils/excelExport'

const DEMO_USER_ID = '00000000-0000-0000-0000-000000000000'

// --- UI Components ---
const Panel = ({ title, children, className = "" }) => (
  <div className={`oem-panel ${className} mb-6`}>
    <div className="oem-panel-header">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-oem-text-secondary">▼</span>
        <span className="uppercase tracking-tight">{title}</span>
      </div>
    </div>
    <div className="oem-panel-content p-4">
      {children}
    </div>
  </div>
)

const Settings = () => {
  const { products, deleteProduct, loading, registerMissingProductsFromSales } = useData()
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
      // [수정] 데모 사용자일 경우 DB 연동 스킵 (FK 에러 방지)
      if (user.id === DEMO_USER_ID) {
        setSettings({
          company_name: 'Xavian CRM (Demo)',
          email: 'demo@example.com',
          email_notification: true,
          new_client_notification: true,
          sales_goal_notification: false,
        })
        setSettingsLoading(false)
        return
      }

      try {
        // 먼저 데이터 조회 시도
        const { data, error } = await supabase
          .from('settings')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle()

        if (error) {
          console.warn('⚠️ [loadSettings] 설정 조회 실패 (기본값 사용):', error.message)
          setSettingsLoading(false)
          return
        }

        if (data) {
          setSettings({
            company_name: data.company_name || '',
            email: data.email || '',
            email_notification: data.email_notification !== false,
            new_client_notification: data.new_client_notification !== false,
            sales_goal_notification: data.sales_goal_notification === true,
          })
        } else {
          // 데이터가 없으면 기본값 INSERT 시도
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
            // 409 Conflict 또는 23505 Unique Violation은 무시 (이미 존재함)
            if (insertError.code === '23505' || insertError.status === 409) {
              console.log('ℹ️ [loadSettings] 기본 설정이 이미 존재합니다. (Insert Skipped)')
            } else {
              console.error('❌ [loadSettings] 기본 설정 생성 실패:', insertError)
            }

            // UI는 기본값으로 표시
            setSettings({
              company_name: 'Xavian CRM',
              email: '',
              email_notification: true,
              new_client_notification: true,
              sales_goal_notification: false,
            })
          } else {
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
        console.error('❌ [loadSettings] 예외 발생:', error)
      } finally {
        setSettingsLoading(false)
      }
    }

    loadSettings()
  }, [user])

  // 저장 핸들러 (Update First Strategy)
  const handleSave = async () => {
    if (!user) {
      await showWarning('Login required.')
      return
    }

    // [수정] 데모 사용자일 경우 DB 저장 흉내 (FK 에러 방지)
    if (user.id === DEMO_USER_ID) {
      setSettingsLoading(true)
      await new Promise(resolve => setTimeout(resolve, 500)) // Fake network delay
      window.dispatchEvent(new Event('settingsUpdated'))
      await showSuccess('Configuration saved locally (Demo Mode).')
      setSettingsLoading(false)
      return
    }

    try {
      setSettingsLoading(true)

      const payload = {
        user_id: user.id,
        company_name: settings.company_name || null,
        email: settings.email || null,
        email_notification: settings.email_notification,
        new_client_notification: settings.new_client_notification,
        sales_goal_notification: settings.sales_goal_notification,
        updated_at: new Date().toISOString()
      }

      // 1. 무조건 Update 먼저 시도 (User ID 기준)
      const { data: updatedData, error: updateError } = await supabase
        .from('settings')
        .update(payload)
        .eq('user_id', user.id)
        .select()

      if (updateError) throw updateError

      // 2. 업데이트된 행이 없다면? -> Insert 시도
      if (!updatedData || updatedData.length === 0) {
        console.log('ℹ️ [handleSave] 업데이트 대상 없음. 신규 생성(Insert) 시도...')
        const { error: insertError } = await supabase
          .from('settings')
          .insert([payload])

        if (insertError) {
          if (insertError.code === '23505' || insertError.status === 409) {
            console.log('ℹ️ [handleSave] Insert 중 중복 발견. 이미 저장된 것으로 간주.')
          } else {
            throw insertError
          }
        }
      }

      // 회사명 변경 시 전역 상태 업데이트를 위한 이벤트 발생
      window.dispatchEvent(new Event('settingsUpdated'))
      await showSuccess('Configuration saved successfully.')
    } catch (error) {
      console.error('설정 저장 오류:', error)
      await showError('Failed to save configuration. Please try again.')
    } finally {
      setSettingsLoading(false)
    }
  }

  // 취소 핸들러 (Supabase에서 다시 불러오기)
  const handleCancel = async () => {
    if (!user) return

    // 데모 사용자 처리
    if (user.id === DEMO_USER_ID) {
      setSettings({
        company_name: 'Xavian CRM (Demo)',
        email: 'demo@example.com',
        email_notification: true,
        new_client_notification: true,
        sales_goal_notification: false,
      })
      return
    }

    try {
      setSettingsLoading(true)
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

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
      <div className="flex items-center justify-center h-screen bg-oem-bg-app">
        <div className="text-oem-text-secondary text-sm">LOADING_SETTINGS_MODULE...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-oem-bg-app p-6 font-['Noto_Sans_KR',sans-serif] text-oem-text-primary mt-[50px]">
      <div className="max-w-[1200px] mx-auto space-y-6">

        {/* Page Header */}
        <div className="flex items-center justify-between border-b border-oem-border pb-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-oem-blue flex items-center gap-2">
              SYSTEM CONFIGURATION
              <span className="text-[10px] bg-oem-bg-header text-oem-text-secondary px-2 py-0.5 rounded-full font-normal">ADMIN_MODE</span>
            </h1>
            <p className="text-[11px] text-oem-text-secondary mt-1 font-medium italic">
              Global system preferences and master data management.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-oem-border mb-4">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-4 py-2 text-xs font-bold transition-colors border-b-2 ${activeTab === 'general'
              ? 'border-oem-blue text-oem-blue'
              : 'border-transparent text-oem-text-secondary hover:text-oem-text-primary'
              }`}
          >
            GENERAL_SETTINGS
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`px-4 py-2 text-xs font-bold transition-colors border-b-2 ${activeTab === 'products'
              ? 'border-oem-blue text-oem-blue'
              : 'border-transparent text-oem-text-secondary hover:text-oem-text-primary'
              }`}
          >
            PRODUCT_MASTER
          </button>
        </div>

        {/* Content Area */}
        <div className="animate-fade-in">
          {activeTab === 'general' && (
            <>
              <Panel title="General Preferences">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
                  <div>
                    <label className="block text-[11px] font-bold text-oem-text-secondary mb-1.5 uppercase">Company Name</label>
                    <input
                      type="text"
                      value={settings.company_name}
                      onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-oem-border rounded-sm focus:border-oem-blue outline-none transition-colors placeholder:text-gray-300"
                      placeholder="ENTER_COMPANY_NAME"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-oem-text-secondary mb-1.5 uppercase">Primary Email</label>
                    <input
                      type="email"
                      value={settings.email}
                      onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-oem-border rounded-sm focus:border-oem-blue outline-none transition-colors placeholder:text-gray-300"
                      placeholder="admin@example.com"
                    />
                  </div>
                </div>
              </Panel>

              <Panel title="Notification Rules">
                <div className="space-y-3 max-w-lg">
                  <label className="flex items-center gap-3 p-3 border border-oem-border rounded-sm hover:border-oem-blue/50 transition-colors cursor-pointer bg-white">
                    <input
                      type="checkbox"
                      checked={settings.email_notification}
                      onChange={(e) => setSettings({ ...settings, email_notification: e.target.checked })}
                      className="rounded-sm border-gray-300 text-oem-blue focus:ring-oem-blue"
                    />
                    <span className="text-sm font-medium">Enable Email Notifications</span>
                  </label>
                  <label className="flex items-center gap-3 p-3 border border-oem-border rounded-sm hover:border-oem-blue/50 transition-colors cursor-pointer bg-white">
                    <input
                      type="checkbox"
                      checked={settings.new_client_notification}
                      onChange={(e) => setSettings({ ...settings, new_client_notification: e.target.checked })}
                      className="rounded-sm border-gray-300 text-oem-blue focus:ring-oem-blue"
                    />
                    <span className="text-sm font-medium">Notify on New Client Registration</span>
                  </label>
                  <label className="flex items-center gap-3 p-3 border border-oem-border rounded-sm hover:border-oem-blue/50 transition-colors cursor-pointer bg-white">
                    <input
                      type="checkbox"
                      checked={settings.sales_goal_notification}
                      onChange={(e) => setSettings({ ...settings, sales_goal_notification: e.target.checked })}
                      className="rounded-sm border-gray-300 text-oem-blue focus:ring-oem-blue"
                    />
                    <span className="text-sm font-medium">Notify on Sales Goal Achievement</span>
                  </label>
                </div>
              </Panel>

              <Panel title="Bulk Data Operations">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-oem-bg-app p-4 rounded-sm border border-oem-border">
                    <h3 className="text-sm font-bold text-oem-text-primary mb-2 flex items-center gap-2">
                      BATCH_CLIENT_IMPORT
                    </h3>
                    <p className="text-[11px] text-oem-text-secondary mb-4">
                      Upload Excel/CSV to bulk register client profiles. Key personnel will be auto-assigned.
                    </p>
                    <ClientExcelUpload />
                  </div>
                  <div className="bg-oem-bg-app p-4 rounded-sm border border-oem-border">
                    <h3 className="text-sm font-bold text-oem-text-primary mb-2 flex items-center gap-2">
                      BATCH_SALES_IMPORT
                    </h3>
                    <p className="text-[11px] text-oem-text-secondary mb-4">
                      Import transaction history via Excel. Ensures exact match on Client Name.
                    </p>
                    <SalesExcelUpload />
                  </div>
                </div>
              </Panel>

              <Panel title="Data Export & Maintenance">
                <div className="space-y-6">
                  {/* Export Section */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white p-4 border border-oem-border rounded-sm flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-oem-text-primary">EXPORT CLIENT DATABASE</h4>
                        <p className="text-[10px] text-oem-text-secondary mt-1">Download all registered client profiles as Excel.</p>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            setSettingsLoading(true)
                            const { data, error } = await supabase.from('clients').select('*').order('company', { ascending: true })
                            if (error) throw error
                            exportClientsToExcel(data)
                            showSuccess('Client database exported successfully.')
                          } catch (e) {
                            showError('Export failed.')
                          } finally { setSettingsLoading(false) }
                        }}
                        className="oem-btn-secondary flex items-center gap-2 px-3 py-1.5"
                      >
                        <Download className="w-4 h-4" /> EXPORT_XLSX
                      </button>
                    </div>

                    <div className="bg-white p-4 border border-oem-border rounded-sm flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-oem-text-primary">EXPORT SALES JOURNAL</h4>
                        <p className="text-[10px] text-oem-text-secondary mt-1">Download complete transaction history.</p>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            setSettingsLoading(true)
                            const { data, error } = await supabase.from('sales').select('*').order('sale_date', { ascending: false })
                            if (error) throw error
                            exportSalesToExcel(data)
                            showSuccess('Sales journal exported successfully.')
                          } catch (e) {
                            showError('Export failed.')
                          } finally { setSettingsLoading(false) }
                        }}
                        className="oem-btn-secondary flex items-center gap-2 px-3 py-1.5"
                      >
                        <Download className="w-4 h-4" /> EXPORT_XLSX
                      </button>
                    </div>
                  </div>

                  {/* Maintenance Section */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-oem-border">
                    <div className="bg-oem-bg-app p-4 border border-oem-border rounded-sm">
                      <h4 className="text-sm font-bold text-amber-600 mb-2 flex items-center gap-2">
                        <RefreshCw className="w-4 h-4" /> PRODUCT SYNCHRONIZATION
                      </h4>
                      <p className="text-[10px] text-oem-text-secondary mb-3">
                        Scans sales records for unregistered products and adds them to the Product Master. Backfills product IDs.
                      </p>
                      <button
                        onClick={async () => {
                          if (settingsLoading) return
                          setSettingsLoading(true)
                          try {
                            const { count, updatedSales } = await registerMissingProductsFromSales()
                            let msg = ''
                            if (count > 0) msg += `${count} products registered. `
                            if (updatedSales > 0) msg += `${updatedSales} sales records linked. `
                            if (!msg) msg = 'All products are already synchronized.'
                            await showSuccess(msg)
                          } catch (err) {
                            showError('Sync failed.')
                          } finally {
                            setSettingsLoading(false)
                          }
                        }}
                        className="oem-btn-secondary w-full justify-center"
                        disabled={settingsLoading}
                      >
                        RUN_SYNC_PROCESS
                      </button>
                    </div>

                    <div className="bg-red-50 p-4 border border-red-200 rounded-sm">
                      <h4 className="text-sm font-bold text-red-600 mb-2 flex items-center gap-2">
                        <TriangleAlert className="w-4 h-4" /> DANGER ZONE
                      </h4>
                      <p className="text-[10px] text-red-800/70 mb-3">
                        Permanently delete ALL client data, including related sales and activities. This action cannot be undone.
                      </p>
                      <button
                        onClick={async () => {
                          const confirmed = await showConfirm('Are you sure you want to delete ALL client data? This is irreversible.', 'CRITICAL WARNING', 'DELETE EVERYTHING', 'CANCEL')
                          if (!confirmed) return
                          try {
                            setSettingsLoading(true)
                            await supabase.from('client_contacts').delete().neq('id', 0)
                            await supabase.from('activities').delete().neq('id', 0)
                            await supabase.from('sales').delete().neq('id', 0)
                            const { error } = await supabase.from('clients').delete().neq('id', 0)
                            if (error) throw error
                            showSuccess('All client data has been wiped.')
                          } catch (error) {
                            showError('Deletion failed.')
                          } finally { setSettingsLoading(false) }
                        }}
                        className="w-full bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-2 px-4 rounded-sm transition-colors flex items-center justify-center gap-2"
                        disabled={settingsLoading}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> DELETE_ALL_DATA
                      </button>
                    </div>
                  </div>
                </div>
              </Panel>

              <div className="flex justify-end gap-3 mt-6 border-t border-oem-border pt-4">
                <button
                  onClick={handleCancel}
                  className="oem-btn-secondary px-4 py-2"
                  disabled={settingsLoading}
                >
                  DISCARD_CHANGES
                </button>
                <button
                  onClick={handleSave}
                  className="oem-btn-primary px-6 py-2"
                  disabled={settingsLoading}
                >
                  {settingsLoading ? 'SAVING...' : 'SAVE_CONFIGURATION'}
                </button>
              </div>
            </>
          )}

          {activeTab === 'products' && (
            <>
              <div className="flex justify-end gap-2 mb-4">
                <ProductExcelUpload />
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="oem-btn-primary flex items-center gap-2 px-3 py-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>ADD_PRODUCT</span>
                </button>
              </div>

              <div className="bg-white border border-oem-border rounded-sm overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="oem-table min-w-full">
                    <thead>
                      <tr>
                        <th className="pl-4 text-left">PRODUCT_NAME</th>
                        <th className="text-left w-[20%]">TYPE</th>
                        <th className="text-left w-[20%]">STANDARD</th>
                        <th className="text-center w-[150px]">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.length > 0 ? (
                        products.map((product) => (
                          <tr key={product.id}>
                            <td className="pl-4 font-bold text-[12px] text-oem-text-primary">{product.name || '-'}</td>
                            <td className="text-[11px] text-oem-text-secondary">{product.type || '-'}</td>
                            <td className="text-[11px] text-oem-text-secondary">{product.standard || '-'}</td>
                            <td className="text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => setEditingProductId(product.id)}
                                  className="p-1 hover:bg-gray-100 rounded text-oem-blue transition-colors"
                                  title="Edit"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDelete(product.id)}
                                  className="p-1 hover:bg-gray-100 rounded text-red-500 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4" className="py-8 text-center text-xs text-oem-text-secondary italic">
                            NO_PRODUCT_RECORDS_FOUND
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default Settings
