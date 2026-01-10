import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// 서비스 워커 등록 (PWA 지원)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        console.log('Service Worker 등록 성공:', registration.scope)
        
        // 서비스 워커 업데이트 확인
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // 새 버전이 설치되었을 때 사용자에게 알림 (선택사항)
                console.log('새 버전이 사용 가능합니다. 페이지를 새로고침하세요.')
              }
            })
          }
        })
      })
      .catch((error) => {
        console.error('Service Worker 등록 실패:', error)
      })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
