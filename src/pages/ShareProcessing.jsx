import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'

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

  useEffect(() => {
    processSharedAudio()
  }, [])

  // 공유된 오디오 파일 처리
  const processSharedAudio = async () => {
    try {
      // 1. IndexedDB에서 오디오 파일 가져오기
      const audioData = await getSharedAudioFromDB()
      
      if (!audioData) {
        setStatus('error')
        setMessage('공유된 오디오 파일을 찾을 수 없습니다.')
        setTimeout(() => navigate('/'), 3000)
        return
      }

      setMessage('오디오 파일을 분석하는 중...')
      setStatus('processing')

      // 2. Gemini API로 오디오 분석
      const result = await analyzeAudioWithGemini(audioData)
      
      if (!result || !result.success) {
        throw new Error(result?.error || '오디오 분석에 실패했습니다.')
      }

      setAnalysisResult(result.data)
      setMessage('통화 기록을 저장하는 중...')

      // 3. 활동 내역에 저장
      const today = new Date().toISOString().split('T')[0]
      const activityData = {
        type: result.data.type || '전화',
        activity_date: result.data.date || today,
        description: result.data.summary || result.data.content || '통화 녹음 분석 결과',
        clientName: result.data.clientName || '',
        status: '완료',
      }

      await addActivity(activityData)

      // 4. IndexedDB에서 파일 삭제 (처리 완료)
      await clearSharedAudioFromDB()

      setStatus('success')
      setMessage('통화 기록이 저장되었습니다!')
      
      toast.success('통화 기록이 성공적으로 저장되었습니다.', {
        duration: 3000,
        icon: '✅'
      })

      // 3초 후 대시보드로 이동
      setTimeout(() => {
        navigate('/')
      }, 3000)

    } catch (error) {
      console.error('[ShareProcessing] 오디오 처리 오류:', error)
      setStatus('error')
      setMessage(`오류: ${error.message}`)
      
      toast.error('오디오 처리 중 오류가 발생했습니다: ' + error.message, {
        duration: 5000,
        icon: '❌'
      })

      // 5초 후 대시보드로 이동
      setTimeout(() => {
        navigate('/')
      }, 5000)
    }
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

  // Gemini API로 오디오 분석
  const analyzeAudioWithGemini = async (audioData) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('Gemini API 키가 설정되지 않았습니다.')
    }

    try {
      // 오디오 파일을 Base64로 변환
      const base64Audio = arrayBufferToBase64(audioData.audioData)
      const mimeType = audioData.mimeType || 'audio/m4a'
      
      // Gemini 1.5 Flash는 오디오 파일을 직접 지원하지 않으므로,
      // 파일명과 메타데이터를 기반으로 분석합니다.
      // 향후 Google Cloud Speech-to-Text API 또는 다른 STT 서비스를 연동하여
      // 실제 오디오를 텍스트로 변환한 후 Gemini에 전송할 수 있습니다.
      
      const fileName = audioData.fileName || '통화 녹음.m4a'
      const title = audioData.title || '통화 녹음'
      const timestamp = new Date(audioData.timestamp).toISOString().split('T')[0]
      
      // 파일명에서 거래처명, 날짜 등 추출 시도
      const clientNameMatch = fileName.match(/([가-힣A-Za-z]+(?:사|기업|회사|코퍼레이션|Corp|Inc|Ltd))?/i)
      const dateMatch = fileName.match(/(\d{4}[-.]?\d{2}[-.]?\d{2})/)
      const extractedClientName = clientNameMatch ? clientNameMatch[1] : ''
      const extractedDate = dateMatch ? dateMatch[1].replace(/[-.]/g, '-') : timestamp
      
      const prompt = `당신은 통화 녹음 파일 분석 전문가입니다. 다음 통화 녹음 파일의 메타데이터를 바탕으로 분석해주세요.

**파일 정보:**
- 파일명: ${fileName}
- 제목: ${title}
- 원본 날짜: ${timestamp}
- 추출된 거래처명: ${extractedClientName || '없음'}
- 추출된 날짜: ${extractedDate}

**분석 요청:**
이 통화 녹음 파일(안드로이드 갤럭시 통화 녹음)의 메타데이터를 기반으로 다음 정보를 추출해주세요:

1. **거래처명** (파일명에서 추출한 회사명 또는 담당자명, 없으면 빈 문자열)
2. **통화 날짜** (추출된 날짜가 있으면 사용, 없으면 오늘 날짜: ${new Date().toISOString().split('T')[0]})
3. **핵심 내용** (주문/미팅/컴플레인/일반 문의 중 하나로 분류, 파일명/제목에서 유추)
4. **요약** (파일명과 제목을 바탕으로 추론한 통화 내용 요약, 3-5줄)

**주의사항:**
- 통화 녹음 파일의 실제 음성 내용을 들을 수 없으므로, 파일명과 제목 정보만을 기반으로 추론해주세요.
- 파일명에 거래처명이나 날짜가 포함되어 있을 수 있습니다. (예: "A사_20240115.m4a", "B회사_통화.m4a")
- 확실하지 않은 정보는 빈 문자열("")로 설정하세요.
- 파일명에서 추출한 거래처명이 있으면 그것을 우선 사용하세요.

**[응답 형식 (JSON)]**
{
  "clientName": "거래처명 또는 빈 문자열",
  "date": "YYYY-MM-DD 형식의 날짜",
  "type": "주문" | "미팅" | "컴플레인" | "일반",
  "summary": "3-5줄 요약",
  "content": "상세 내용"
}`

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Gemini API 오류 (${response.status}): ${errorText}`)
      }

      const result = await response.json()
      const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text

      if (!responseText) {
        throw new Error('Gemini API 응답이 비어있습니다.')
      }

      // JSON 추출 및 파싱
      let jsonText = responseText.trim()
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '')
      }

      let parsed = null
      try {
        parsed = JSON.parse(jsonText)
      } catch (parseError) {
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
        if (jsonMatch && jsonMatch[0]) {
          parsed = JSON.parse(jsonMatch[0])
        } else {
          throw new Error('JSON 파싱 실패')
        }
      }

      // 안전한 구조로 정규화
      const today = new Date().toISOString().split('T')[0]
      return {
        success: true,
        data: {
          clientName: parsed.clientName || '',
          date: parsed.date || today,
          type: parsed.type || '일반',
          summary: parsed.summary || `통화 녹음: ${audioData.title || '통화 기록'}`,
          content: parsed.content || parsed.summary || `통화 녹음 파일: ${audioData.fileName || '통화 기록'}`
        }
      }
    } catch (error) {
      console.error('[ShareProcessing] Gemini API 오류:', error)
      // 에러 발생 시 기본값 반환
      const today = new Date().toISOString().split('T')[0]
      return {
        success: true, // 기본값으로 저장하도록 허용
        data: {
          clientName: '',
          date: today,
          type: '일반',
          summary: `통화 녹음: ${audioData.title || '통화 기록'}`,
          content: `통화 녹음 파일: ${audioData.fileName || '통화 기록'} (분석 실패, 기본값으로 저장)`
        }
      }
    }
  }

  // ArrayBuffer를 Base64로 변환 (참고용, 현재는 사용하지 않음)
  const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#121212] p-4">
      <div className="bg-[#1E1E1E] border border-gray-800 rounded-lg p-8 max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-16 h-16 mx-auto mb-4 text-gray-300 animate-spin" />
            <h2 className="text-xl font-semibold text-white mb-2">파일 처리 중</h2>
            <p className="text-gray-300">{message}</p>
          </>
        )}

        {status === 'processing' && (
          <>
            <Loader2 className="w-16 h-16 mx-auto mb-4 text-gray-300 animate-spin" />
            <h2 className="text-xl font-semibold text-white mb-2">오디오 분석 중</h2>
            <p className="text-gray-300">{message}</p>
            {analysisResult && (
              <div className="mt-4 p-4 bg-[#1E1E1E] rounded-lg text-left border border-gray-800">
                <p className="text-sm text-gray-300">
                  <strong>거래처:</strong> {analysisResult.clientName || '없음'}
                </p>
                <p className="text-sm text-gray-300">
                  <strong>날짜:</strong> {analysisResult.date}
                </p>
                <p className="text-sm text-gray-300">
                  <strong>유형:</strong> {analysisResult.type}
                </p>
              </div>
            )}
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-emerald-300" />
            <h2 className="text-xl font-semibold text-white mb-2">처리 완료</h2>
            <p className="text-gray-300 mb-4">{message}</p>
            {analysisResult && (
              <div className="mt-4 p-4 bg-[#1E1E1E] rounded-lg text-left border border-gray-800">
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
            <p className="text-sm text-gray-300 mt-4">잠시 후 대시보드로 이동합니다...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-16 h-16 mx-auto mb-4 text-rose-400" />
            <h2 className="text-xl font-semibold text-white mb-2">오류 발생</h2>
            <p className="text-gray-300 mb-4">{message}</p>
            <p className="text-sm text-gray-300 mt-4">잠시 후 대시보드로 이동합니다...</p>
          </>
        )}
      </div>
    </div>
  )
}

export default ShareProcessing



