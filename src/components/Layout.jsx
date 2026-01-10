import React from 'react'
import Navbar from './Navbar'

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
      {/* 상단 Navbar (고정) */}
      <Navbar />

      {/* 컨텐츠 영역 (Navbar 높이만큼 margin-top) */}
      <main className="flex-1 w-full mt-16">
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  )
}

export default Layout
