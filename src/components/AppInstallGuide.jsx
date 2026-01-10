import React, { useState, useEffect } from 'react'
import { Smartphone, X, Share2, Menu, Download, CheckCircle } from 'lucide-react'
import Modal from './Modal'

/**
 * 앱 설치 가이드 컴포넌트
 * 대시보드에 표시되는 [📱 앱으로 설치하기] 버튼과 설치 안내 모달
 */
const AppInstallGuide = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [deviceType, setDeviceType] = useState(null) // 'ios' | 'android' | 'desktop'
  const [isInstalled, setIsInstalled] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)

  // 기기 감지 및 설치 상태 확인
  useEffect(() => {
    const checkDeviceAndInstallStatus = () => {
      // 이미 설치되어 있는지 확인 (standalone 모드)
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      const isIOSStandalone = ('standalone' in window.navigator) && (window.navigator.standalone)
      
      const isAndroid = /Android/.test(navigator.userAgent)
      const isAndroidStandalone = window.matchMedia('(display-mode: standalone)').matches
      
      // 설치 여부 확인
      if ((isIOS && isIOSStandalone) || (isAndroid && isAndroidStandalone)) {
        setIsInstalled(true)
        return
      }

      // 기기 타입 감지
      if (isIOS) {
        setDeviceType('ios')
      } else if (isAndroid) {
        setDeviceType('android')
      } else {
        setDeviceType('desktop')
      }

      setIsInstalled(false)
    }

    checkDeviceAndInstallStatus()

    // Android Chrome: beforeinstallprompt 이벤트 리스너
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // 설치 완료 이벤트 리스너
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setIsModalOpen(false)
      setDeferredPrompt(null)
    }

    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  // 설치 버튼 클릭 핸들러
  const handleInstallClick = async () => {
    if (deviceType === 'android' && deferredPrompt) {
      // Android Chrome: 브라우저 설치 프롬프트 표시
      try {
        deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice
        
        if (outcome === 'accepted') {
          // 설치 완료 시 appinstalled 이벤트가 발생하므로 별도 처리 불필요
        }
        
        setDeferredPrompt(null)
        setIsModalOpen(false)
      } catch (error) {
        console.error('앱 설치 프롬프트 표시 실패:', error)
        // 프롬프트 표시 실패 시 모달로 안내
        setIsModalOpen(true)
      }
    } else {
      // iOS 또는 Android (beforeinstallprompt 미지원): 모달 표시
      setIsModalOpen(true)
    }
  }

  // 이미 설치되어 있으면 버튼 표시하지 않음
  if (isInstalled) {
    return null
  }

  return (
    <>
      {/* 설치 버튼 */}
      <button
        onClick={handleInstallClick}
        className="flex items-center justify-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all duration-200 shadow-md hover:shadow-lg font-semibold text-sm md:text-base touch-manipulation min-h-[44px]"
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <Smartphone className="w-5 h-5 md:w-6 md:h-6" />
        <span>📱 앱으로 설치하기</span>
      </button>

      {/* 설치 안내 모달 */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="앱으로 설치하기"
        size="md"
      >
        <div className="space-y-6">
          {/* iOS 안내 */}
          {deviceType === 'ios' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Smartphone className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="font-bold text-blue-900 mb-2">아이폰에서 설치하기</h3>
                    <ol className="space-y-3 text-sm text-blue-800">
                      <li className="flex items-start space-x-2">
                        <span className="font-bold text-blue-600">1.</span>
                        <span>화면 하단의 <strong>공유 버튼(↑)</strong>을 누르세요</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <span className="font-bold text-blue-600">2.</span>
                        <span>스크롤하여 <strong>"홈 화면에 추가"</strong>를 선택하세요</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <span className="font-bold text-blue-600">3.</span>
                        <span>오른쪽 상단의 <strong>"추가"</strong> 버튼을 눌러 설치를 완료하세요</span>
                      </li>
                    </ol>
                  </div>
                </div>
              </div>

              {/* 아이콘/이미지 안내 (시각적 가이드) */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center justify-center space-x-8 mb-4">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-2 bg-blue-100 rounded-full flex items-center justify-center">
                      <Share2 className="w-8 h-8 text-blue-600" />
                    </div>
                    <p className="text-xs text-gray-600 font-medium">1. 공유 버튼</p>
                  </div>
                  <div className="text-2xl text-gray-400">→</div>
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-2 bg-green-100 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-8 h-8 text-green-600" />
                    </div>
                    <p className="text-xs text-gray-600 font-medium">2. 홈 화면 추가</p>
                  </div>
                </div>
                <p className="text-xs text-center text-gray-500">
                  Safari 브라우저에서만 설치 가능합니다
                </p>
              </div>
            </div>
          )}

          {/* Android 안내 */}
          {deviceType === 'android' && (
            <div className="space-y-4">
              {deferredPrompt ? (
                // Android Chrome (beforeinstallprompt 지원)
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <Smartphone className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                    <div className="flex-1">
                      <h3 className="font-bold text-green-900 mb-2">안드로이드에서 설치하기</h3>
                      <p className="text-sm text-green-800 mb-3">
                        설치 프롬프트가 표시되지 않았다면, 아래 버튼을 눌러 설치를 시작하세요.
                      </p>
                      <button
                        onClick={async () => {
                          try {
                            if (deferredPrompt) {
                              deferredPrompt.prompt()
                              const { outcome } = await deferredPrompt.userChoice
                              if (outcome === 'accepted') {
                                setIsModalOpen(false)
                              }
                              setDeferredPrompt(null)
                            }
                          } catch (error) {
                            console.error('앱 설치 프롬프트 표시 실패:', error)
                          }
                        }}
                        className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold flex items-center justify-center space-x-2 touch-manipulation min-h-[44px]"
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                      >
                        <Download className="w-5 h-5" />
                        <span>지금 설치하기</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                // Android (beforeinstallprompt 미지원 또는 다른 브라우저)
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <Menu className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
                    <div className="flex-1">
                      <h3 className="font-bold text-amber-900 mb-2">안드로이드에서 설치하기</h3>
                      <ol className="space-y-3 text-sm text-amber-800">
                        <li className="flex items-start space-x-2">
                          <span className="font-bold text-amber-600">1.</span>
                          <span>브라우저 상단의 <strong>메뉴 버튼(⋮)</strong>을 누르세요</span>
                        </li>
                        <li className="flex items-start space-x-2">
                          <span className="font-bold text-amber-600">2.</span>
                          <span><strong>"앱 설치"</strong> 또는 <strong>"홈 화면에 추가"</strong>를 선택하세요</span>
                        </li>
                        <li className="flex items-start space-x-2">
                          <span className="font-bold text-amber-600">3.</span>
                          <span>확인 버튼을 눌러 설치를 완료하세요</span>
                        </li>
                      </ol>
                      <p className="text-xs text-amber-700 mt-3 italic">
                        * Chrome 브라우저에서 설치가 가장 원활합니다
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 아이콘/이미지 안내 (시각적 가이드) */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center justify-center space-x-8 mb-4">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-2 bg-amber-100 rounded-full flex items-center justify-center">
                      <Menu className="w-8 h-8 text-amber-600" />
                    </div>
                    <p className="text-xs text-gray-600 font-medium">1. 메뉴 버튼</p>
                  </div>
                  <div className="text-2xl text-gray-400">→</div>
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-2 bg-green-100 rounded-full flex items-center justify-center">
                      <Download className="w-8 h-8 text-green-600" />
                    </div>
                    <p className="text-xs text-gray-600 font-medium">2. 앱 설치</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Desktop 안내 */}
          {deviceType === 'desktop' && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Smartphone className="w-6 h-6 text-gray-600 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 mb-2">데스크톱에서 설치하기</h3>
                  <p className="text-sm text-gray-700 mb-3">
                    모바일 기기에서 접속하시면 앱 설치 가이드를 확인할 수 있습니다.
                  </p>
                  <p className="text-xs text-gray-500">
                    * 데스크톱에서는 브라우저를 통해 사용하시면 됩니다.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 공통 안내 */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <CheckCircle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-purple-900 mb-1">앱 설치의 장점</p>
                <ul className="text-xs text-purple-800 space-y-1">
                  <li>• 홈 화면에서 빠르게 접근 가능</li>
                  <li>• 오프라인에서도 사용 가능</li>
                  <li>• 더 빠른 로딩 속도</li>
                  <li>• 앱처럼 편리한 사용 경험</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 닫기 버튼 */}
          <div className="flex justify-end pt-4 border-t border-gray-200">
            <button
              onClick={() => setIsModalOpen(false)}
              className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium touch-manipulation min-h-[44px]"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              닫기
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}

export default AppInstallGuide
