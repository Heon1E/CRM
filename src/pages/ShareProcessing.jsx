import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { todayYmd, ymd } from '../utils/day'

/**
 * 공유된 통화 녹음 파일 처리 페이지
 * Service Worker에서 저장한 오디오 파일을 Gemini API로 분석하여 활동 내역에 저장
 */
const ShareProcessing = () => {
  const navigate = useNavigate()
  const { addActivity } = useData()
  const [status, setStatus] = useState('loading') // loading, processing, success, error
  const [message, setMessage] = useState('통화 녹음 파일을 불러오는 중...')
  const [analysisResult, setAnalysisResult] = useState(null)
  const [shared, setShared] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    processSharedAudio()
  }, [])

  // 공유된 오디오 파일 처리
  const processSharedAudio = async () => {
    try {
      const audioData = await getSharedAudioFromDB()
      if (!audioData) {
        setStatus('error')
        setMessage('공유된 오디오 파일을 찾을 수 없습니다.')
        setTimeout(() => navigate('/'), 3000)
        return
      }

      setShared(audioData)
      setMessage('통화 내용을 듣고 있습니다…')
      setStatus('processing')

      const result = await analyzeCall(audioData)

      /*
       * **못 알아들었으면 저장하지 않는다.** 예전에는 판독이 실패해도
       * 파일명으로 만든 가짜 요약을 활동에 그대로 넣었다. 활동 기록은
       * 영업 코치·KPI·거래처 브리핑의 근거라, 없는 기록보다 틀린 기록이 나쁘다.
       */
      if (result.inaudible) {
        setStatus('error')
        setMessage(result.message || '음성을 알아듣지 못했습니다. 활동을 직접 입력해 주세요.')
        return
      }

      // 판독 결과를 바로 저장하지 않는다 — 사람이 보고 정한다
      // (ERP 스크린샷 판독과 같은 규칙).
      setAnalysisResult(result)
      setStatus('review')
    } catch (error) {
      console.error('[ShareProcessing] 오디오 처리 오류:', error)
      setStatus('error')
      setMessage(error.message || '통화 판독에 실패했습니다.')
    }
  }

  /** 서버(`/api/analyze-call`)가 음성을 듣는다. 키를 브라우저에 두지 않는다. */
  const analyzeCall = async (audioData) => {
    const res = await fetch('/api/analyze-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64: arrayBufferToBase64(audioData.audioData),
        mimeType: audioData.mimeType || 'audio/mp4',
        fileName: audioData.fileName || '',
        timestamp: audioData.timestamp ? ymd(new Date(audioData.timestamp)) : todayYmd(),
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || '통화 판독에 실패했습니다.')
    return data
  }

  /** 사람이 확인한 뒤에만 활동으로 남긴다. */
  const saveActivity = async () => {
    if (!analysisResult) return
    setSaving(true)
    try {
      const body = [
        analysisResult.summary,
        analysisResult.contactName ? `[담당자] ${analysisResult.contactName}` : '',
        analysisResult.nextAction ? `[다음] ${analysisResult.nextAction}` : '',
      ].filter(Boolean).join('\n')

      await addActivity({
        type: '전화',   // 통화 녹음이므로 전화다. KPI 정기적방문(미팅/방문)에는 들어가지 않는다.
        activity_date: analysisResult.date || todayYmd(),
        description: body,
        clientName: analysisResult.clientName || '',
        status: '완료',
      })
      await clearSharedAudioFromDB()
      setStatus('success')
      setMessage('통화 기록이 저장되었습니다.')
      toast.success('통화 기록이 저장되었습니다.', { duration: 3000 })
      setTimeout(() => navigate('/'), 2500)
    } catch (e) {
      console.error('[ShareProcessing] 저장 실패:', e)
      toast.error('저장에 실패했습니다: ' + e.message)
      setSaving(false)
    }
  }

  const discard = async () => {
    try { await clearSharedAudioFromDB() } catch { /* 지우기 실패는 막지 않는다 */ }
    navigate('/')
  }

  // IndexedDB에서 공유된 오디오 파일 가져오기
  const getSharedAudioFromDB = () => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('XavianCRM_SharedFiles', 1)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const transaction = db.transaction(['shared_audio'], 'readonly')
        const store = transaction.objectStore('shared_audio')
        
        // 모든 항목 가져오기 (최신 하나만 있어야 함)
        const getAllRequest = store.getAll()
        getAllRequest.onsuccess = () => {
          const items = getAllRequest.result
          if (items && items.length > 0) {
            // 가장 최신 항목 반환
            const latest = items.sort((a, b) => b.timestamp - a.timestamp)[0]
            resolve(latest)
          } else {
            resolve(null)
          }
        }
        getAllRequest.onerror = () => reject(getAllRequest.error)
      }

      request.onupgradeneeded = (event) => {
        const db = event.target.result
        if (!db.objectStoreNames.contains('shared_audio')) {
          db.createObjectStore('shared_audio', { keyPath: 'timestamp' })
        }
      }
    })
  }

  // IndexedDB에서 공유된 오디오 파일 삭제
  const clearSharedAudioFromDB = () => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('XavianCRM_SharedFiles', 1)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const transaction = db.transaction(['shared_audio'], 'readwrite')
        const store = transaction.objectStore('shared_audio')
        
        const clearRequest = store.clear()
        clearRequest.onsuccess = () => resolve()
        clearRequest.onerror = () => reject(clearRequest.error)
      }
    })
  }


  // ArrayBuffer -> Base64 (서버로 음성을 실어 보낼 때 쓴다)
  const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[color:var(--bg-app)] p-4">
      <div className="bg-[color:var(--bg-card)] border border-[color:var(--border)] rounded-lg p-8 max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-16 h-16 mx-auto mb-4 text-[color:var(--text-secondary)] animate-spin" />
            <h2 className="text-xl font-semibold text-[color:var(--text-primary)] mb-2">파일 처리 중</h2>
            <p className="text-[color:var(--text-secondary)]">{message}</p>
          </>
        )}

        {status === 'processing' && (
          <>
            <Loader2 className="w-16 h-16 mx-auto mb-4 text-[color:var(--text-secondary)] animate-spin" />
            <h2 className="text-xl font-semibold text-[color:var(--text-primary)] mb-2">오디오 분석 중</h2>
            <p className="text-[color:var(--text-secondary)]">{message}</p>
            {analysisResult && (
              <div className="mt-4 p-4 bg-[color:var(--bg-card)] rounded-lg text-left border border-[color:var(--border)]">
                <p className="text-sm text-[color:var(--text-secondary)]">
                  <strong>거래처:</strong> {analysisResult.clientName || '없음'}
                </p>
                <p className="text-sm text-[color:var(--text-secondary)]">
                  <strong>날짜:</strong> {analysisResult.date}
                </p>
                <p className="text-sm text-[color:var(--text-secondary)]">
                  <strong>유형:</strong> {analysisResult.type}
                </p>
              </div>
            )}
          </>
        )}

        {status === 'review' && analysisResult && (
          <>
            <h2 className="text-xl font-semibold text-[color:var(--text-primary)] mb-1">이렇게 들었습니다</h2>
            <p className="text-sm text-[color:var(--text-secondary)] mb-4">
              맞으면 저장하고, 아니면 버리고 직접 입력하세요.
            </p>
            <div className="p-4 rounded-lg text-left border border-[color:var(--border)] bg-[color:var(--bg-panel)]">
              <dl className="text-sm space-y-1">
                <div className="flex gap-2">
                  <dt className="shrink-0 w-16 text-[color:var(--text-secondary)]">거래처</dt>
                  <dd className="text-[color:var(--text-primary)] font-semibold">
                    {analysisResult.clientName || <span className="font-normal text-[color:var(--text-secondary)]">못 알아들음 — 저장 후 지정하세요</span>}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="shrink-0 w-16 text-[color:var(--text-secondary)]">날짜</dt>
                  <dd className="text-[color:var(--text-primary)]">{analysisResult.date}</dd>
                </div>
                {analysisResult.contactName && (
                  <div className="flex gap-2">
                    <dt className="shrink-0 w-16 text-[color:var(--text-secondary)]">담당자</dt>
                    <dd className="text-[color:var(--text-primary)]">{analysisResult.contactName}</dd>
                  </div>
                )}
              </dl>
              <p className="mt-3 pt-3 border-t border-[color:var(--border)] text-sm text-[color:var(--text-primary)] whitespace-pre-wrap">
                {analysisResult.summary}
              </p>
              {analysisResult.nextAction && (
                <p className="mt-2 text-sm text-[color:var(--text-primary)]">
                  <strong>다음:</strong> {analysisResult.nextAction}
                </p>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={discard} disabled={saving} className="oem-btn-secondary flex-1">
                버리기
              </button>
              <button type="button" onClick={saveActivity} disabled={saving} className="oem-btn-primary flex-1">
                {saving ? '저장 중…' : '활동으로 저장'}
              </button>
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-emerald-300" />
            <h2 className="text-xl font-semibold text-[color:var(--text-primary)] mb-2">처리 완료</h2>
            <p className="text-[color:var(--text-secondary)] mb-4">{message}</p>
            {analysisResult && (
              <div className="mt-4 p-4 bg-[color:var(--bg-card)] rounded-lg text-left border border-[color:var(--border)]">
                <p className="text-sm text-emerald-300">
                  <strong>거래처:</strong> {analysisResult.clientName || '없음'}
                </p>
                <p className="text-sm text-emerald-300">
                  <strong>날짜:</strong> {analysisResult.date}
                </p>
                <p className="text-sm text-emerald-300">
                  <strong>유형:</strong> {analysisResult.type}
                </p>
                <p className="text-sm text-emerald-300 mt-2">
                  <strong>요약:</strong> {analysisResult.summary}
                </p>
              </div>
            )}
            <p className="text-sm text-[color:var(--text-secondary)] mt-4">잠시 후 대시보드로 이동합니다...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-16 h-16 mx-auto mb-4 text-rose-400" />
            <h2 className="text-xl font-semibold text-[color:var(--text-primary)] mb-2">오류 발생</h2>
            <p className="text-[color:var(--text-secondary)] mb-4">{message}</p>
            <p className="text-sm text-[color:var(--text-secondary)] mt-4">잠시 후 대시보드로 이동합니다...</p>
          </>
        )}
      </div>
    </div>
  )
}

export default ShareProcessing



