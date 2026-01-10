import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, MicOff, Square, Loader2, X } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useBackgroundTask } from '../contexts/BackgroundTaskContext'
import { analyzeVoiceCommand, summarizeMeeting } from '../utils/voiceAssistant'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

/**
 * 음성 지능 비서 컴포넌트
 * 음성 명령 및 회의록 녹음 기능 제공
 */
const VoiceAssistant = () => {
  const { addActivity, clients } = useData()
  const { addTask, removeTask } = useBackgroundTask()
  const navigate = useNavigate()
  
  const [isListening, setIsListening] = useState(false) // 음성 명령 모드
  const [isRecording, setIsRecording] = useState(false) // 회의록 녹음 모드
  const [transcript, setTranscript] = useState('')
  const [recordingTranscript, setRecordingTranscript] = useState('')
  const [recordingTime, setRecordingTime] = useState(0) // 녹음 시간 (초)
  const [isProcessing, setIsProcessing] = useState(false)

  const recognitionRef = useRef(null)
  const recordingIntervalRef = useRef(null)

  // Web Speech API 초기화
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      
      recognitionRef.current.continuous = true // 연속 인식
      recognitionRef.current.interimResults = true // 중간 결과 표시
      recognitionRef.current.lang = 'ko-KR' // 한국어

      recognitionRef.current.onresult = (event) => {
        let interimTranscript = ''
        let finalTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' '
          } else {
            interimTranscript += transcript
          }
        }

        // ref를 통해 현재 상태 확인 (클로저 문제 해결)
        if (isRecordingRef.current) {
          // 회의록 녹음 모드: 모든 텍스트 누적
          setRecordingTranscript(prev => {
            const current = prev.trim()
            const newFinal = finalTranscript.trim()
            const newText = newFinal + (interimTranscript ? ' ' + interimTranscript : '')
            return current && newText ? `${current} ${newText}`.trim() : (newText || current)
          })
        } else if (isListeningRef.current) {
          // 음성 명령 모드: 실시간 업데이트 (최종 텍스트만 유지)
          setTranscript((prev) => {
            const currentFinal = prev.split('|')[0]?.trim() || ''
            const newFinal = finalTranscript.trim()
            const combinedFinal = currentFinal && newFinal ? `${currentFinal} ${newFinal}`.trim() : (newFinal || currentFinal)
            return interimTranscript ? `${combinedFinal}|${interimTranscript}` : combinedFinal
          })
        }
      }

      recognitionRef.current.onerror = (event) => {
        console.error('음성 인식 오류:', event.error)
        setIsListening(false)
        setIsRecording(false)
        isListeningRef.current = false
        isRecordingRef.current = false
        
        let errorMessage = '음성 인식 중 오류가 발생했습니다.'
        if (event.error === 'not-allowed') {
          errorMessage = '마이크 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요.'
        } else if (event.error === 'no-speech') {
          errorMessage = '음성이 감지되지 않았습니다. 다시 시도해주세요.'
        }
        
        toast.error(errorMessage, { duration: 5000, icon: '⚠️' })
      }

      recognitionRef.current.onend = () => {
        // 연속 모드이므로 상태가 유지되는 경우 자동 재시작
        // ref를 통해 현재 상태 확인
        setTimeout(() => {
          if ((isListeningRef.current || isRecordingRef.current) && recognitionRef.current) {
            try {
              recognitionRef.current.start()
            } catch (error) {
              // 이미 실행 중이거나 오류 발생 시 무시
              console.error('음성 인식 자동 재시작 실패:', error)
            }
          }
        }, 100)
      }
    } else {
      toast.error('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge 브라우저를 사용해주세요.', {
        duration: 6000,
        icon: '⚠️'
      })
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch (error) {
          // 이미 중지되었거나 오류 발생 시 무시
        }
      }
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current)
      }
    }
  }, []) // 한 번만 초기화

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

  // 음성 명령 시작
  const handleStartListening = () => {
    if (!recognitionRef.current) {
      toast.error('음성 인식을 사용할 수 없습니다.', { duration: 3000, icon: '⚠️' })
      return
    }

    try {
      setTranscript('')
      setIsListening(true)
      setIsRecording(false)
      isListeningRef.current = true
      isRecordingRef.current = false
      recognitionRef.current.start()
      toast.success('음성 명령을 듣고 있습니다...', { duration: 2000, icon: '🎤' })
    } catch (error) {
      console.error('음성 인식 시작 오류:', error)
      setIsListening(false)
      isListeningRef.current = false
      toast.error('음성 인식을 시작할 수 없습니다.', { duration: 3000, icon: '❌' })
    }
  }

  // 음성 명령 종료 및 처리
  const handleStopListening = useCallback(async () => {
    if (!recognitionRef.current || !isListening) return

    try {
      recognitionRef.current.stop()
      setIsListening(false)
      isListeningRef.current = false

      // transcript에서 최종 텍스트만 추출 (| 구분자 제거)
      const finalTranscript = transcript.split('|')[0].trim() || transcript.trim()

      if (!finalTranscript) {
        toast.warning('음성이 인식되지 않았습니다.', { duration: 2000, icon: '⚠️' })
        return
      }

      // 백그라운드에서 명령 분석
      setIsProcessing(true)
      const taskId = `voice_command_${Date.now()}`
      addTask(taskId, '음성 명령 처리')

      try {
        const command = await analyzeVoiceCommand(finalTranscript)
        removeTask(taskId)

        if (command.type === 'schedule') {
          // 일정 등록
          // 날짜 파싱: 오늘, 내일, 다음주 월요일 등을 실제 날짜로 변환
          let parsedDate = command.data.date
          if (!parsedDate || !/^\d{4}-\d{2}-\d{2}$/.test(parsedDate)) {
            // 날짜 파싱 실패 시 오늘 날짜 사용
            parsedDate = new Date().toISOString().split('T')[0]
          }

          const activityData = {
            type: command.data.type || '미팅',
            activity_date: parsedDate,
            description: `${command.data.title || '음성 명령으로 등록'}${command.data.description ? '\n' + command.data.description : ''}`,
            clientName: command.data.clientName || '',
            status: '진행중',
          }

          await addActivity(activityData)
          
          const clientInfo = command.data.clientName ? ` (${command.data.clientName})` : ''
          toast.success(`${command.data.title || '일정'}${clientInfo}이 등록되었습니다.`, {
            duration: 3000,
            icon: '✅'
          })
        } else if (command.type === 'query') {
          // 데이터 조회 화면으로 이동
          const queryType = command.data.queryType || 'activities'
          const searchTerm = command.data.searchTerm || ''
          
          if (queryType === 'activities') {
            navigate('/activities' + (searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ''))
          } else if (queryType === 'clients') {
            navigate('/clients' + (searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ''))
          } else if (queryType === 'sales') {
            navigate('/sales')
          } else if (queryType === 'issues') {
            navigate('/activities?status=진행중') // Issues는 Activities에 통합됨
          }
          
          toast.success(`"${command.action}" 결과를 확인하세요.`, {
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
  }, [isListening, transcript, addActivity, navigate, addTask, removeTask])

  // 회의록 녹음 시작
  const handleStartRecording = () => {
    if (!recognitionRef.current) {
      toast.error('음성 인식을 사용할 수 없습니다.', { duration: 3000, icon: '⚠️' })
      return
    }

    try {
      setRecordingTranscript('')
      setRecordingTime(0)
      setIsRecording(true)
      setIsListening(false)
      isRecordingRef.current = true
      isListeningRef.current = false
      recognitionRef.current.start()
      toast.success('회의록 녹음을 시작했습니다. 종료 시 자동으로 요약됩니다.', {
        duration: 3000,
        icon: '🎙️'
      })
    } catch (error) {
      console.error('녹음 시작 오류:', error)
      setIsRecording(false)
      isRecordingRef.current = false
      toast.error('녹음을 시작할 수 없습니다.', { duration: 3000, icon: '❌' })
    }
  }

  // 회의록 녹음 종료 및 요약
  const handleStopRecording = useCallback(async () => {
    if (!recognitionRef.current || !isRecording) return

    try {
      recognitionRef.current.stop()
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
        const summary = await summarizeMeeting(recordingTranscript)
        removeTask(taskId)

        // 활동 내역에 회의록 저장 (태그: 회의록 포함)
        const meetingDescription = `[회의록]\n\n${summary.summary || '회의록 요약'}\n\n[주요 안건]\n${(summary.agenda || []).length > 0 ? summary.agenda.map((a, i) => `${i + 1}. ${a}`).join('\n') : '없음'}\n\n[결정 사항]\n${(summary.decisions || []).length > 0 ? summary.decisions.map((d, i) => `${i + 1}. ${d}`).join('\n') : '없음'}${summary.nextMeeting?.date ? `\n\n[다음 회의]\n날짜: ${summary.nextMeeting.date}${summary.nextMeeting.time ? ` ${summary.nextMeeting.time}` : ''}${summary.nextMeeting.topic ? `\n주제: ${summary.nextMeeting.topic}` : ''}` : ''}`

        // 날짜 파싱 (오늘 날짜로 기본 설정)
        let parsedMeetingDate = summary.nextMeeting?.date || new Date().toISOString().split('T')[0]
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

        // 다음 회의 일정이 있으면 별도 일정으로도 등록 (달력에 추가)
        if (summary.nextMeeting?.date && /^\d{4}-\d{2}-\d{2}$/.test(summary.nextMeeting.date)) {
          const nextActivityData = {
            type: '미팅',
            activity_date: summary.nextMeeting.date,
            description: `[다음 회의] ${summary.nextMeeting.topic || '일정 등록'}${summary.nextMeeting.time ? ` (${summary.nextMeeting.time})` : ''}`,
            status: '진행중',
          }

          await addActivity(nextActivityData)
          
          toast.success(`${summary.nextMeeting.date}${summary.nextMeeting.topic ? ` ${summary.nextMeeting.topic}` : ''} 미팅 일정이 달력에 등록되었습니다.`, {
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
  }, [isRecording, recordingTranscript, addActivity, addTask, removeTask])

  // 시간 포맷팅 (초 -> MM:SS)
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  // Web Speech API 지원 여부 확인
  const isSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window

  if (!isSupported) {
    return null // 지원하지 않는 브라우저에서는 표시하지 않음
  }

  return (
    <div className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-50 flex flex-col items-end space-y-2">
      {/* 음성 명령 버튼 */}
      <div className="flex flex-col items-end space-y-2">
        {isListening && (
          <div className="bg-white rounded-lg shadow-lg p-3 max-w-xs border border-gray-200">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-semibold text-gray-700">음성 명령 중...</span>
            </div>
            {transcript && (
              <p className="text-xs text-gray-600 mb-2 break-words">{transcript}</p>
            )}
            <button
              onClick={handleStopListening}
              className="w-full px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium touch-manipulation min-h-[44px]"
              style={{ WebkitTapHighlightColor: 'transparent' }}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 inline animate-spin mr-2" />
                  처리 중...
                </>
              ) : (
                <>
                  <Square className="w-4 h-4 inline mr-2" />
                  명령 완료
                </>
              )}
            </button>
          </div>
        )}

        {!isListening && !isRecording && (
          <button
            onClick={handleStartListening}
            className="w-14 h-14 md:w-16 md:h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-110 touch-manipulation"
            style={{ WebkitTapHighlightColor: 'transparent' }}
            title="음성 명령 시작"
          >
            <Mic className="w-6 h-6 md:w-7 md:h-7" />
          </button>
        )}
      </div>

      {/* 회의록 녹음 버튼 */}
      <div className="flex flex-col items-end space-y-2">
        {isRecording && (
          <div className="bg-white rounded-lg shadow-lg p-3 max-w-xs border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-semibold text-gray-700">녹음 중...</span>
              </div>
              <span className="text-sm font-mono text-gray-600">{formatTime(recordingTime)}</span>
            </div>
            {recordingTranscript && (
              <div className="max-h-32 overflow-y-auto mb-2">
                <p className="text-xs text-gray-600 break-words">{recordingTranscript}</p>
              </div>
            )}
            <button
              onClick={handleStopRecording}
              className="w-full px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium touch-manipulation min-h-[44px]"
              style={{ WebkitTapHighlightColor: 'transparent' }}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 inline animate-spin mr-2" />
                  요약 중...
                </>
              ) : (
                <>
                  <Square className="w-4 h-4 inline mr-2" />
                  녹음 종료 및 저장
                </>
              )}
            </button>
          </div>
        )}

        {!isRecording && !isListening && (
          <button
            onClick={handleStartRecording}
            className="w-14 h-14 md:w-16 md:h-16 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-110 touch-manipulation"
            style={{ WebkitTapHighlightColor: 'transparent' }}
            title="회의록 녹음 시작"
          >
            <MicOff className="w-6 h-6 md:w-7 md:h-7" />
          </button>
        )}
      </div>
    </div>
  )
}

export default VoiceAssistant
