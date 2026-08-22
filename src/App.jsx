import React, { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { useDevAutoLogin } from './hooks/useDevAutoLogin'
import { DataProvider } from './contexts/DataContext'
import { BackgroundTaskProvider } from './contexts/BackgroundTaskContext'
import { I18nProvider } from './contexts/I18nContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'

/* ---------------------------------------------------------------------------
   화면은 **열 때 받는다.**

   예전에는 전부 한 덩어리(2.3MB)로 묶여서, 대시보드만 보려 해도 견적서·지도·
   요금표까지 다 받아야 했다. 첫 화면이 그만큼 늦어진다.
   대시보드만 미리 넣고 나머지는 그 화면으로 갈 때 받는다.
--------------------------------------------------------------------------- */
const Clients = lazy(() => import('./pages/Clients'))
const ClientDetail = lazy(() => import('./pages/ClientDetail'))
const Activities = lazy(() => import('./pages/Activities'))
const Sales = lazy(() => import('./pages/Sales'))
const Receivables = lazy(() => import('./pages/Receivables'))
const Quotes = lazy(() => import('./pages/Quotes'))
const Statements = lazy(() => import('./pages/Statements'))
const PurchaseOrders = lazy(() => import('./pages/PurchaseOrders'))
const Products = lazy(() => import('./pages/Products'))
const Issues = lazy(() => import('./pages/Issues'))
const Settings = lazy(() => import('./pages/Settings'))
const PipelineBoard = lazy(() => import('./pages/PipelineBoard'))
/*
 * 모션 확인 화면 — 개발 서버 전용.
 * **`lazy()`를 가드 밖에 두면 안 된다.** 라우트만 감싸면 `import()`는 그대로
 * 남아 Rollup이 조각을 만들어 배포물에 싣는다(실측 3.12KB). 절대 불러오지
 * 않는 조각이라 해가 되진 않지만, 넣지 않기로 한 것이 들어가 있는 상태다.
 * 삼항 안에 두면 빌드 때 `false`로 접혀 통째로 지워진다.
 */
const MotionLab = import.meta.env.DEV ? lazy(() => import('./pages/MotionLab')) : null
const Login = lazy(() => import('./pages/Login'))
const Landing = lazy(() => import('./pages/Landing'))
const Pricing = lazy(() => import('./pages/Pricing'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const ShareProcessing = lazy(() => import('./pages/ShareProcessing'))
const Map = lazy(() => import('./pages/Map'))
const Calendar = lazy(() => import('./pages/Calendar'))
const MyAccounts = lazy(() => import('./pages/MyAccounts'))

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
      '/quotes': '견적서', '/statements': '거래명세서', '/purchase-orders': '발주서', '/receivables': '채권관리',
    }
    let title = '아이앤디 CRM'
    const sub = path.startsWith('/clients/') ? '거래처 상세' : TITLES[path]
    if (sub) title += ` | ${sub}`

    document.title = title
  }, [location])

  return null
}

const PageLoading = () => (
  <div style={{
    minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-secondary)', fontSize: 13,
  }}>
    불러오는 중…
  </div>
)

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
        {/* 화면 묶음이 도착할 때까지 자리를 지킨다 */}
        <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/clients/:id" element={<ClientDetail />} />
          <Route path="/activities" element={<Activities />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/receivables" element={<Receivables />} />
          <Route path="/quotes" element={<Quotes />} />
          <Route path="/statements" element={<Statements />} />
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
        </Suspense>
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
              <Suspense fallback={<PageLoading />}>
              <Routes>
                <Route path="/landing" element={<Landing />} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/login" element={<Login />} />
                {/*
                  모션 확인 화면 — 개발 서버에서만 존재한다.
                  `import.meta.env.DEV`가 false면 Vite가 이 가지를 통째로 지우므로
                  MotionLab 코드가 배포 산출물에 들어가지 않는다.
                */}
                {import.meta.env.DEV && <Route path="/__motion" element={<MotionLab />} />}
                <Route path="/*" element={<ProtectedRoutes />} />
              </Routes>
              </Suspense>
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

