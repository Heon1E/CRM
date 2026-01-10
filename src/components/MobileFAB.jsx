import React, { useState, useEffect, useRef } from 'react'
import { Smartphone, Mic, Square, Loader2, X } from 'lucide-react'
import voiceService from '../services/VoiceService'
import { classifyVoiceIntent, summarizeMeeting } from '../utils/voiceAssistant'
import { requestWakeLock, releaseWakeLock } from '../utils/wakeLock'
import { useData } from '../contexts/DataContext'
import { useBackgroundTask } from '../contexts/BackgroundTaskContext'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import Modal from './Modal'

/**
 * 모바일 전용 FAB (Floating Action Button) 컴포넌트
 * 우측 하단에 고정되어 앱 설치, 마이크, 녹음 버튼 제공 (운전 중에도 누르기 편하게 크게)
 */
const MobileFAB = () => {
  const { addActivity } = useData()
  const { addTask, removeTask } = useBackgroundTask()
  const navigate = useNavigate()

  const [isExpanded, setIsExpanded] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [installModalOpen, setInstallModalOpen] = useState(false)
  const [deviceType, setDeviceType] = useState(null)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [transcript, setTranscript] = useState('')
  const [recordingTranscript, setRecordingTranscript] = useState('')

  const recordingIntervalRef = useRef(null)
  const isListeningRef = useRef(false)
  const isRecordingRef = useRef(false)

  // PWA 설치 상태 확인 및 기기 감지
  useEffect(() => {
    const checkStandalone = () => {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      const isIOSStandalone = ('standalone' in window.navigator) && (window.navigator.standalone)
      const isAndroidStandalone = window.matchMedia('(display-mode: standalone)').matches
      
      setIsStandalone((isIOS && isIOSStandalone) || isAndroidStandalone)

      // 기기 타입 감지
      if (isIOS) {
        setDeviceType('ios')
      } else if (/Android/.test(navigator.userAgent)) {
        setDeviceType('android')
      } else {
        setDeviceType('desktop')
      }
    }

    checkStandalone()

    // Android Chrome: beforeinstallprompt 이벤트 리스너
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // 설치 완료 이벤트 리스너
    const handleAppInstalled = () => {
      setIsStandalone(true)
      setInstallModalOpen(false)
      setDeferredPrompt(null)
    }

    window.addEventListener('appinstalled', handleAppInstalled)

    // 화면 크기 변경 감지
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setIsExpanded(false)
      }
    }

    window.addEventListener('resize', handleResize)
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  // 녹음 시간 타이머
  useEffect(() => {
    if (isRecording) {
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    } else {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current)
        recordingIntervalRef.current = null
      }
      setRecordingTime(0)
    }

    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current)
      }
    }
  }, [isRecording])

  // ref와 state 동기화
  useEffect(() => {
    isListeningRef.current = isListening
  }, [isListening])

  useEffect(() => {
    isRecordingRef.current = isRecording
  }, [isRecording])

  // 시간 포맷팅 (초 -> MM:SS)
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  // 음성 명령 시작
  const handleStartListening = async () => {
    if (!voiceService.getSupported()) {
      toast.error('이 브라우저는 음성 인식을 지원하지 않습니다.', { duration: 6000 })
      return
    }

    try {
      // Wake Lock 요청
      await requestWakeLock()

      setTranscript('')
      voiceService.clearAccumulatedTranscript()
      setIsListening(true)
      setIsRecording(false)
      isListeningRef.current = true
      isRecordingRef.current = false

      await voiceService.startListening(
        (finalTranscript, interimTranscript, accumulatedTranscript) => {
          if (isListeningRef.current) {
            const currentFinal = accumulatedTranscript || transcript.split('|')[0]?.trim() || ''
            const combinedFinal = currentFinal && finalTranscript 
              ? `${currentFinal} ${finalTranscript}`.trim() 
              : (finalTranscript || currentFinal)
            setTranscript(interimTranscript ? `${combinedFinal}|${interimTranscript}` : combinedFinal)
          }
        },
        (error) => {
          setIsListening(false)
          isListeningRef.current = false
          releaseWakeLock()
          
          console.error('[MobileFAB] 음성 인식 에러:', {
            error: error,
            type: typeof error,
            timestamp: new Date().toISOString()
          })
          
          let errorMessage = null
          if (error === 'not-allowed') {
            errorMessage = '마이크 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요.'
          } else if (error === 'service-not-allowed') {
            errorMessage = '음성 인식 서비스를 사용할 수 없습니다.'
          } else if (error === 'aborted') {
            errorMessage = '음성 인식이 중단되었습니다.'
          }
          
          if (errorMessage) {
            toast.error(errorMessage, { duration: 5000, icon: '⚠️' })
          }
        },
        () => {
          releaseWakeLock()
        },
        true // autoRestart
      ).catch((error) => {
        console.error('[MobileFAB] startListening 에러:', {
          error: error.message,
          name: error.name,
          stack: error.stack,
          timestamp: new Date().toISOString()
        })
        setIsListening(false)
        isListeningRef.current = false
        releaseWakeLock()
        throw error
      })

      toast.success('음성 명령을 듣고 있습니다...', { duration: 2000 })
    } catch (error) {
      console.error('[MobileFAB] 음성 인식 시작 오류:', {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      })
      setIsListening(false)
      releaseWakeLock()
      toast.error('음성 인식을 시작할 수 없습니다.', { duration: 3000 })
    }
  }

  // 음성 명령 종료 및 처리
  const handleStopListening = async () => {
    if (!isListening) return

    try {
      voiceService.stopListening()
      setIsListening(false)
      isListeningRef.current = false
      releaseWakeLock()

      const accumulatedText = voiceService.getAccumulatedTranscript()
      const finalTranscript = accumulatedText || transcript.split('|')[0].trim() || transcript.trim()

      if (!finalTranscript || finalTranscript.length < 3) {
        toast.warning('음성이 인식되지 않았습니다. 다시 시도해주세요.', { duration: 2000 })
        return
      }

      setIsProcessing(true)
      const taskId = `voice_command_${Date.now()}`
      addTask(taskId, '음성 명령 처리')

      try {
        const result = await classifyVoiceIntent(finalTranscript)
        removeTask(taskId)

        if (result.intent === 'schedule') {
          let parsedDate = result.data.date
          if (!parsedDate || !/^\d{4}-\d{2}-\d{2}$/.test(parsedDate)) {
            parsedDate = new Date().toISOString().split('T')[0]
          }

          const activityData = {
            type: result.data.type || '미팅',
            activity_date: parsedDate,
            description: `${result.data.title || '음성 명령으로 등록'}${result.data.description ? '\n' + result.data.description : ''}`,
            clientName: result.data.clientName || '',
            status: '진행중',
          }

          await addActivity(activityData)
          
          const clientInfo = result.data.clientName ? ` (${result.data.clientName})` : ''
          toast.success(`${result.data.title || '일정'}${clientInfo}이 등록되었습니다.`, {
            duration: 3000,
            icon: '✅'
          })
        } else if (result.intent === 'query') {
          const queryType = result.data.queryType || 'activities'
          const searchTerm = result.data.searchTerm || ''
          
          if (queryType === 'activities') {
            navigate('/activities' + (searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ''))
          } else if (queryType === 'clients') {
            navigate('/clients' + (searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ''))
          }
          
          toast.success(`"${result.data.searchTerm || '검색'}" 결과를 확인하세요.`, {
            duration: 2000,
            icon: '🔍'
          })
        } else {
          toast.warning('명령을 이해할 수 없습니다. 다시 시도해주세요.', {
            duration: 3000,
            icon: '⚠️'
          })
        }
      } catch (error) {
        removeTask(taskId)
        console.error('[MobileFAB] 음성 명령 처리 오류:', {
          error: error.message,
          stack: error.stack,
          transcriptLength: finalTranscript.length,
          timestamp: new Date().toISOString()
        })
        toast.error('음성 명령 처리 중 오류가 발생했습니다.', {
          duration: 4000,
          icon: '❌'
        })
      } finally {
        setIsProcessing(false)
        setTranscript('')
        voiceService.clearAccumulatedTranscript()
      }
    } catch (error) {
      console.error('[MobileFAB] 음성 인식 종료 오류:', {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      })
      setIsListening(false)
      setIsProcessing(false)
      releaseWakeLock()
    }
  }

  // 회의록 녹음 시작
  const handleStartRecording = async () => {
    if (!voiceService.getSupported()) {
      toast.error('이 브라우저는 음성 인식을 지원하지 않습니다.', { duration: 6000 })
      return
    }

    try {
      // Wake Lock 요청
      await requestWakeLock()

      setRecordingTranscript('')
      setRecordingTime(0)
      voiceService.clearAccumulatedTranscript()
      setIsRecording(true)
      setIsListening(false)
      isRecordingRef.current = true
      isListeningRef.current = false

      await voiceService.startListening(
        (finalTranscript, interimTranscript, accumulatedTranscript) => {
          if (isRecordingRef.current) {
            const current = accumulatedTranscript || recordingTranscript.trim()
            const newText = finalTranscript + (interimTranscript ? ' ' + interimTranscript : '')
            setRecordingTranscript(current && newText ? `${current} ${newText}`.trim() : (newText || current))
          }
        },
        (error) => {
          setIsRecording(false)
          isRecordingRef.current = false
          releaseWakeLock()
          
          console.error('[MobileFAB] 녹음 에러:', {
            error: error,
            type: typeof error,
            timestamp: new Date().toISOString()
          })
          
          let errorMessage = null
          if (error === 'not-allowed') {
            errorMessage = '마이크 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요.'
          } else if (error === 'service-not-allowed') {
            errorMessage = '음성 인식 서비스를 사용할 수 없습니다.'
          } else if (error === 'aborted') {
            errorMessage = '녹음이 중단되었습니다.'
          }
          
          if (errorMessage) {
            toast.error(errorMessage, { duration: 5000, icon: '⚠️' })
          }
        },
        () => {
          releaseWakeLock()
        },
        true // autoRestart
      ).catch((error) => {
        console.error('[MobileFAB] 녹음 시작 에러:', {
          error: error.message,
          name: error.name,
          stack: error.stack,
          timestamp: new Date().toISOString()
        })
        setIsRecording(false)
        isRecordingRef.current = false
        releaseWakeLock()
        throw error
      })

      toast.success('회의록 녹음을 시작했습니다. 종료 시 자동으로 요약됩니다.', {
        duration: 3000,
        icon: '🎙️'
      })
    } catch (error) {
      console.error('[MobileFAB] 녹음 시작 오류:', {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      })
      setIsRecording(false)
      isRecordingRef.current = false
      releaseWakeLock()
      toast.error('녹음을 시작할 수 없습니다.', { duration: 3000 })
    }
  }

  // 회의록 녹음 종료 및 요약
  const handleStopRecording = async () => {
    if (!isRecording) return

    try {
      voiceService.stopListening()
      setIsRecording(false)
      isRecordingRef.current = false
      releaseWakeLock()

      const accumulatedText = voiceService.getAccumulatedTranscript()
      const finalTranscript = accumulatedText || recordingTranscript.trim()

      // transcript 로깅 (디버깅용)
      console.log('[MobileFAB] 녹음 종료 - Transcript 확인:', {
        accumulatedText: accumulatedText,
        recordingTranscript: recordingTranscript,
        finalTranscript: finalTranscript,
        length: finalTranscript ? finalTranscript.length : 0,
        isEmpty: !finalTranscript || finalTranscript.trim().length === 0,
        timestamp: new Date().toISOString()
      })

      if (!finalTranscript || finalTranscript.trim().length < 10) {
        console.warn('[MobileFAB] 녹음된 내용이 너무 짧음:', {
          length: finalTranscript ? finalTranscript.length : 0,
          content: finalTranscript ? finalTranscript.substring(0, 50) : '(empty)'
        })
        toast.warning('녹음된 내용이 너무 짧습니다. 최소 10자 이상의 내용이 필요합니다.', { 
          duration: 3000, 
          icon: '⚠️' 
        })
        return
      }

      setIsProcessing(true)
      const taskId = `meeting_summary_${Date.now()}`
      addTask(taskId, '회의록 요약 중')

      try {
        console.log('[MobileFAB] Gemini API 호출 시작:', {
          transcriptLength: finalTranscript.length,
          transcriptPreview: finalTranscript.substring(0, 100) + '...',
          timestamp: new Date().toISOString()
        })

        const result = await summarizeMeeting(finalTranscript)
        removeTask(taskId)

        console.log('[MobileFAB] Gemini API 응답 성공:', {
          hasSummary: !!result.summary,
          agendaCount: result.agenda ? result.agenda.length : 0,
          decisionsCount: result.decisions ? result.decisions.length : 0,
          hasNextMeeting: !!result.nextMeeting,
          timestamp: new Date().toISOString()
        })

        // result 검증 및 안전한 파싱
        const safeResult = {
          summary: (result && typeof result.summary === 'string') ? result.summary : '회의록 요약',
          agenda: (Array.isArray(result?.agenda)) ? result.agenda : [],
          decisions: (Array.isArray(result?.decisions)) ? result.decisions : [],
          nextMeeting: (result?.nextMeeting && typeof result.nextMeeting === 'object') ? result.nextMeeting : null
        }

        const meetingDescription = `[회의록]\n\n${safeResult.summary}\n\n[주요 안건]\n${safeResult.agenda.length > 0 ? safeResult.agenda.map((a, i) => `${i + 1}. ${a}`).join('\n') : '없음'}\n\n[결정 사항]\n${safeResult.decisions.length > 0 ? safeResult.decisions.map((d, i) => `${i + 1}. ${d}`).join('\n') : '없음'}${safeResult.nextMeeting?.date ? `\n\n[다음 회의]\n날짜: ${safeResult.nextMeeting.date}${safeResult.nextMeeting.time ? ` ${safeResult.nextMeeting.time}` : ''}${safeResult.nextMeeting.topic ? `\n주제: ${safeResult.nextMeeting.topic}` : ''}` : ''}`

        let parsedMeetingDate = safeResult.nextMeeting?.date || new Date().toISOString().split('T')[0]
        if (!parsedMeetingDate || !/^\d{4}-\d{2}-\d{2}$/.test(parsedMeetingDate)) {
          parsedMeetingDate = new Date().toISOString().split('T')[0]
        }

        const activityData = {
          type: '미팅',
          activity_date: parsedMeetingDate,
          description: meetingDescription,
          status: '완료',
        }

        console.log('[MobileFAB] 활동 내역 저장 시작:', {
          activityDate: parsedMeetingDate,
          descriptionLength: meetingDescription.length,
          hasNextMeeting: !!safeResult.nextMeeting,
          timestamp: new Date().toISOString()
        })

        await addActivity(activityData)
        
        console.log('[MobileFAB] 활동 내역 저장 성공')

        if (safeResult.nextMeeting?.date && /^\d{4}-\d{2}-\d{2}$/.test(safeResult.nextMeeting.date)) {
          const nextActivityData = {
            type: '미팅',
            activity_date: safeResult.nextMeeting.date,
            description: `[다음 회의] ${safeResult.nextMeeting.topic || '일정 등록'}${safeResult.nextMeeting.time ? ` (${safeResult.nextMeeting.time})` : ''}`,
            status: '진행중',
          }

          await addActivity(nextActivityData)
          
          console.log('[MobileFAB] 다음 회의 일정 저장 성공:', {
            date: safeResult.nextMeeting.date,
            topic: safeResult.nextMeeting.topic
          })
          
          toast.success(`${safeResult.nextMeeting.date}${safeResult.nextMeeting.topic ? ` ${safeResult.nextMeeting.topic}` : ''} 미팅 일정이 달력에 등록되었습니다.`, {
            duration: 4000,
            icon: '📅'
          })
        }

        toast.success('회의록이 저장되었습니다.', {
          duration: 3000,
          icon: '✅'
        })
      } catch (error) {
        removeTask(taskId)
        console.error('[MobileFAB] 회의록 요약 오류:', {
          error: error.message,
          stack: error.stack,
          transcriptLength: finalTranscript.length,
          timestamp: new Date().toISOString()
        })
        toast.error('회의록 요약 중 오류가 발생했습니다. 원본 텍스트로 저장합니다.', {
          duration: 4000,
          icon: '❌'
        })
        
        // 요약 실패 시 원본 텍스트로 저장
        const activityData = {
          type: '미팅',
          activity_date: new Date().toISOString().split('T')[0],
          description: `[회의록]\n\n${finalTranscript}`,
          status: '완료',
        }
        await addActivity(activityData)
        toast.success('회의록이 원본 텍스트로 저장되었습니다.', {
          duration: 3000,
          icon: '📝'
        })
      } finally {
        setIsProcessing(false)
        setRecordingTranscript('')
        setRecordingTime(0)
        voiceService.clearAccumulatedTranscript()
      }
    } catch (error) {
      console.error('[MobileFAB] 녹음 종료 오류:', {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      })
      setIsRecording(false)
      setIsProcessing(false)
      releaseWakeLock()
    }
  }

  // 앱 설치 핸들러
  const handleInstallClick = async () => {
    setIsExpanded(false)
    
    if (deviceType === 'android' && deferredPrompt) {
      try {
        deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice
        
        if (outcome === 'accepted') {
          toast.success('앱 설치가 시작되었습니다.', { duration: 3000 })
        }
        
        setDeferredPrompt(null)
      } catch (error) {
        console.error('앱 설치 프롬프트 표시 실패:', error)
        setInstallModalOpen(true)
      }
    } else {
      setInstallModalOpen(true)
    }
  }

  // Web Speech API 지원 여부 확인
  const isSupported = voiceService.getSupported()

  // 모바일에서만 표시 (768px 이하)
  // 하단 탭바(h-16 = 4rem = 64px) + StatusBar(있을 경우 약 2.5rem = 40px) + 여유 공간(1rem = 16px)
  // 총 약 7.5rem (120px) 위에 배치
  return (
    <div className="fixed right-4 z-50 md:hidden" style={{ bottom: 'calc(4rem + 2.5rem + 1rem + env(safe-area-inset-bottom, 0px))' }}>
      {/* 확장된 버튼 그룹 */}
      {isExpanded && (
        <div className="flex flex-col items-end space-y-4 mb-4 animate-in slide-in-from-bottom-2 duration-200">
          {/* 앱 설치 버튼 (설치되지 않은 경우에만 표시) */}
          {!isStandalone && (
            <div className="relative">
              <button
                onClick={handleInstallClick}
                className="flex items-center justify-center w-16 h-16 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-full shadow-xl hover:shadow-2xl transition-all transform hover:scale-110 active:scale-95 touch-manipulation"
                style={{ WebkitTapHighlightColor: 'transparent' }}
                title="앱 설치"
              >
                <Smartphone className="w-8 h-8" />
              </button>
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-400 rounded-full animate-pulse"></div>
            </div>
          )}

          {/* 회의록 녹음 버튼 (큰 버튼) */}
          {isSupported && (
            <button
              onClick={isRecording ? handleStopRecording : handleStartRecording}
              disabled={isProcessing || isListening}
              className={`
                flex items-center justify-center w-16 h-16 rounded-full shadow-xl hover:shadow-2xl transition-all transform hover:scale-110 active:scale-95 touch-manipulation font-semibold text-sm
                ${isRecording 
                  ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' 
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
                }
                ${(isProcessing || isListening) ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              style={{ WebkitTapHighlightColor: 'transparent' }}
              title={isRecording ? `녹음 중... ${formatTime(recordingTime)}` : '회의록 녹음'}
            >
              {isProcessing ? (
                <Loader2 className="w-8 h-8 animate-spin" />
              ) : isRecording ? (
                <div className="flex flex-col items-center">
                  <Square className="w-6 h-6 mb-1" />
                  <span className="text-xs font-bold">{formatTime(recordingTime)}</span>
                </div>
              ) : (
                <Mic className="w-8 h-8" />
              )}
            </button>
          )}

          {/* 음성 명령 버튼 (큰 버튼) */}
          {isSupported && (
            <button
              onClick={isListening ? handleStopListening : handleStartListening}
              disabled={isProcessing || isRecording}
              className={`
                flex items-center justify-center w-16 h-16 rounded-full shadow-xl hover:shadow-2xl transition-all transform hover:scale-110 active:scale-95 touch-manipulation
                ${isListening 
                  ? 'bg-red-500 hover:bg-red-600 text-white' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
                }
                ${(isProcessing || isRecording) ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              style={{ WebkitTapHighlightColor: 'transparent' }}
              title={isListening ? '음성 명령 완료' : '음성 명령'}
            >
              {isProcessing ? (
                <Loader2 className="w-8 h-8 animate-spin" />
              ) : (
                <Mic className="w-8 h-8" />
              )}
            </button>
          )}
        </div>
      )}

      {/* 메인 FAB 버튼 (운전 중에도 누르기 편하게 크게) */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          flex items-center justify-center w-16 h-16 rounded-full shadow-xl hover:shadow-2xl transition-all transform hover:scale-110 active:scale-95 touch-manipulation
          ${isExpanded || isListening || isRecording
            ? 'bg-red-500 hover:bg-red-600' 
            : 'bg-brand-blue hover:bg-blue-700'
          }
        `}
        style={{ WebkitTapHighlightColor: 'transparent' }}
        title={isExpanded ? '닫기' : isListening || isRecording ? '기능 사용 중' : '빠른 메뉴'}
      >
        {isProcessing ? (
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        ) : isExpanded ? (
          <X className="w-8 h-8 text-white" />
        ) : isListening || isRecording ? (
          <Square className="w-8 h-8 text-white" />
        ) : (
          <Mic className="w-8 h-8 text-white" />
        )}
      </button>

      {/* 앱 설치 안내 모달 */}
      {!isStandalone && (
        <Modal
          isOpen={installModalOpen}
          onClose={() => setInstallModalOpen(false)}
          title="앱으로 설치하기"
          size="md"
        >
          <div className="space-y-4">
            {deviceType === 'ios' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-bold text-blue-900 mb-2">아이폰에서 설치하기</h3>
                <ol className="space-y-2 text-sm text-blue-800">
                  <li>1. 화면 하단의 <strong>공유 버튼(↑)</strong>을 누르세요</li>
                  <li>2. 스크롤하여 <strong>"홈 화면에 추가"</strong>를 선택하세요</li>
                  <li>3. 오른쪽 상단의 <strong>"추가"</strong> 버튼을 눌러 설치를 완료하세요</li>
                </ol>
              </div>
            )}

            {deviceType === 'android' && !deferredPrompt && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h3 className="font-bold text-amber-900 mb-2">안드로이드에서 설치하기</h3>
                <ol className="space-y-2 text-sm text-amber-800">
                  <li>1. 브라우저 상단의 <strong>메뉴 버튼(⋮)</strong>을 누르세요</li>
                  <li>2. <strong>"앱 설치"</strong> 또는 <strong>"홈 화면에 추가"</strong>를 선택하세요</li>
                  <li>3. 확인 버튼을 눌러 설치를 완료하세요</li>
                </ol>
              </div>
            )}

            <div className="flex justify-end pt-4 border-t border-gray-200">
              <button
                onClick={() => setInstallModalOpen(false)}
                className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium touch-manipulation min-h-[44px]"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                닫기
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default MobileFAB
