import React, { useState, useEffect, useRef } from 'react'
import { Mic, Square, Loader2 } from 'lucide-react'
import voiceService from '../services/VoiceService'
import { classifyVoiceIntent, summarizeMeeting } from '../utils/voiceAssistant'
import { requestWakeLock, releaseWakeLock } from '../utils/wakeLock'
import { useData } from '../contexts/DataContext'
import { useBackgroundTask } from '../contexts/BackgroundTaskContext'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

/**
 * 음성 제어 컴포넌트 (대시보드 상단용)
 * 마이크 아이콘과 녹음 아이콘을 나란히 배치
 */
const VoiceControl = () => {
  const { addActivity } = useData()
  const { addTask, removeTask } = useBackgroundTask()
  const navigate = useNavigate()
  
  const [isListening, setIsListening] = useState(false) // 음성 명령 모드
  const [isRecording, setIsRecording] = useState(false) // 회의록 녹음 모드
  const [transcript, setTranscript] = useState('')
  const [recordingTranscript, setRecordingTranscript] = useState('')
  const [recordingTime, setRecordingTime] = useState(0) // 녹음 시간 (초)
  const [isProcessing, setIsProcessing] = useState(false)

  const recordingIntervalRef = useRef(null)
  const isListeningRef = useRef(false)
  const isRecordingRef = useRef(false)

  // ref와 state 동기화
  useEffect(() => {
    isListeningRef.current = isListening
  }, [isListening])

  useEffect(() => {
    isRecordingRef.current = isRecording
  }, [isRecording])

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

  // 시간 포맷팅 (초 -> MM:SS)
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  // 음성 명령 시작
  const handleStartListening = async () => {
    if (!voiceService.getSupported()) {
      toast.error('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge 브라우저를 사용해주세요.', {
        duration: 6000,
        icon: '⚠️'
      })
      return
    }

    try {
      // Wake Lock 요청 (화면 잠금 방지)
      await requestWakeLock()

      setTranscript('')
      voiceService.clearAccumulatedTranscript()
      setIsListening(true)
      setIsRecording(false)
      isListeningRef.current = true
      isRecordingRef.current = false

      voiceService.startListening(
        (finalTranscript, interimTranscript, accumulatedTranscript) => {
          if (isListeningRef.current) {
            // 누적된 텍스트를 사용하여 상태 업데이트
            setTranscript((prev) => {
              const currentFinal = accumulatedTranscript || prev.split('|')[0]?.trim() || ''
              const combinedFinal = currentFinal && finalTranscript 
                ? `${currentFinal} ${finalTranscript}`.trim() 
                : (finalTranscript || currentFinal)
              return interimTranscript ? `${combinedFinal}|${interimTranscript}` : combinedFinal
            })
          }
        },
        (error) => {
          setIsListening(false)
          isListeningRef.current = false
          releaseWakeLock() // Wake Lock 해제
          
          // 치명적 오류만 사용자에게 알림
          let errorMessage = null
          if (error === 'not-allowed') {
            errorMessage = '마이크 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요.'
          } else if (error === 'service-not-allowed') {
            errorMessage = '음성 인식 서비스를 사용할 수 없습니다.'
          } else if (error === 'aborted') {
            errorMessage = '음성 인식이 중단되었습니다.'
          }
          
          // 치명적 오류만 알림 표시 (일시적 오류는 자동 재시도)
          if (errorMessage) {
            toast.error(errorMessage, { duration: 5000, icon: '⚠️' })
          }
        },
        () => {
          // 종료 콜백 (자동 재시작은 VoiceService에서 처리)
          releaseWakeLock() // Wake Lock 해제
        },
        true // autoRestart: true (자동 재시작 활성화)
      )

      toast.success('음성 명령을 듣고 있습니다...', { duration: 2000, icon: '🎤' })
    } catch (error) {
      console.error('[VoiceControl] 음성 인식 시작 오류:', {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      })
      setIsListening(false)
      isListeningRef.current = false
      releaseWakeLock() // Wake Lock 해제
      toast.error(error.message || '음성 인식을 시작할 수 없습니다.', { duration: 3000, icon: '❌' })
    }
  }

  // 음성 명령 종료 및 처리
  const handleStopListening = async () => {
    if (!isListening) return

    try {
      voiceService.stopListening()
      setIsListening(false)
      isListeningRef.current = false
      releaseWakeLock() // Wake Lock 해제

      // 누적된 텍스트 가져오기 (VoiceService에서 관리)
      const accumulatedText = voiceService.getAccumulatedTranscript()
      const finalTranscript = accumulatedText || transcript.split('|')[0].trim() || transcript.trim()

      if (!finalTranscript || finalTranscript.length < 3) {
        toast.warning('음성이 인식되지 않았습니다. 다시 시도해주세요.', { duration: 2000, icon: '⚠️' })
        return
      }

      // 백그라운드에서 의도 분류 및 처리
      setIsProcessing(true)
      const taskId = `voice_command_${Date.now()}`
      addTask(taskId, '음성 명령 처리')

      try {
        const result = await classifyVoiceIntent(finalTranscript)
        removeTask(taskId)

        if (result.intent === 'schedule') {
          // 일정 등록
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
        } else if (result.intent === 'meeting') {
          // 회의록 요약 저장
          const meetingDescription = `[회의록]\n\n${result.data.summary || '회의록 요약'}\n\n[주요 안건]\n${(result.data.agenda || []).length > 0 ? result.data.agenda.map((a, i) => `${i + 1}. ${a}`).join('\n') : '없음'}\n\n[결정 사항]\n${(result.data.decisions || []).length > 0 ? result.data.decisions.map((d, i) => `${i + 1}. ${d}`).join('\n') : '없음'}${result.data.nextMeeting?.date ? `\n\n[다음 회의]\n날짜: ${result.data.nextMeeting.date}${result.data.nextMeeting.time ? ` ${result.data.nextMeeting.time}` : ''}${result.data.nextMeeting.topic ? `\n주제: ${result.data.nextMeeting.topic}` : ''}` : ''}`

          let parsedMeetingDate = result.data.nextMeeting?.date || new Date().toISOString().split('T')[0]
          if (!parsedMeetingDate || !/^\d{4}-\d{2}-\d{2}$/.test(parsedMeetingDate)) {
            parsedMeetingDate = new Date().toISOString().split('T')[0]
          }

          const activityData = {
            type: '미팅',
            activity_date: parsedMeetingDate,
            description: meetingDescription,
            status: '완료',
          }

          await addActivity(activityData)

          // 다음 회의 일정이 있으면 별도 일정으로도 등록
          if (result.data.nextMeeting?.date && /^\d{4}-\d{2}-\d{2}$/.test(result.data.nextMeeting.date)) {
            const nextActivityData = {
              type: '미팅',
              activity_date: result.data.nextMeeting.date,
              description: `[다음 회의] ${result.data.nextMeeting.topic || '일정 등록'}${result.data.nextMeeting.time ? ` (${result.data.nextMeeting.time})` : ''}`,
              status: '진행중',
            }

            await addActivity(nextActivityData)
            
            toast.success(`${result.data.nextMeeting.date}${result.data.nextMeeting.topic ? ` ${result.data.nextMeeting.topic}` : ''} 미팅 일정이 달력에 등록되었습니다.`, {
              duration: 4000,
              icon: '📅'
            })
          }

          toast.success('회의록이 저장되었습니다.', {
            duration: 3000,
            icon: '✅'
          })
        } else if (result.intent === 'note') {
          // 일반 메모 저장
          const activityData = {
            type: '이메일',
            activity_date: new Date().toISOString().split('T')[0],
            description: result.data.content || '음성 메모',
            status: '완료',
          }

          await addActivity(activityData)
          
          toast.success('메모가 저장되었습니다.', {
            duration: 3000,
            icon: '📝'
          })
        } else if (result.intent === 'query') {
          // 데이터 조회 화면으로 이동
          const queryType = result.data.queryType || 'activities'
          const searchTerm = result.data.searchTerm || ''
          
          if (queryType === 'activities') {
            navigate('/activities' + (searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ''))
          } else if (queryType === 'clients') {
            navigate('/clients' + (searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ''))
          } else if (queryType === 'sales') {
            navigate('/sales')
          } else if (queryType === 'issues') {
            navigate('/activities?status=진행중')
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
        console.error('음성 명령 처리 오류:', error)
        toast.error('음성 명령 처리 중 오류가 발생했습니다.', {
          duration: 4000,
          icon: '❌'
        })
      } finally {
        setIsProcessing(false)
        setTranscript('')
      }
    } catch (error) {
      console.error('음성 인식 종료 오류:', error)
      setIsListening(false)
      setIsProcessing(false)
    }
  }

  // 회의록 녹음 시작
  const handleStartRecording = async () => {
    if (!voiceService.getSupported()) {
      toast.error('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge 브라우저를 사용해주세요.', {
        duration: 6000,
        icon: '⚠️'
      })
      return
    }

    try {
      // Wake Lock 요청 (화면 잠금 방지)
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
            // 누적된 텍스트를 사용하여 상태 업데이트
            const current = accumulatedTranscript || recordingTranscript.trim()
            const newText = finalTranscript + (interimTranscript ? ' ' + interimTranscript : '')
            setRecordingTranscript(current && newText ? `${current} ${newText}`.trim() : (newText || current))
          }
        },
        (error) => {
          setIsRecording(false)
          isRecordingRef.current = false
          releaseWakeLock() // Wake Lock 해제
          
          console.error('[VoiceControl] 녹음 에러:', {
            error: error,
            type: typeof error,
            timestamp: new Date().toISOString()
          })
          
          // 치명적 오류만 사용자에게 알림
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
          // 종료 콜백 (자동 재시작은 VoiceService에서 처리)
          releaseWakeLock() // Wake Lock 해제
        },
        true // autoRestart: true (자동 재시작 활성화)
      ).catch((error) => {
        // startListening에서 throw된 에러 처리
        console.error('[VoiceControl] startListening 에러:', {
          error: error.message,
          name: error.name,
          stack: error.stack,
          timestamp: new Date().toISOString()
        })
        setIsRecording(false)
        isRecordingRef.current = false
        releaseWakeLock()
        throw error // 상위 catch로 전달
      })

      toast.success('회의록 녹음을 시작했습니다. 종료 시 자동으로 요약됩니다.', {
        duration: 3000,
        icon: '🎙️'
      })
    } catch (error) {
      console.error('[VoiceControl] 녹음 시작 오류:', {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      })
      setIsRecording(false)
      isRecordingRef.current = false
      releaseWakeLock() // Wake Lock 해제
      toast.error(error.message || '녹음을 시작할 수 없습니다.', { duration: 3000, icon: '❌' })
    }
  }

  // 회의록 녹음 종료 및 요약
  const handleStopRecording = async () => {
    if (!isRecording) return

    try {
      voiceService.stopListening()
      setIsRecording(false)
      isRecordingRef.current = false
      releaseWakeLock() // Wake Lock 해제

      // 누적된 텍스트 가져오기 (VoiceService에서 관리)
      const accumulatedText = voiceService.getAccumulatedTranscript()
      const finalTranscript = accumulatedText || recordingTranscript.trim()

      // transcript 로깅 (디버깅용)
      console.log('[VoiceControl] 녹음 종료 - Transcript 확인:', {
        accumulatedText: accumulatedText,
        recordingTranscript: recordingTranscript,
        finalTranscript: finalTranscript,
        length: finalTranscript ? finalTranscript.length : 0,
        isEmpty: !finalTranscript || finalTranscript.trim().length === 0,
        timestamp: new Date().toISOString()
      })

      // 텍스트 길이 검증 (너무 짧으면 API 호출하지 않음)
      if (!finalTranscript || finalTranscript.trim().length < 10) {
        console.warn('[VoiceControl] 녹음된 내용이 너무 짧음:', {
          length: finalTranscript ? finalTranscript.length : 0,
          content: finalTranscript ? finalTranscript.substring(0, 50) : '(empty)'
        })
        toast.warning('녹음된 내용이 너무 짧습니다. 최소 10자 이상의 내용이 필요합니다.', { 
          duration: 3000, 
          icon: '⚠️' 
        })
        return
      }

      // 백그라운드에서 회의록 요약
      setIsProcessing(true)
      const taskId = `meeting_summary_${Date.now()}`
      addTask(taskId, '회의록 요약 중')

      try {
        console.log('[VoiceControl] Gemini API 호출 시작:', {
          transcriptLength: finalTranscript.length,
          transcriptPreview: finalTranscript.substring(0, 100) + '...',
          timestamp: new Date().toISOString()
        })

        // summarizeMeeting 사용 (회의록 전용 요약 함수)
        const result = await summarizeMeeting(finalTranscript)
        removeTask(taskId)

        console.log('[VoiceControl] Gemini API 응답 성공:', {
          hasSummary: !!result.summary,
          agendaCount: result.agenda ? result.agenda.length : 0,
          decisionsCount: result.decisions ? result.decisions.length : 0,
          hasNextMeeting: !!result.nextMeeting,
          timestamp: new Date().toISOString()
        })

        // 회의록 저장 로직 (summarizeMeeting 결과 사용)
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

        console.log('[VoiceControl] 활동 내역 저장 시작:', {
          activityDate: parsedMeetingDate,
          descriptionLength: meetingDescription.length,
          hasNextMeeting: !!safeResult.nextMeeting,
          timestamp: new Date().toISOString()
        })

        await addActivity(activityData)
        
        console.log('[VoiceControl] 활동 내역 저장 성공')

        if (safeResult.nextMeeting?.date && /^\d{4}-\d{2}-\d{2}$/.test(safeResult.nextMeeting.date)) {
          const nextActivityData = {
            type: '미팅',
            activity_date: safeResult.nextMeeting.date,
            description: `[다음 회의] ${safeResult.nextMeeting.topic || '일정 등록'}${safeResult.nextMeeting.time ? ` (${safeResult.nextMeeting.time})` : ''}`,
            status: '진행중',
          }

          await addActivity(nextActivityData)
          
          console.log('[VoiceControl] 다음 회의 일정 저장 성공:', {
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
        console.error('[VoiceControl] 회의록 요약 오류:', {
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
      console.error('[VoiceControl] 녹음 종료 오류:', {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      })
      setIsRecording(false)
      setIsProcessing(false)
      releaseWakeLock() // Wake Lock 해제
    }
  }

  // Web Speech API 지원 여부 확인
  if (!voiceService.getSupported()) {
    return null // 지원하지 않는 브라우저에서는 표시하지 않음
  }

  return (
    <div className="flex items-center space-x-2">
      {/* 음성 명령 버튼 */}
      {isListening ? (
        <button
          onClick={handleStopListening}
          className="flex items-center space-x-2 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors text-sm font-medium touch-manipulation min-h-[44px]"
          style={{ WebkitTapHighlightColor: 'transparent' }}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="hidden sm:inline">처리 중...</span>
            </>
          ) : (
            <>
              <Square className="w-4 h-4" />
              <span className="hidden sm:inline">명령 완료</span>
            </>
          )}
        </button>
      ) : (
        <button
          onClick={handleStartListening}
          className="flex items-center space-x-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium touch-manipulation min-h-[44px]"
          style={{ WebkitTapHighlightColor: 'transparent' }}
          title="음성 명령 시작"
        >
          <Mic className="w-4 h-4" />
          <span className="hidden sm:inline">마이크</span>
        </button>
      )}

      {/* 회의록 녹음 버튼 */}
      {isRecording ? (
        <button
          onClick={handleStopRecording}
          className="flex items-center space-x-2 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all text-sm font-medium touch-manipulation min-h-[44px] animate-pulse"
          style={{ WebkitTapHighlightColor: 'transparent' }}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="hidden sm:inline">요약 중...</span>
            </>
          ) : (
            <>
              <Square className="w-4 h-4" />
              <span className="hidden sm:inline font-bold">녹음 중... {formatTime(recordingTime)}</span>
            </>
          )}
        </button>
      ) : (
        <button
          onClick={handleStartRecording}
          className="flex items-center space-x-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium touch-manipulation min-h-[44px]"
          style={{ WebkitTapHighlightColor: 'transparent' }}
          title="회의록 녹음 시작"
        >
          <Mic className="w-4 h-4" />
          <span className="hidden sm:inline">녹음</span>
        </button>
      )}
    </div>
  )
}

export default VoiceControl
