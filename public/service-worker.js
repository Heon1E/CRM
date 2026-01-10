// Xavian CRM - Service Worker
// 오프라인 지원 및 캐싱을 위한 기본 서비스 워커

const CACHE_NAME = 'xavian-crm-v1'
const urlsToCache = [
  '/',
  '/index.html',
  '/src/main.jsx',
  '/src/App.jsx',
  '/src/index.css'
]

// 설치 이벤트: 캐시 생성 및 리소스 캐싱
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: 캐시 열기')
        return cache.addAll(urlsToCache)
      })
      .catch((error) => {
        console.error('Service Worker: 캐시 추가 실패', error)
      })
  )
  // 즉시 활성화를 위해 기존 서비스 워커 건너뛰기
  self.skipWaiting()
})

// 활성화 이벤트: 오래된 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: 오래된 캐시 삭제', cacheName)
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
  // 모든 클라이언트에 즉시 제어권 부여
  return self.clients.claim()
})

// fetch 이벤트: 네트워크 우선, 실패 시 캐시 사용 및 Share Target POST 처리
self.addEventListener('fetch', (event) => {
  // Share Target POST 요청 처리
  if (event.request.method === 'POST' && event.request.url.includes('/share-receive')) {
    event.respondWith(handleShareTarget(event.request))
    return
  }

  // GET 요청만 처리
  if (event.request.method !== 'GET') {
    return
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 응답이 유효한지 확인
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response
        }

        // 응답을 복제하여 캐시에 저장
        const responseToCache = response.clone()

        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(event.request, responseToCache)
          })

        return response
      })
      .catch(() => {
        // 네트워크 실패 시 캐시에서 찾기
        return caches.match(event.request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse
            }
            // 캐시에도 없으면 기본 오프라인 페이지 반환
            if (event.request.destination === 'document') {
              return caches.match('/index.html')
            }
            return new Response('오프라인 상태입니다', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain'
              })
            })
          })
      })
  )
})

// 메시지 이벤트: 클라이언트와 통신
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  
  // 푸시 알림 표시 요청 (백업 완료 등)
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data
    self.registration.showNotification(title, options)
  }
})

// 푸시 이벤트: 서버에서 보낸 푸시 알림 수신
self.addEventListener('push', (event) => {
  let notificationData = {
    title: 'Xavian CRM',
    body: '새로운 알림이 있습니다.',
    icon: '/vite.svg',
    badge: '/vite.svg',
    tag: 'default',
    requireInteraction: false,
    data: {}
  }

  // 푸시 데이터가 있으면 파싱
  if (event.data) {
    try {
      const pushData = event.data.json()
      notificationData = {
        ...notificationData,
        title: pushData.title || notificationData.title,
        body: pushData.body || notificationData.body,
        icon: pushData.icon || notificationData.icon,
        badge: pushData.badge || notificationData.badge,
        tag: pushData.tag || notificationData.tag,
        requireInteraction: pushData.requireInteraction || false,
        data: pushData.data || {}
      }
    } catch (error) {
      // JSON 파싱 실패 시 텍스트로 처리
      const textData = event.data.text()
      notificationData.body = textData || notificationData.body
    }
  }

  // 알림 표시
  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      tag: notificationData.tag,
      requireInteraction: notificationData.requireInteraction,
      data: notificationData.data,
      vibrate: [200, 100, 200], // 진동 패턴 (모바일)
      actions: [
        {
          action: 'open',
          title: '열기',
          icon: '/vite.svg'
        },
        {
          action: 'close',
          title: '닫기'
        }
      ]
    })
  )
})

// 알림 클릭 이벤트
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  // 알림 액션 처리
  if (event.action === 'close') {
    return
  }

  // 클라이언트 윈도우 열기 또는 포커스
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      // 이미 열려있는 창이 있으면 포커스
      for (let client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus()
        }
      }
      // 새 창 열기
      if (clients.openWindow) {
        return clients.openWindow('/')
      }
    })
  )
})

// 알림 닫기 이벤트 (선택사항)
self.addEventListener('notificationclose', (event) => {
  // 알림이 닫혔을 때 필요한 작업 수행 (분석 등)
})

// Share Target POST 요청 처리 함수
async function handleShareTarget(request) {
  try {
    // FormData 추출
    const formData = await request.formData()
    const audioFile = formData.get('media')
    const title = formData.get('name') || '통화 녹음'

    if (!audioFile || !(audioFile instanceof File)) {
      console.error('[Service Worker] 오디오 파일이 없습니다.')
      return new Response('오디오 파일이 필요합니다.', {
        status: 400,
        headers: { 'Content-Type': 'text/plain' }
      })
    }

    // 오디오 파일을 ArrayBuffer로 변환
    const arrayBuffer = await audioFile.arrayBuffer()
    const fileName = audioFile.name || `recording_${Date.now()}.m4a`

    // IndexedDB에 저장 (클라이언트가 가져올 수 있도록)
    await saveSharedAudioToDB({
      fileName,
      title,
      audioData: arrayBuffer,
      mimeType: audioFile.type || 'audio/m4a',
      timestamp: Date.now()
    })

    // 클라이언트에 메시지 전송 (파일 처리 시작 알림)
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clients) {
      client.postMessage({
        type: 'SHARED_AUDIO_RECEIVED',
        data: {
          fileName,
          title,
          timestamp: Date.now()
        }
      })
    }

    // 처리 페이지로 리다이렉트
    return Response.redirect('/share-processing', 303)
  } catch (error) {
    console.error('[Service Worker] Share Target 처리 오류:', error)
    return new Response('파일 처리 중 오류가 발생했습니다: ' + error.message, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    })
  }
}

// IndexedDB에 공유된 오디오 파일 저장
async function saveSharedAudioToDB(data) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('XavianCRM_SharedFiles', 1)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction(['shared_audio'], 'readwrite')
      const store = transaction.objectStore('shared_audio')

      // 기존 데이터 삭제 (최신 하나만 유지)
      store.clear().onsuccess = () => {
        // 새 데이터 추가
        const addRequest = store.add(data)
        addRequest.onsuccess = () => resolve()
        addRequest.onerror = () => reject(addRequest.error)
      }
    }

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains('shared_audio')) {
        db.createObjectStore('shared_audio', { keyPath: 'timestamp' })
      }
    }
  })
}
