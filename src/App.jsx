import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
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
import OrderEntry from './pages/OrderEntry'
import Calendar from './pages/Calendar'
import MyAccounts from './pages/MyAccounts'

import ErrorBoundary from './components/ErrorBoundary'

const DocumentTitleUpdater = () => {
  const location = useLocation()

  React.useEffect(() => {
    const path = location.pathname
    let title = 'Xavian ERP'

    if (path === '/landing') title += ' | CRM & ERP Solutions'
    else if (path === '/pricing') title += ' | Pricing Plans'
    else if (path === '/login') title += ' | Login'
    else if (path === '/onboarding') title += ' | Getting Started'
    else if (path === '/') title += ' | Dashboard'
    else if (path === '/clients') title += ' | Clients'
    else if (path.startsWith('/clients/')) title += ' | Client Details'
    else if (path === '/pipeline') title += ' | Pipeline Board'
    else if (path === '/sales') title += ' | Sales'
    else if (path === '/my-accounts') title += ' | My Accounts'
    else if (path === '/map') title += ' | Territories Map'
    else if (path === '/activities') title += ' | Activities'
    else if (path === '/calendar') title += ' | Calendar'
    else if (path === '/products') title += ' | Products'
    else if (path === '/issues') title += ' | Issues'
    else if (path === '/order-entry') title += ' | Order Entry'
    else if (path === '/settings') title += ' | Settings'

    document.title = title
  }, [location])

  return null
}

// 인증 상태에 따른 라우팅 컴포넌트
const ProtectedRoutes = () => {
  // Mock Auth provides user immediately, allowing us to render Layout directly
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
          <Route path="/products" element={<Products />} />
          <Route path="/issues" element={<Issues />} />
          <Route path="/pipeline" element={<PipelineBoard />} />
          <Route path="/map" element={<Map />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/share-processing" element={<ShareProcessing />} />
          <Route path="/order-entry" element={<OrderEntry />} />
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

