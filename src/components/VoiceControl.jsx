import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSpeechToText } from '../hooks/useSpeechToText'
import { processVoiceCommand } from '../utils/voiceAssistant'
import { useData } from '../contexts/DataContext'
import { Mic } from 'lucide-react'
import toast from 'react-hot-toast'

/**
 * 음성 제어 컴포넌트 (연속 듣기 모드 AI 음성 명령)
 * 마이크 버튼을 클릭하여 음성 인식을 시작하고, 멈춤 버튼을 누르기 전까지 계속 듣기
 * Gemini AI로 명령을 처리
 */
const VoiceControl = () => {
  const [isProcessing, setIsProcessing] = useState(false)
  const { addActivity } = useData()
  const resetTranscriptRef = useRef(null)

  // 음성 명령 처리 함수 (useCallback으로 메모이제이션)
  const handleVoiceCommand = useCallback(async (transcript, resetTranscript) => {
    if (!transcript || transcript.trim().length < 3) {
      toast.warning('음성이 인식되지 않았습니다. 다시 시도해주세요.', {
        duration: 2000,
        icon: '⚠️'
      })
      return
    }

    setIsProcessing(true)

    try {
      // Gemini AI로 명령 분석
      const result = await processVoiceCommand(transcript)
      
      // 날짜 검증 및 변환
      let activityDate = result.data.date
      if (!activityDate || !/^\d{4}-\d{2}-\d{2}$/.test(activityDate)) {
        activityDate = new Date().toISOString().split('T')[0]
      }

      // 활동 내역 데이터 구성
      const activityData = {
        type: result.data.type || '미팅',
        activity_date: activityDate,
        description: result.data.description || transcript,
        clientName: result.data.clientName || '',
        status: '진행중',
      }

      // DB에 저장
      await addActivity(activityData)

      // 성공 메시지
      const clientInfo = result.data.clientName ? ` (${result.data.clientName})` : ''
      toast.success(`${result.data.title || '음성 명령'}${clientInfo}이 등록되었습니다.`, {
        duration: 3000,
        icon: '✅'
      })

      // 텍스트 초기화 (다음 음성 명령을 위해)
      if (resetTranscript) {
        resetTranscript()
      }

    } catch (error) {
      console.error('[VoiceControl] 음성 명령 처리 오류:', error)
      toast.error('음성 명령 처리 중 오류가 발생했습니다.', {
        duration: 4000,
        icon: '❌'
      })
    } finally {
      setIsProcessing(false)
    }
  }, [addActivity])

  // 음성 인식 훅 사용 (연속 듣기 모드)
  const {
    isListening,
    transcript,
    interimTranscript,
    isSupported,
    error,
    startListening,
    stopListening,
    resetTranscript
  } = useSpeechToText({
    continuous: true, // ⚠️ 핵심: 멈춤 버튼 누르기 전까지 계속 듣기
    interimResults: true, // 말하는 도중에도 텍스트 표시
    lang: 'ko-KR', // 한국어 고정
    onResult: (final, interim, full) => {
      // 실시간 결과 업데이트 (선택사항: 필요시 UI에 표시 가능)
      if (final) {
        console.log('[VoiceControl] 누적 인식:', final)
      }
      if (interim) {
        console.log('[VoiceControl] 중간 인식:', interim)
      }
    },
    onError: (errorType, errorMessage) => {
      // 에러 처리
      console.error('[VoiceControl] 음성 인식 에러:', errorType, errorMessage)
      
      if (errorType === 'not-allowed') {
        toast.error('마이크 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요.', {
          duration: 5000,
          icon: '⚠️'
        })
      } else if (errorType === 'not-supported') {
        toast.error('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge 브라우저를 사용해주세요.', {
          duration: 5000,
          icon: '⚠️'
        })
      } else if (errorType !== 'no-speech') {
        // 침묵(no-speech)은 continuous 모드에서는 에러가 아니므로 무시
        toast.error(errorMessage || '음성 인식 중 오류가 발생했습니다.', {
          duration: 4000,
          icon: '❌'
        })
      }
    },
    onEnd: async (finalTranscript) => {
      // 사용자가 직접 중지한 경우에만 처리
      if (finalTranscript && finalTranscript.trim().length > 0) {
        await handleVoiceCommand(finalTranscript, resetTranscript)
      }
    }
  })

  // resetTranscript 참조 저장 (onEnd 콜백에서 사용하기 위해)
  resetTranscriptRef.current = resetTranscript

  // 에러 상태 감지
  useEffect(() => {
    if (error && error !== 'no-speech') {
      // 에러는 onError 콜백에서 이미 처리되므로 여기서는 추가 처리 없음
    }
  }, [error])

  // 음성 인식 시작/중지 토글
  const toggleListening = useCallback(async () => {
    if (isListening) {
      // 중지: 현재까지 인식된 텍스트 처리
      stopListening()
      
      // stopListening 내부에서 onEnd 콜백이 호출되어 handleVoiceCommand가 실행됨
      // 여기서는 추가 처리 불필요
    } else {
      // 시작
      const success = await startListening()
      
      if (success) {
        toast.success('음성 명령을 듣고 있습니다... (멈추려면 버튼을 다시 누르세요)', {
          duration: 3000,
          icon: '🎤'
        })
      } else {
        // startListening 내부에서 이미 에러 처리됨
      }
    }
  }, [isListening, startListening, stopListening])

  // 지원하지 않는 브라우저에서는 아무것도 렌더링하지 않음
  if (!isSupported) {
    return null
  }

  return (
    <button
      onClick={toggleListening}
      disabled={isProcessing}
      className={`
        p-3 rounded-full transition-all duration-300 flex items-center justify-center touch-manipulation min-h-[44px] min-w-[44px]
        ${isListening 
          ? 'bg-blue-500 text-white animate-pulse ring-2 ring-blue-400 shadow-lg' 
          : isProcessing
          ? 'bg-blue-300 text-white opacity-75'
          : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
        }
      `}
      style={{ WebkitTapHighlightColor: 'transparent' }}
      aria-label={isListening ? '음성 인식 중지' : '음성 명령 시작'}
      title={isListening ? '음성 인식 중지' : '음성 명령 시작'}
    >
      {isProcessing ? (
        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
      ) : (
        <Mic className="w-5 h-5" />
      )}
    </button>
  )
}

export default VoiceControl
