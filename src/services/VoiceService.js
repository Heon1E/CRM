/**
 * Web Speech API 서비스 (단발성 음성 명령용)
 * - 단발성 인식: 버튼을 누르면 시작, 말을 멈추거나 다시 누르면 종료
 * - iOS/Android 호환
 */

class VoiceService {
  constructor() {
    this.recognition = null
    this.isSupported = false
    this.isListening = false
    
    // 콜백 저장소
    this.onResultCallback = null
    this.onErrorCallback = null
    this.onEndCallback = null
    
    // 단발성 인식용: 최종 텍스트만 저장
    this.finalTranscript = ''
  }

  // 브라우저 호환성 체크 및 객체 생성
  initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      console.error('[VoiceService] 브라우저가 음성 인식을 지원하지 않음')
      this.isSupported = false
      return false
    }

    this.isSupported = true
    try {
      this.recognition = new SpeechRecognition()
      this.recognition.continuous = true // ⚠️ 핵심: 연속 듣기 모드 (멈춤 버튼 누르기 전까지 계속 듣기)
      this.recognition.interimResults = true // 중간 결과 표시
      this.recognition.lang = 'ko-KR' // 한국어 고정
      this.recognition.maxAlternatives = 1

      // 이벤트 핸들러 연결
      this.recognition.onresult = this.handleResult.bind(this)
      this.recognition.onerror = this.handleError.bind(this)
      this.recognition.onend = this.handleEnd.bind(this)
      
      return true
    } catch (e) {
      console.error('[VoiceService] 초기화 중 에러:', e)
      return false
    }
  }

  // 결과 처리 핸들러
  handleResult(event) {
    let interimTranscript = ''
    let finalTranscript = ''

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript + ' '
      } else {
        interimTranscript += event.results[i][0].transcript
      }
    }

    // 최종 결과 저장
    if (finalTranscript.trim()) {
      this.finalTranscript = (this.finalTranscript + ' ' + finalTranscript.trim()).trim()
    }

    // 콜백 호출
    if (this.onResultCallback) {
      this.onResultCallback(finalTranscript.trim(), interimTranscript, this.finalTranscript)
    }
  }

  // 에러 처리 핸들러
  handleError(event) {
    console.error('[VoiceService] 에러 감지:', event.error)
    
    // 모든 에러는 즉시 중단
    this.isListening = false
    if (this.onErrorCallback) {
      this.onErrorCallback(event.error)
    }
  }

  // 종료 처리 핸들러
  handleEnd() {
    console.log('[VoiceService] 인식 세션 종료')
    
    // continuous 모드에서는 자동 재시작
    if (this.recognition && this.recognition.continuous && this.isListening) {
      // 약간의 지연 후 자동 재시작 (continuous 모드)
      setTimeout(() => {
        if (this.isListening && this.recognition) {
          try {
            this.recognition.start()
            console.log('[VoiceService] 자동 재시작됨 (continuous 모드)')
          } catch (e) {
            // 이미 실행 중이거나 다른 오류인 경우 무시
            console.warn('[VoiceService] 자동 재시작 실패:', e.message)
            this.isListening = false
            if (this.onEndCallback) {
              this.onEndCallback()
            }
          }
        }
      }, 100)
    } else {
      // continuous 모드가 아니거나 사용자가 중지한 경우
      this.isListening = false
      if (this.onEndCallback) {
        this.onEndCallback()
      }
    }
  }

  // 단발성 음성 인식 시작
  async startListening(onResult, onError, onEnd) {
    // 1. 객체 초기화
    if (!this.recognition) {
      const success = this.initRecognition()
      if (!success) {
        if (onError) onError('not-supported')
        return
      }
    }

    // 2. 권한 확인 (최초 1회 명시적 요청)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop()) // 권한만 확인하고 즉시 끔
    } catch (err) {
      console.error('[VoiceService] 마이크 권한 거부됨')
      if (onError) onError('not-allowed')
      return
    }

    // 3. 상태 설정
    this.finalTranscript = '' // 초기화
    this.onResultCallback = onResult
    this.onErrorCallback = onError
    this.onEndCallback = onEnd
    this.isListening = true

    // 4. 시작
    try {
      this.recognition.start()
      console.log('[VoiceService] 음성 인식 시작됨 (단발성)')
    } catch (e) {
      console.error('[VoiceService] 시작 실패:', e)
      this.isListening = false
      if (onError) onError('start-failed')
    }
  }

  // 음성 인식 중지
  stopListening() {
    // 사용자가 직접 중지한 것으로 표시 (자동 재시작 방지)
    this.isListening = false
    
    if (this.recognition) {
      try {
        this.recognition.stop()
        console.log('[VoiceService] 음성 인식 중지됨')
      } catch (e) {
        console.warn('[VoiceService] 중지 실패:', e)
      }
    }
  }
  
  // 최종 인식된 텍스트 가져오기
  getFinalTranscript() {
    return this.finalTranscript
  }
  
  // 지원 여부 확인
  getSupported() {
    return this.isSupported
  }
  
  // 현재 인식 중인지 확인
  getIsListening() {
    return this.isListening
  }
}

const voiceService = new VoiceService()
export default voiceService
