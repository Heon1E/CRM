import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { reloadOnceForNewVersion } from './utils/staleChunk'

/*
 * 배포 직후, 열어 둔 옛 화면이 사라진 조각 파일을 부르면 Vite가 이 이벤트를 쏜다.
 * 새 버전으로 한 번 새로고침한다(`staleChunk.js`). 방금 했는데 또 나면 막지 않고
 * 오류를 그대로 흘려 ErrorBoundary가 보여주게 한다 — 끝없이 새로고침하지 않게.
 */
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnceForNewVersion()) event.preventDefault()
})

// 서비스 워커 등록 (PWA 지원)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        console.log('Service Worker 등록 성공:', registration.scope)

        // 즉시 업데이트 체크
        registration.update()

        // 대기 중인 워커가 있으면 즉시 활성화 시도
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                newWorker.postMessage({ type: 'SKIP_WAITING' })
              }
            })
          }
        })

        // 새 워커가 활성화되면 자동 새로고침
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload()
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

