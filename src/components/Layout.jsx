import React from 'react'
import TopNavbar from './TopNavbar'
import PWAInstallPrompt from './PWAInstallPrompt'
import OfflineIndicator from './OfflineIndicator'
import NotificationPermissionPrompt from './NotificationPermissionPrompt'
import BackgroundTaskIndicator from './BackgroundTaskIndicator'
import BottomNavigation from './BottomNavigation'

const Layout = ({ children }) => {
  // Guard Clause: children이 없으면 빈 화면 방지 (.cursorrules 규칙 준수)
  if (!children) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">컨텐츠를 불러오는 중...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      {/* 상단 고정 네비게이션 */}
      <TopNavbar />

      {/* 오프라인 상태 표시기 (Navbar 아래, fixed) */}
      <OfflineIndicator />

      {/* 백그라운드 작업 인디케이터 (Navbar 아래, fixed) */}
      <BackgroundTaskIndicator />

      {/* 푸시 알림 권한 요청 배너 (Navbar 아래, fixed) */}
      <NotificationPermissionPrompt />

      {/* PWA 설치 유도 배너 (Navbar 아래, fixed) */}
      <PWAInstallPrompt />

      {/* Bottom Navigation (Mobile Only) */}
      <BottomNavigation />

      {/* 컨텐츠 영역 
          - PC: Navbar 높이만큼 padding-top (16 = 4rem)
          - 모바일: Navbar 높이 + 오프라인 인디케이터 + 하단 탭바 높이 + 상태 표시줄
          - 모바일 키보드 대응: 입력 필드 포커스 시 스크롤 가능하도록
      */}
      <main
        className="flex-1 w-full pt-16 pb-20 md:pb-0" // pb-20 for bottom nav
        id="main-content"
      >
        <div className="container mx-auto p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  )
}

export default Layout



