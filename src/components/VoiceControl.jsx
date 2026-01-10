import React, { useState, useEffect } from 'react'
import voiceService from '../services/VoiceService'
import { processVoiceCommand } from '../utils/voiceAssistant'
import { useData } from '../contexts/DataContext'
import { Mic } from 'lucide-react'
import toast from 'react-hot-toast'

/**
 * 음성 제어 컴포넌트 (단발성 AI 음성 명령)
 * 마이크 버튼을 클릭하여 음성 인식을 시작하고, Gemini AI로 명령을 처리
 */
const VoiceControl = () => {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const { addActivity } = useData()

  // 음성 인식 지원 여부 확인
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRecognition) {
      if (!voiceService.recognition && voiceService.initRecognition) {
        voiceService.initRecognition()
      }
      setIsSupported(true)
    } else {
      setIsSupported(false)
    }
  }, [])

  // 음성 명령 처리 함수
  const handleVoiceCommand = async (transcript) => {
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

    } catch (error) {
      console.error('[VoiceControl] 음성 명령 처리 오류:', error)
      toast.error('음성 명령 처리 중 오류가 발생했습니다.', {
        duration: 4000,
        icon: '❌'
      })
    } finally {
      setIsProcessing(false)
    }
  }

  // 음성 인식 시작/중지 토글
  const toggleListening = async () => {
    if (isListening) {
      // 중지: 현재까지 인식된 텍스트 처리
      voiceService.stopListening()
      const finalText = voiceService.getFinalTranscript()
      setIsListening(false)
      
      if (finalText && finalText.trim().length > 0) {
        await handleVoiceCommand(finalText)
      } else {
        toast.warning('인식된 내용이 없습니다.', {
          duration: 2000,
          icon: '⚠️'
        })
      }
    } else {
      // 시작
      try {
        await voiceService.startListening(
          (final, interim) => {
            // 결과 콜백 (실시간 표시는 선택사항)
            if (final) {
              console.log('[VoiceControl] 최종 인식:', final)
            }
          },
          (error) => {
            // 에러 콜백
            console.error('[VoiceControl] 음성 인식 에러:', error)
            setIsListening(false)
            
            if (error === 'not-allowed') {
              toast.error('마이크 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요.', {
                duration: 5000,
                icon: '⚠️'
              })
            } else if (error === 'not-supported') {
              toast.error('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge 브라우저를 사용해주세요.', {
                duration: 5000,
                icon: '⚠️'
              })
            }
          },
          async () => {
            // 종료 콜백: 자동으로 인식 종료 시 처리
            console.log('[VoiceControl] 음성 인식 자동 종료')
            setIsListening(false)
            
            const finalText = voiceService.getFinalTranscript()
            if (finalText && finalText.trim().length > 0) {
              await handleVoiceCommand(finalText)
            }
          }
        )
        setIsListening(true)
        toast.success('음성 명령을 듣고 있습니다...', {
          duration: 2000,
          icon: '🎤'
        })
      } catch (error) {
        console.error('[VoiceControl] 마이크 실행 실패:', error)
        setIsListening(false)
        toast.error('마이크 실행 실패: ' + (error.message || '알 수 없는 오류'), {
          duration: 3000,
          icon: '❌'
        })
      }
    }
  }

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
