/**
 * Web Speech API 서비스
 * 브라우저 마이크를 통해 음성을 텍스트로 변환하는 기능 제공
 * - 무한 재시작 로직: onend 이벤트 발생 시 자동으로 start() 재호출
 * - Transcript 누적: 재시작 시에도 기존 텍스트 유지
 */

class VoiceService {
  constructor() {
    this.recognition = null
    this.isSupported = false
    this.isListening = false
    this.onResultCallback = null
    this.onErrorCallback = null
    this.onEndCallback = null
    this.accumulatedTranscript = '' // 누적된 최종 텍스트
    this.shouldAutoRestart = false // 자동 재시작 플래그
    this.retryCount = 0 // 재시도 횟수
    this.maxRetries = 3 // 최대 재시도 횟수

    this.init()
  }

  /**
   * Speech Recognition 초기화
   * 크로스 브라우징 지원: iOS Safari, Android Chrome 모두 지원
   */
  init() {
    // 크로스 브라우징 처리: webkitSpeechRecognition (Chrome/Safari) 또는 SpeechRecognition (표준)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    
    if (SpeechRecognition) {
      try {
        this.recognition = new SpeechRecognition()
        
        this.recognition.continuous = true // 연속 인식
        this.recognition.interimResults = true // 중간 결과 표시
        this.recognition.lang = 'ko-KR' // 한국어
        
        console.log('[VoiceService] SpeechRecognition 초기화 성공:', {
          browser: navigator.userAgent,
          support: 'webkitSpeechRecognition' in window ? 'webkit' : 'standard',
          timestamp: new Date().toISOString()
        })

      this.recognition.onresult = (event) => {
        if (this.onResultCallback) {
          this.onResultCallback(event)
        }
      }

      this.recognition.onerror = (event) => {
        // 상세한 에러 로깅
        console.error('[VoiceService] SpeechRecognition 에러:', {
          error: event.error,
          message: event.message || '알 수 없는 오류',
          timestamp: new Date().toISOString()
        })

        // 재시도 가능한 에러인지 확인
        const retryableErrors = ['network', 'no-speech', 'audio-capture']
        const fatalErrors = ['not-allowed', 'aborted', 'service-not-allowed']

        if (fatalErrors.includes(event.error)) {
          // 치명적 오류: 즉시 중단
          this.isListening = false
          this.shouldAutoRestart = false
          this.retryCount = 0
          if (this.onErrorCallback) {
            this.onErrorCallback(event.error)
          }
        } else if (retryableErrors.includes(event.error) && this.retryCount < this.maxRetries) {
          // 재시도 가능한 오류: 자동 재시도
          this.retryCount++
          console.warn(`[VoiceService] 재시도 가능한 오류 감지 (${this.retryCount}/${this.maxRetries}):`, event.error)
          
          setTimeout(() => {
            if (this.shouldAutoRestart && this.recognition && this.isListening) {
              try {
                this.recognition.start()
                console.log('[VoiceService] 자동 재시도 성공')
              } catch (error) {
                console.error('[VoiceService] 자동 재시도 실패:', error)
                if (this.retryCount >= this.maxRetries) {
                  this.isListening = false
                  this.shouldAutoRestart = false
                  if (this.onErrorCallback) {
                    this.onErrorCallback(event.error)
                  }
                }
              }
            }
          }, 1000) // 1초 후 재시도
        } else {
          // 재시도 횟수 초과 또는 알 수 없는 오류
          this.isListening = false
          this.shouldAutoRestart = false
          this.retryCount = 0
          if (this.onErrorCallback) {
            this.onErrorCallback(event.error)
          }
        }
      }

      this.recognition.onend = () => {
        // 자동 재시작 로직: shouldAutoRestart가 true이고 isListening이 true일 때만 재시작
        if (this.shouldAutoRestart && this.isListening && this.recognition) {
          try {
            // 즉시 재시작 (지연 없이)
            this.recognition.start()
            console.log('[VoiceService] 자동 재시작 성공 (onend 이벤트)')
            this.retryCount = 0 // 재시작 성공 시 재시도 카운터 리셋
          } catch (error) {
            // 이미 실행 중이거나 오류 발생 시
            if (error.name === 'InvalidStateError') {
              // 이미 실행 중인 경우 정상 (무시)
              console.log('[VoiceService] 이미 실행 중 (정상)')
            } else {
              console.error('[VoiceService] 자동 재시작 실패:', error)
              // 재시도
              setTimeout(() => {
                if (this.shouldAutoRestart && this.isListening && this.recognition) {
                  try {
                    this.recognition.start()
                    console.log('[VoiceService] 자동 재시작 재시도 성공')
                  } catch (retryError) {
                    console.error('[VoiceService] 자동 재시작 재시도 실패:', retryError)
                    this.isListening = false
                    this.shouldAutoRestart = false
                    if (this.onEndCallback) {
                      this.onEndCallback()
                    }
                  }
                }
              }, 100)
            }
          }
        } else {
          // 자동 재시작하지 않음 (사용자가 중지 버튼을 눌렀거나 오류로 인한 종료)
          this.isListening = false
          this.shouldAutoRestart = false
          this.retryCount = 0
          if (this.onEndCallback) {
            this.onEndCallback()
          }
        }
      }

        this.isSupported = true
      } catch (error) {
        console.error('[VoiceService] SpeechRecognition 생성 실패:', {
          error: error.message,
          browser: navigator.userAgent,
          timestamp: new Date().toISOString()
        })
        this.isSupported = false
        this.recognition = null
      }
    } else {
      console.warn('[VoiceService] SpeechRecognition을 지원하지 않는 브라우저:', navigator.userAgent)
      this.isSupported = false
      this.recognition = null
    }
  }

