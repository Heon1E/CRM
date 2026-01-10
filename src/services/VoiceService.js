/**
 * Web Speech API 서비스
 * 브라우저 마이크를 통해 음성을 텍스트로 변환하는 기능 제공
 */

class VoiceService {
  constructor() {
    this.recognition = null
    this.isSupported = false
    this.isListening = false
    this.onResultCallback = null
    this.onErrorCallback = null
    this.onEndCallback = null

    this.init()
  }

  /**
   * Speech Recognition 초기화
   */
  init() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      this.recognition = new SpeechRecognition()
      
      this.recognition.continuous = true // 연속 인식
      this.recognition.interimResults = true // 중간 결과 표시
      this.recognition.lang = 'ko-KR' // 한국어

      this.recognition.onresult = (event) => {
        if (this.onResultCallback) {
          this.onResultCallback(event)
        }
      }

      this.recognition.onerror = (event) => {
        if (this.onErrorCallback) {
          this.onErrorCallback(event)
        }
      }

      this.recognition.onend = () => {
        if (this.onEndCallback) {
          this.onEndCallback()
        }
      }

      this.isSupported = true
    } else {
      this.isSupported = false
    }
  }

  /**
   * 음성 인식 시작
   * @param {Function} onResult - 결과 콜백 (finalTranscript, interimTranscript)
   * @param {Function} onError - 에러 콜백 (error)
   * @param {Function} onEnd - 종료 콜백
   */
  startListening(onResult, onError, onEnd) {
    if (!this.isSupported || !this.recognition) {
      throw new Error('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge 브라우저를 사용해주세요.')
    }

    if (this.isListening) {
      return // 이미 실행 중이면 무시
    }

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

      if (onResult) {
        onResult(finalTranscript.trim(), interimTranscript)
      }
    }

    this.onErrorCallback = (event) => {
      this.isListening = false
      if (onError) {
        onError(event.error)
      }
    }

    this.onEndCallback = () => {
      // 연속 모드이므로 자동 재시작
      if (this.isListening && this.recognition) {
        try {
          setTimeout(() => {
            if (this.isListening && this.recognition) {
              this.recognition.start()
            }
          }, 100)
        } catch (error) {
          // 이미 실행 중이거나 오류 발생 시 무시
          console.error('음성 인식 자동 재시작 실패:', error)
        }
      } else {
        this.isListening = false
        if (onEnd) {
          onEnd()
        }
      }
    }

    try {
      this.isListening = true
      this.recognition.start()
    } catch (error) {
      this.isListening = false
      throw new Error(`음성 인식을 시작할 수 없습니다: ${error.message}`)
    }
  }

  /**
   * 음성 인식 중지
   */
  stopListening() {
    if (!this.recognition || !this.isListening) {
      return
    }

    try {
      this.recognition.stop()
      this.isListening = false
    } catch (error) {
      console.error('음성 인식 중지 오류:', error)
      this.isListening = false
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
