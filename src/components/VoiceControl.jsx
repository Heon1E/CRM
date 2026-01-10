import React, { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Square, Loader2 } from 'lucide-react'
import voiceService from '../services/VoiceService'
import { classifyVoiceIntent } from '../utils/voiceAssistant'
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
  const handleStartListening = () => {
    if (!voiceService.getSupported()) {
      toast.error('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge 브라우저를 사용해주세요.', {
        duration: 6000,
        icon: '⚠️'
      })
      return
    }

    try {
      setTranscript('')
      setIsListening(true)
      setIsRecording(false)
      isListeningRef.current = true
      isRecordingRef.current = false

      voiceService.startListening(
        (finalTranscript, interimTranscript) => {
          if (isListeningRef.current) {
            setTranscript((prev) => {
              const currentFinal = prev.split('|')[0]?.trim() || ''
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
          
          let errorMessage = '음성 인식 중 오류가 발생했습니다.'
          if (error === 'not-allowed') {
            errorMessage = '마이크 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요.'
          } else if (error === 'no-speech') {
            errorMessage = '음성이 감지되지 않았습니다. 다시 시도해주세요.'
          }
          
          toast.error(errorMessage, { duration: 5000, icon: '⚠️' })
        },
        () => {
          // 종료 콜백 (자동 재시작은 VoiceService에서 처리)
        }
      )

      toast.success('음성 명령을 듣고 있습니다...', { duration: 2000, icon: '🎤' })
    } catch (error) {
      console.error('음성 인식 시작 오류:', error)
      setIsListening(false)
      isListeningRef.current = false
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

      // transcript에서 최종 텍스트만 추출 (| 구분자 제거)
      const finalTranscript = transcript.split('|')[0].trim() || transcript.trim()

      if (!finalTranscript) {
        toast.warning('음성이 인식되지 않았습니다.', { duration: 2000, icon: '⚠️' })
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
  const handleStartRecording = () => {
    if (!voiceService.getSupported()) {
      toast.error('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge 브라우저를 사용해주세요.', {
        duration: 6000,
        icon: '⚠️'
      })
      return
    }

    try {
      setRecordingTranscript('')
      setRecordingTime(0)
      setIsRecording(true)
      setIsListening(false)
      isRecordingRef.current = true
      isListeningRef.current = false

      voiceService.startListening(
        (finalTranscript, interimTranscript) => {
          if (isRecordingRef.current) {
            setRecordingTranscript(prev => {
              const current = prev.trim()
              const newText = finalTranscript + (interimTranscript ? ' ' + interimTranscript : '')
              return current && newText ? `${current} ${newText}`.trim() : (newText || current)
            })
          }
        },
        (error) => {
          setIsRecording(false)
          isRecordingRef.current = false
          
          let errorMessage = '음성 인식 중 오류가 발생했습니다.'
          if (error === 'not-allowed') {
            errorMessage = '마이크 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요.'
          } else if (error === 'no-speech') {
            errorMessage = '음성이 감지되지 않았습니다. 다시 시도해주세요.'
          }
          
          toast.error(errorMessage, { duration: 5000, icon: '⚠️' })
        },
        () => {
          // 종료 콜백
        }
      )

      toast.success('회의록 녹음을 시작했습니다. 종료 시 자동으로 요약됩니다.', {
        duration: 3000,
        icon: '🎙️'
      })
    } catch (error) {
      console.error('녹음 시작 오류:', error)
      setIsRecording(false)
      isRecordingRef.current = false
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

      if (!recordingTranscript.trim()) {
        toast.warning('녹음된 내용이 없습니다.', { duration: 2000, icon: '⚠️' })
        return
      }

      // 백그라운드에서 회의록 요약
      setIsProcessing(true)
      const taskId = `meeting_summary_${Date.now()}`
      addTask(taskId, '회의록 요약 중')

      try {
        const result = await classifyVoiceIntent(recordingTranscript)
        removeTask(taskId)

        // 회의록 저장 로직 (meeting intent 처리와 동일)
        if (result.intent === 'meeting' && result.data) {
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
        } else {
          // meeting intent가 아니면 일반 메모로 저장
          const activityData = {
            type: '미팅',
            activity_date: new Date().toISOString().split('T')[0],
            description: `[회의록]\n\n${recordingTranscript}`,
            status: '완료',
          }

          await addActivity(activityData)
          toast.success('회의록이 저장되었습니다.', {
            duration: 3000,
            icon: '✅'
          })
        }
      } catch (error) {
        removeTask(taskId)
        console.error('회의록 요약 오류:', error)
        toast.error('회의록 요약 중 오류가 발생했습니다.', {
          duration: 4000,
          icon: '❌'
        })
      } finally {
        setIsProcessing(false)
        setRecordingTranscript('')
        setRecordingTime(0)
      }
    } catch (error) {
      console.error('녹음 종료 오류:', error)
      setIsRecording(false)
      setIsProcessing(false)
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
          className="flex items-center space-x-2 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors text-sm font-medium touch-manipulation min-h-[44px]"
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
              <span className="hidden sm:inline">{formatTime(recordingTime)}</span>
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
          <MicOff className="w-4 h-4" />
          <span className="hidden sm:inline">녹음</span>
        </button>
      )}
    </div>
  )
}

export default VoiceControl