  /**
   * 마이크 권한 명시적 요청
   * iOS Safari 및 Android Chrome에서 마이크 권한을 명시적으로 요청
   * @returns {Promise<boolean>} 권한 획득 여부
   */
  async requestMicrophonePermission() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('[VoiceService] getUserMedia API를 지원하지 않습니다.')
      return false
    }

    try {
      console.log('[VoiceService] 마이크 권한 요청 시작...')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      // 스트림 즉시 중지 (권한만 확인)
      stream.getTracks().forEach(track => track.stop())
      
      console.log('[VoiceService] 마이크 권한 획득 성공')
      return true
    } catch (error) {
      console.error('[VoiceService] 마이크 권한 요청 실패:', {
        error: error.name,
        message: error.message,
        browser: navigator.userAgent,
        timestamp: new Date().toISOString()
      })

      // 권한 거부 에러 구분
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        throw new Error('not-allowed') // 권한 거부
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        throw new Error('no-speech') // 마이크 장치 없음
      } else {
        throw new Error('audio-capture') // 기타 오류
      }
    }
  }

  /**
   * 음성 인식 시작
   * @param {Function} onResult - 결과 콜백 (finalTranscript, interimTranscript, accumulatedTranscript)
   * @param {Function} onError - 에러 콜백 (error)
   * @param {Function} onEnd - 종료 콜백
   * @param {Boolean} autoRestart - 자동 재시작 여부 (기본값: true)
   */
  async startListening(onResult, onError, onEnd, autoRestart = true) {
    if (!this.isSupported || !this.recognition) {
      const errorMsg = '이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge 브라우저를 사용해주세요.'
      console.error('[VoiceService] 지원하지 않는 브라우저:', navigator.userAgent)
      throw new Error(errorMsg)
    }

    if (this.isListening) {
      console.warn('[VoiceService] 이미 실행 중입니다.')
      return // 이미 실행 중이면 무시
    }

    // 마이크 권한 명시적 요청 (iOS/Android 호환성)
    try {
      await this.requestMicrophonePermission()
    } catch (error) {
      console.error('[VoiceService] 마이크 권한 요청 실패:', error)
      // 권한 요청 실패해도 SpeechRecognition은 시도 (일부 브라우저는 자동 요청)
      // 하지만 에러 콜백으로 알림
      if (error === 'not-allowed') {
        if (onError) {
          onError('not-allowed')
        }
        throw new Error('마이크 권한이 거부되었습니다. 브라우저 설정에서 마이크 권한을 허용해주세요.')
      }
    }

    // 초기화
    this.accumulatedTranscript = '' // 누적 텍스트 초기화
    this.shouldAutoRestart = autoRestart
    this.retryCount = 0

    // 콜백 등록
    this.onResultCallback = (event) => {
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

      // 누적 텍스트 업데이트 (최종 결과만 누적)
      if (finalTranscript.trim()) {
        this.accumulatedTranscript = (this.accumulatedTranscript + ' ' + finalTranscript.trim()).trim()
      }

      if (onResult) {
        // 누적된 텍스트도 함께 전달
        onResult(finalTranscript.trim(), interimTranscript, this.accumulatedTranscript)
      }
    }

    this.onErrorCallback = (error) => {
      // 에러 콜백은 onerror 핸들러에서 이미 처리됨
      if (onError) {
        onError(error)
      }
    }

    this.onEndCallback = () => {
      // 자동 재시작하지 않는 경우에만 onEnd 콜백 호출
      if (!this.shouldAutoRestart && onEnd) {
        onEnd()
      }
    }

    try {
      this.isListening = true
      this.recognition.start()
      console.log('[VoiceService] 음성 인식 시작 (autoRestart:', autoRestart, ')')
    } catch (error) {
      this.isListening = false
      this.shouldAutoRestart = false
      console.error('[VoiceService] 음성 인식 시작 실패:', error)
      throw new Error(`음성 인식을 시작할 수 없습니다: ${error.message}`)
    }
  }

  /**
   * 누적된 텍스트 가져오기
   */
  getAccumulatedTranscript() {
    return this.accumulatedTranscript
  }

  /**
   * 누적된 텍스트 초기화
   */
  clearAccumulatedTranscript() {
    this.accumulatedTranscript = ''
  }

  /**
   * 음성 인식 중지
   */
  stopListening() {
    if (!this.recognition || !this.isListening) {
      return
    }

    try {
      // 자동 재시작 비활성화
      this.shouldAutoRestart = false
      this.retryCount = 0
      
      this.recognition.stop()
      this.isListening = false
      console.log('[VoiceService] 음성 인식 중지')
    } catch (error) {
      console.error('[VoiceService] 음성 인식 중지 오류:', error)
      this.isListening = false
      this.shouldAutoRestart = false
    }
  }

  /**
   * 지원 여부 확인
   */
  getSupported() {
    return this.isSupported
  }

  /**
   * 현재 인식 중인지 확인
   */
  getIsListening() {
    return this.isListening
  }
}

// 싱글톤 인스턴스 생성
const voiceService = new VoiceService()

export default voiceService
