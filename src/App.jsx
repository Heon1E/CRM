import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { DataProvider } from './contexts/DataContext'
import { BackgroundTaskProvider } from './contexts/BackgroundTaskContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import ClientDetail from './pages/ClientDetail'
import Activities from './pages/Activities'
import Sales from './pages/Sales'
import Products from './pages/Products'
import Issues from './pages/Issues'
import Settings from './pages/Settings'
import PipelineBoard from './pages/PipelineBoard'
import Login from './pages/Login'
import ShareProcessing from './pages/ShareProcessing'
import AgentChatWindow from './components/AgentChatWindow'

// 인증 상태에 따른 라우팅 컴포넌트
const ProtectedRoutes = () => {
  const { user, loading } = useAuth()

  // [핵심] 인증 확인 중이면 로딩 화면만 표시
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center">
          <div className="text-slate-500 mb-2">로그인 상태 확인 중...</div>
          <div className="text-xs text-slate-400">잠시만 기다려주세요</div>
        </div>
      </div>
    )
  }

  // 로그인되지 않은 경우 로그인 페이지로 리다이렉트
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // 로그인된 경우 메인 화면 표시
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/:id" element={<ClientDetail />} />
        <Route path="/activities" element={<Activities />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/products" element={<Products />} />
        <Route path="/issues" element={<Issues />} />
        <Route path="/pipeline" element={<PipelineBoard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/share-processing" element={<ShareProcessing />} />
      </Routes>
    </Layout>
  )
}

function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <BackgroundTaskProvider>
          <Router>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/*" element={<ProtectedRoutes />} />
            </Routes>
          </Router>
          {/* Toast 알림 컴포넌트 */}
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#FFFFFF',
                color: '#1F2937',
                borderRadius: '12px',
                padding: '16px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 6px 10px -6px rgba(15, 23, 42, 0.15)',
                fontSize: '14px',
                fontWeight: 500,
                minWidth: '300px',
                maxWidth: '500px'
              },
              success: {
                iconTheme: {
                  primary: '#10B981',
                  secondary: '#FFFFFF'
                },
                style: {
                  border: '1px solid rgba(16, 185, 129, 0.3)'
                }
              },
              error: {
                iconTheme: {
                  primary: '#EF4444',
                  secondary: '#FFFFFF'
                },
                style: {
                  border: '1px solid rgba(239, 68, 68, 0.3)'
                }
              }
            }}
          />
          {/* AI Developer Agent Chat Interface */}
          <AgentChatWindow />
        </BackgroundTaskProvider>
      </DataProvider>
    </AuthProvider>
  )
}

export default App

