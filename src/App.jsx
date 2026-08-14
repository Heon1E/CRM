import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { useDevAutoLogin } from './hooks/useDevAutoLogin'
import { DataProvider } from './contexts/DataContext'
import { BackgroundTaskProvider } from './contexts/BackgroundTaskContext'
import { I18nProvider } from './contexts/I18nContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import ClientDetail from './pages/ClientDetail'
import Activities from './pages/Activities'
import Sales from './pages/Sales'
import Receivables from './pages/Receivables'
import Quotes from './pages/Quotes'
import PurchaseOrders from './pages/PurchaseOrders'
import Products from './pages/Products'
import Issues from './pages/Issues'
import Settings from './pages/Settings'
import PipelineBoard from './pages/PipelineBoard'
import Login from './pages/Login'
import Landing from './pages/Landing'
import Pricing from './pages/Pricing'
import Onboarding from './pages/Onboarding'
import ShareProcessing from './pages/ShareProcessing'
import Map from './pages/Map'
import Calendar from './pages/Calendar'
import MyAccounts from './pages/MyAccounts'

import ErrorBoundary from './components/ErrorBoundary'

const DocumentTitleUpdater = () => {
  const location = useLocation()

  React.useEffect(() => {
    const path = location.pathname
    // 브라우저 탭에 뜨는 이름. 여러 탭을 띄워 두면 이것만 보고 고른다.
    const TITLES = {
      '/landing': '소개', '/pricing': '요금', '/login': '로그인',
      '/onboarding': '시작하기', '/': '대시보드', '/clients': '거래처',
      '/pipeline': '영업기회', '/sales': '매출', '/my-accounts': '내 담당',
      '/map': '지도', '/activities': '영업활동', '/calendar': '일정',
      '/products': '품목', '/issues': '이슈', '/settings': '설정',
      '/quotes': '견적서', '/purchase-orders': '발주서', '/receivables': '채권관리',
    }
    let title = '아이앤디 CRM'
    const sub = path.startsWith('/clients/') ? '거래처 상세' : TITLES[path]
    if (sub) title += ` | ${sub}`

    document.title = title
  }, [location])

  return null
}

/**
 * 로그인해야 볼 수 있는 화면들.
 *
 * 예전에는 인증을 확인하지 않고 바로 그렸다. 배포 번들에 anon 키가 박혀 있고
 * RLS도 anon 전체 허용이라, **주소를 아는 사람은 누구나 거래처·매출·채권을
 * 전부 볼 수 있었다.** 이제 세션이 없으면 로그인 화면으로 보낸다.
 *
 * 개발 중에는 `.env.local`에 `VITE_DEV_AUTOLOGIN_ID`/`VITE_DEV_AUTOLOGIN_PW`를
 * 넣어 두면 자동으로 로그인한다 (`useDevAutoLogin`). **개발 서버에서만 동작하고
 * 배포 빌드에는 들어가지 않는다.**
 */
const ProtectedRoutes = () => {
  const { user, loading } = useAuth()
  const location = useLocation()

  useDevAutoLogin()

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-secondary)', fontSize: 13,
      }}>
        불러오는 중…
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return (
    <ErrorBoundary>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/clients/:id" element={<ClientDetail />} />
          <Route path="/activities" element={<Activities />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/receivables" element={<Receivables />} />
          <Route path="/quotes" element={<Quotes />} />
          <Route path="/purchase-orders" element={<PurchaseOrders />} />
          <Route path="/products" element={<Products />} />
          <Route path="/issues" element={<Issues />} />
          <Route path="/pipeline" element={<PipelineBoard />} />
          <Route path="/map" element={<Map />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/share-processing" element={<ShareProcessing />} />
          <Route path="/my-accounts" element={<MyAccounts />} />
        </Routes>
      </Layout>
    </ErrorBoundary>
  )
}

function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <DataProvider>
          <BackgroundTaskProvider>
            <Router>
              <DocumentTitleUpdater />
              <Routes>
                <Route path="/landing" element={<Landing />} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/login" element={<Login />} />
                <Route path="/*" element={<ProtectedRoutes />} />
              </Routes>
            </Router>
            <Toaster
              position="top-center"
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#ffffff',
                  color: '#333333',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                  borderRadius: '2px', // Oracle-style slight rounding
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: '"Noto Sans KR", sans-serif',
                  padding: '10px 16px',
                  border: '1px solid #d9d9d9',
                  borderLeft: '4px solid #0076ce', // Oracle Blue
                  maxWidth: '450px'
                },
                success: {
                  iconTheme: {
                    primary: '#10b981',
                    secondary: '#ffffff',
                  },
                  style: {
                    borderLeft: '4px solid #10b981',
                  },
                },
                error: {
                  iconTheme: {
                    primary: '#ef4444',
                    secondary: '#ffffff',
                  },
                  style: {
                    borderLeft: '4px solid #ef4444',
                  },
                },
              }}
            />
          </BackgroundTaskProvider>
        </DataProvider>
      </AuthProvider>
    </I18nProvider>
  )
}

export default App

