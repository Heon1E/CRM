import React, { useState, useEffect } from 'react'
import voiceService from '../services/VoiceService'
import { Mic, Circle } from 'lucide-react'

/**
 * 음성 제어 컴포넌트
 * 마이크 버튼을 클릭하여 음성 인식을 시작/중지하는 토글 기능
 */
const VoiceControl = () => {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)

  // 음성 인식 지원 여부 확인
  useEffect(() => {
    // SpeechRecognition API 지원 여부 확인
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRecognition) {
      // VoiceService 초기화 시도 (recognition 객체가 없으면)
      if (!voiceService.recognition && voiceService.initRecognition) {
        voiceService.initRecognition()
      }
      setIsSupported(true)
    } else {
      setIsSupported(false)
    }
  }, [])

  // 음성 인식 시작/중지 토글
  const toggleListening = async () => {
    if (isListening) {
      // 중지
      voiceService.stopListening()
      setIsListening(false)
    } else {
      // 시작
      try {
        await voiceService.startListening(
          (final, interim) => {
            // 결과 콜백
            if (final) {
              console.log('[VoiceControl] 최종 인식:', final)
            }
            if (interim) {
              console.log('[VoiceControl] 임시 인식:', interim)
            }
          },
          (error) => {
            // 에러 콜백
            console.error('[VoiceControl] 음성 인식 에러:', error)
            setIsListening(false)
            
            if (error === 'not-allowed') {
              alert('마이크 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요.')
            } else if (error === 'not-supported') {
              alert('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge 브라우저를 사용해주세요.')
            }
          },
          () => {
            // 종료 콜백
            console.log('[VoiceControl] 음성 인식 종료')
            setIsListening(false)
          },
          true // autoRestart: true (자동 재시작)
        )
        setIsListening(true)
      } catch (error) {
        console.error('[VoiceControl] 마이크 실행 실패:', error)
        setIsListening(false)
        alert('마이크 실행 실패: ' + (error.message || '알 수 없는 오류'))
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
      className={`
        p-3 rounded-full transition-all duration-300 flex items-center justify-center touch-manipulation min-h-[44px] min-w-[44px]
        ${isListening 
          ? 'bg-red-500 text-white animate-pulse ring-2 ring-red-400 shadow-lg' 
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }
      `}
      style={{ WebkitTapHighlightColor: 'transparent' }}
      aria-label={isListening ? '음성 인식 중지' : '음성 인식 시작'}
      title={isListening ? '녹음 중지' : '음성 명령 시작'}
    >
      {isListening ? (
        <Circle className="w-5 h-5 fill-white text-white" strokeWidth={0} />
      ) : (
        <Mic className="w-5 h-5" />
      )}
    </button>
  )
}

export default VoiceControl
