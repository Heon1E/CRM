import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * 음성 인식 커스텀 훅 (연속 듣기 모드)
 * - continuous = true: 멈춤 버튼 누르기 전까지 계속 듣기
 * - interimResults = true: 말하는 도중에도 텍스트 표시
 * - 모바일 호환: SpeechRecognition 및 webkitSpeechRecognition 모두 지원
 * - 언어: ko-KR 고정
 */
export const useSpeechToText = (options = {}) => {
  const {
    onResult,
    onError,
    onEnd,
    continuous = true,
    interimResults = true,
    lang = 'ko-KR'
  } = options

  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('') // 누적된 최종 텍스트
  const [interimTranscript, setInterimTranscript] = useState('') // 중간 결과
  const [isSupported, setIsSupported] = useState(false)
  const [error, setError] = useState(null)

  const recognitionRef = useRef(null)
  const accumulatedTranscriptRef = useRef('') // continuous 모드에서 누적된 텍스트 저장
  const isStoppedByUserRef = useRef(false) // 사용자가 직접 중지한 경우인지 확인

  // 브라우저 지원 여부 확인 및 초기화
  useEffect(() => {
    // SpeechRecognition 지원 여부 확인 (크로스 브라우저)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    
    if (!SpeechRecognition) {
      setIsSupported(false)
      return
    }

    setIsSupported(true)

    try {
      recognitionRef.current = new SpeechRecognition()
      const recognition = recognitionRef.current

      // ⚠️ 핵심 설정: 연속 듣기 모드
      recognition.continuous = continuous // true: 멈춤 버튼 누르기 전까지 계속 듣기
      recognition.interimResults = interimResults // true: 말하는 도중에도 텍스트 표시
      recognition.lang = lang // 한국어 고정
      recognition.maxAlternatives = 1

      // 이벤트 핸들러 설정
      recognition.onresult = (event) => {
        // continuous 모드에서는 여러 번 호출될 수 있으므로 누적 처리
        let interimText = ''
        let finalText = ''

        // event.resultIndex부터 끝까지 처리 (이전 결과는 이미 처리됨)
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const transcriptText = result[0].transcript

          if (result.isFinal) {
            // 최종 결과: 누적 텍스트에 추가
            finalText += transcriptText + ' '
          } else {
            // 중간 결과: 실시간 표시용
            interimText += transcriptText
          }
        }

        // 최종 텍스트 누적 (continuous 모드)
        if (finalText.trim()) {
          accumulatedTranscriptRef.current += ' ' + finalText.trim()
          accumulatedTranscriptRef.current = accumulatedTranscriptRef.current.trim()
          setTranscript(accumulatedTranscriptRef.current)
        }

        // 중간 텍스트 업데이트
        setInterimTranscript(interimText)

        // 콜백 호출
        if (onResult) {
          onResult(
            accumulatedTranscriptRef.current, // 누적된 최종 텍스트
            interimText, // 현재 중간 텍스트
            {
              final: accumulatedTranscriptRef.current,
              interim: interimText,
              full: accumulatedTranscriptRef.current + ' ' + interimText
            }
          )
        }
      }

      recognition.onerror = (event) => {
        const errorType = event.error
        let errorMessage = '음성 인식 중 오류가 발생했습니다.'

        // 에러 타입별 처리
        if (errorType === 'not-allowed') {
          errorMessage = '마이크 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요.'
        } else if (errorType === 'no-speech') {
          // 침묵 감지 (continuous 모드에서는 무시하거나 경고만 표시)
          if (continuous) {
            // continuous 모드에서는 침묵을 에러로 처리하지 않음
            return
          }
          errorMessage = '음성이 감지되지 않았습니다.'
        } else if (errorType === 'audio-capture') {
          errorMessage = '마이크를 찾을 수 없습니다. 마이크가 연결되어 있는지 확인해주세요.'
        } else if (errorType === 'network') {
          errorMessage = '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.'
        }

        setError(errorMessage)
        setIsListening(false)

        if (onError) {
          onError(errorType, errorMessage)
        }
      }

      recognition.onend = () => {
        // continuous 모드에서는 사용자가 직접 중지하지 않은 경우 자동 재시작
        if (continuous && isListening && !isStoppedByUserRef.current) {
          // 자동 재시작 (약간의 지연 후)
          setTimeout(() => {
            if (isListening && !isStoppedByUserRef.current) {
              try {
                recognitionRef.current?.start()
              } catch (e) {
                // 이미 실행 중이거나 다른 오류인 경우 무시
                console.warn('[useSpeechToText] 자동 재시작 실패 (이미 실행 중일 수 있음):', e.message)
              }
            }
          }, 100)
        } else {
          // 사용자가 직접 중지한 경우 또는 continuous 모드가 아닌 경우
          setIsListening(false)
          if (onEnd) {
            onEnd(accumulatedTranscriptRef.current)
          }
        }
      }

      return () => {
        // 정리: 컴포넌트 언마운트 시 인식 중지
        if (recognitionRef.current && isListening) {
          try {
            recognitionRef.current.stop()
          } catch (e) {
            // 이미 중지된 경우 무시
          }
        }
      }
    } catch (e) {
      console.error('[useSpeechToText] 초기화 실패:', e)
      setIsSupported(false)
      setError('음성 인식을 초기화할 수 없습니다.')
    }
  }, [continuous, interimResults, lang]) // 초기화는 한 번만 수행

  // 음성 인식 시작
  const startListening = useCallback(async () => {
    if (!isSupported || !recognitionRef.current) {
      const errorMsg = '브라우저가 음성 인식을 지원하지 않습니다. Chrome 또는 Edge 브라우저를 사용해주세요.'
      setError(errorMsg)
      if (onError) {
        onError('not-supported', errorMsg)
      }
      return false
    }

    // 마이크 권한 확인
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop()) // 권한만 확인하고 즉시 중지
    } catch (err) {
      const errorMsg = '마이크 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요.'
      setError(errorMsg)
      setIsListening(false)
      if (onError) {
        onError('not-allowed', errorMsg)
      }
      return false
    }

    // 상태 초기화
    accumulatedTranscriptRef.current = ''
    setTranscript('')
    setInterimTranscript('')
    setError(null)
    isStoppedByUserRef.current = false

    // 인식 시작
    try {
      recognitionRef.current.start()
      setIsListening(true)
      return true
    } catch (e) {
      // 이미 실행 중이거나 다른 오류
      if (e.message?.includes('already started') || e.message?.includes('already running')) {
        // 이미 실행 중인 경우 상태만 업데이트
        setIsListening(true)
        return true
      }
      
      const errorMsg = '음성 인식을 시작할 수 없습니다: ' + (e.message || '알 수 없는 오류')
      setError(errorMsg)
      setIsListening(false)
      if (onError) {
        onError('start-failed', errorMsg)
      }
      return false
    }
  }, [isSupported, onError])

  // 음성 인식 중지
  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return

    isStoppedByUserRef.current = true // 사용자가 직접 중지한 것으로 표시
    setIsListening(false)

    try {
      recognitionRef.current.stop()
    } catch (e) {
      // 이미 중지된 경우 무시
      console.warn('[useSpeechToText] 중지 실패 (이미 중지되었을 수 있음):', e.message)
    }

    // 최종 콜백 호출
    if (onEnd) {
      onEnd(accumulatedTranscriptRef.current)
    }
  }, [onEnd])

  // 텍스트 초기화
  const resetTranscript = useCallback(() => {
    accumulatedTranscriptRef.current = ''
    setTranscript('')
    setInterimTranscript('')
  }, [])

  // 현재 누적된 최종 텍스트 가져오기
  const getTranscript = useCallback(() => {
    return accumulatedTranscriptRef.current
  }, [])

  return {
    isListening,
    transcript, // 누적된 최종 텍스트
    interimTranscript, // 현재 중간 텍스트
    isSupported,
    error,
    startListening,
    stopListening,
    resetTranscript,
    getTranscript
  }
}
