import React, { useState, useEffect } from 'react'
import { X, Download } from 'lucide-react'

const PWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showBanner, setShowBanner] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  // 배너가 표시되면 body에 클래스 추가 (레이아웃 조정용)
  useEffect(() => {
    const mainContent = document.getElementById('main-content')
    if (mainContent) {
      if (showBanner && !isInstalled) {
        mainContent.style.paddingTop = '8rem' // Navbar (4rem) + 배너 (약 4rem)
      } else {
        mainContent.style.paddingTop = '4rem' // Navbar만
      }
    }
    
    return () => {
      if (mainContent) {
        mainContent.style.paddingTop = ''
      }
    }
  }, [showBanner, isInstalled])

  useEffect(() => {
    // 이미 설치되어 있는지 확인 (standalone 모드 체크)
    const checkIfInstalled = () => {
      // iOS Safari
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      const isInStandaloneMode = ('standalone' in window.navigator) && (window.navigator.standalone)
      
      // Android Chrome
      const isAndroid = /Android/.test(navigator.userAgent)
      const isInWebApp = window.matchMedia('(display-mode: standalone)').matches
      
      if ((isIOS && isInStandaloneMode) || (isAndroid && isInWebApp)) {
        setIsInstalled(true)
        return true
      }
      
      // localStorage에서 사용자가 배너를 닫았는지 확인 (24시간 체크)
      const dismissedBanner = localStorage.getItem('pwa-install-banner-dismissed')
      if (dismissedBanner) {
        const dismissedTime = parseInt(dismissedBanner, 10)
        const now = Date.now()
        const hoursPassed = (now - dismissedTime) / (1000 * 60 * 60)
        
        // 24시간이 지나지 않았으면 배너 표시하지 않음
        if (hoursPassed < 24) {
          return true
        } else {
          // 24시간이 지났으면 localStorage에서 제거
          localStorage.removeItem('pwa-install-banner-dismissed')
        }
      }
      
      // 이미 설치된 경우 체크
      const installed = localStorage.getItem('pwa-installed')
      if (installed === 'true') {
        return true
      }
      
      return false
    }

    if (checkIfInstalled()) {
      return
    }

    // beforeinstallprompt 이벤트 리스너 (Android Chrome)
    const handleBeforeInstallPrompt = (e) => {
      // 기본 브라우저 프롬프트 방지
      e.preventDefault()
      // 이벤트 저장 (나중에 prompt() 호출 시 사용)
      setDeferredPrompt(e)
      // 배너 표시
      setShowBanner(true)
    }

    // beforeinstallprompt 이벤트는 Android Chrome에서만 발생
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // 설치 완료 이벤트 리스너
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setShowBanner(false)
      setDeferredPrompt(null)
      // 설치 완료 시 localStorage에 설치 상태 저장
      localStorage.setItem('pwa-installed', 'true')
    }

    window.addEventListener('appinstalled', handleAppInstalled)

    // iOS Safari는 beforeinstallprompt 이벤트를 지원하지 않으므로
    // 별도로 배너 표시 (사용자가 설치 안 했고 닫지 않았을 때만)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const isIOSChrome = /CriOS/.test(navigator.userAgent)
    
    // iOS Safari에서만 별도 처리 (beforeinstallprompt 이벤트가 없음)
    if (isIOS && !isIOSChrome) {
      // 약간의 지연 후 배너 표시 (페이지 로드 완료 후)
      const timer = setTimeout(() => {
        // 이미 설치되어 있거나 닫은 기록이 있으면 표시하지 않음
        if (!checkIfInstalled()) {
          setShowBanner(true)
        }
      }, 3000) // 3초 후 표시
      
      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
        window.removeEventListener('appinstalled', handleAppInstalled)
        clearTimeout(timer)
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  // 설치 버튼 클릭 핸들러
  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      // iOS Safari의 경우 가이드 메시지 표시
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      if (isIOS) {
        alert(
          '설치 방법:\n\n' +
          '1. 화면 하단의 공유 버튼(□↑)을 누르세요\n' +
          '2. "홈 화면에 추가"를 선택하세요\n' +
          '3. "추가" 버튼을 눌러 설치를 완료하세요'
        )
      }
      return
    }

    // 저장된 이벤트로 설치 프롬프트 표시
    deferredPrompt.prompt()
    
    // 사용자 응답 대기
    const { outcome } = await deferredPrompt.userChoice
    
    // 사용자 응답은 필요시 분석에 사용
    if (outcome === 'accepted') {
      // 설치 완료 시 appinstalled 이벤트가 발생하므로 별도 처리 불필요
    }

    // 이벤트 정리
    setDeferredPrompt(null)
    setShowBanner(false)
  }

  // 배너 닫기 핸들러
  const handleDismiss = () => {
    setShowBanner(false)
    // localStorage에 닫기 상태 저장 (24시간 유지)
    localStorage.setItem('pwa-install-banner-dismissed', Date.now().toString())
    
    // 24시간 후 자동으로 삭제
    setTimeout(() => {
      localStorage.removeItem('pwa-install-banner-dismissed')
    }, 24 * 60 * 60 * 1000)
  }

  // 설치되어 있거나 배너를 표시하지 않을 경우 null 반환
  if (isInstalled || !showBanner) {
    return null
  }

  return (
    <div className="fixed top-16 left-0 right-0 bg-white text-slate-800 border-b border-slate-200 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <Download className="w-5 h-5 flex-shrink-0 text-blue-600" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                더 편리한 사용을 위해 앱을 설치하세요
              </p>
              <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">
                홈 화면에서 바로 접근할 수 있습니다
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
            <button
              onClick={handleInstallClick}
              className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-all duration-200 font-semibold text-xs sm:text-sm flex items-center space-x-1"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">설치하기</span>
              <span className="sm:hidden">설치</span>
            </button>
            <button
              onClick={handleDismiss}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-all duration-200 flex-shrink-0"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PWAInstallPrompt



