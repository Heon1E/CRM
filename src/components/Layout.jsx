import React from 'react'
import Navbar from './Navbar'
import BottomNavigation from './BottomNavigation'
import PWAInstallPrompt from './PWAInstallPrompt'
import OfflineIndicator from './OfflineIndicator'
import NotificationPermissionPrompt from './NotificationPermissionPrompt'
import BackgroundTaskIndicator from './BackgroundTaskIndicator'

const Layout = ({ children }) => {
  // Guard Clause: children이 없으면 빈 화면 방지 (.cursorrules 규칙 준수)
  if (!children) {
    return (
      <div className="min-h-screen bg-background-page flex items-center justify-center">
        <div className="text-text-secondary">컨텐츠를 불러오는 중...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background-page flex flex-col">
      {/* 상단 Navbar (PC에서는 표시, 모바일에서는 간소화) */}
      <Navbar />

      {/* 오프라인 상태 표시기 (Navbar 아래, fixed) */}
      <OfflineIndicator />

      {/* 백그라운드 작업 인디케이터 (Navbar 아래, fixed) */}
      <BackgroundTaskIndicator />

      {/* 푸시 알림 권한 요청 배너 (Navbar 아래, fixed) */}
      <NotificationPermissionPrompt />

      {/* PWA 설치 유도 배너 (Navbar 아래, fixed) */}
      <PWAInstallPrompt />

      {/* 컨텐츠 영역 
          - PC: Navbar 높이만큼 padding-top (16 = 4rem)
          - 모바일: Navbar 높이 + 오프라인 인디케이터 + 하단 탭바 높이
      */}
      <main 
        className="flex-1 w-full pt-16 pb-16 md:pb-0 transition-all duration-300" 
        id="main-content"
        style={{ 
          paddingTop: '4rem' // Navbar (4rem) + OfflineIndicator (동적)
        }}
      >
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>

      {/* 하단 탭 바 (모바일에서만 표시, 768px 이하) */}
      <BottomNavigation />
    </div>
  )
}

export default Layout
