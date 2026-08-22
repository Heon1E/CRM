import React from 'react'
import TopNavbar from './TopNavbar'
import PWAInstallPrompt from './PWAInstallPrompt'
import OfflineIndicator from './OfflineIndicator'
import NotificationPermissionPrompt from './NotificationPermissionPrompt'
import BackgroundTaskIndicator from './BackgroundTaskIndicator'
import BottomNavigation from './BottomNavigation'
import CommandPalette from './CommandPalette'
import { useTableLabels } from '../hooks/useTableLabels'

const Layout = ({ children }) => {
  // 모바일에서 표가 카드로 접힐 때 붙는 칸 이름을 심는다.
  // 목록 화면이 7개라 페이지마다 적지 않고 <thead>에서 읽어 온다.
  useTableLabels()

  // Guard Clause: children이 없으면 빈 화면 방지 (.cursorrules 규칙 준수)
  if (!children) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-secondary)' }}>
        <div>컨텐츠를 불러오는 중...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)' }}>
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

      {/* Global Command Palette (PC: Ctrl+K) */}
      <CommandPalette />

      {/* 컨텐츠 영역 
          - PC: Navbar 높이만큼 padding-top (16 = 4rem)
          - 모바일: Navbar 높이 + 오프라인 인디케이터 + 하단 탭바 높이 + 상태 표시줄
          - 모바일 키보드 대응: 입력 필드 포커스 시 스크롤 가능하도록
      */}
      <main
        className="flex-1 w-full pt-16 pb-20 md:pb-0" // pb-20 for bottom nav
        id="main-content"
      >
        {/*
          **좁은 화면에서는 좌우 여백을 줄인다.** 대부분의 화면이 자기 여백
          (`p-3`)을 따로 갖고 있어서 여기 16px이 겹치면 좌우로 28px씩,
          376px 화면의 15%가 여백으로 나간다(실측). 그만큼 표와 달력이 좁아진다 —
          일정 달력 칸이 41px까지 눌려 터치 기준 44px을 못 채우고 있었다.
          여백이 없는 화면(견적서·발주서 등)도 있으므로 0으로 두지는 않는다.
        */}
        <div className="container mx-auto px-2 py-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  )
}

export default Layout



