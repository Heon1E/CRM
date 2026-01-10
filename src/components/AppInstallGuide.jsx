import React, { useState, useEffect } from 'react'
import { Download, Smartphone } from 'lucide-react'

const AppInstallGuide = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // 이미 앱으로 실행 중인지 확인
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
    }

    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setDeferredPrompt(null)
      }
    } else {
      // iOS 등 prompt가 지원되지 않는 경우 안내
      alert('브라우저 하단 공유 버튼(↑)을 누르고 [홈 화면에 추가]를 선택해주세요.')
    }
  }

  if (isInstalled) return null

  return (
    <button
      onClick={handleInstallClick}
      className="hidden md:flex items-center space-x-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors touch-manipulation min-h-[44px]"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <Download className="w-4 h-4" />
      <span>앱 설치</span>
    </button>
  )
}

export default AppInstallGuide
