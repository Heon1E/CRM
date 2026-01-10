/**
 * Web Speech API 서비스 (최종 수정본)
 * - iOS/Android 완벽 호환
 * - 무한 재시작 (오뚝이 로직)
 * - Wake Lock 화면 꺼짐 방지
 */

class VoiceService {
    constructor() {
      this.recognition = null
      this.isSupported = false
      this.isListening = false
      this.shouldAutoRestart = false
      this.accumulatedTranscript = ''
      
      // Wake Lock (화면 켜짐 유지)
      this.wakeLock = null
  
      // 콜백 저장소
      this.onResultCallback = null
      this.onErrorCallback = null
      this.onEndCallback = null
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
        this.recognition.continuous = false // 모바일 호환성을 위해 false로 설정하고 onend에서 재시작
        this.recognition.interimResults = true
        this.recognition.lang = 'ko-KR'
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
          finalTranscript += event.results[i][0].transcript
        } else {
          interimTranscript += event.results[i][0].transcript
        }
      }
  
      // 최종 결과가 있으면 누적
      if (finalTranscript) {
        this.accumulatedTranscript = (this.accumulatedTranscript + ' ' + finalTranscript).trim()
        console.log('[VoiceService] 누적된 텍스트:', this.accumulatedTranscript)
      }
  
      // 콜백 호출
      if (this.onResultCallback) {
        this.onResultCallback(finalTranscript, interimTranscript, this.accumulatedTranscript)
      }
    }
  
    // 에러 처리 핸들러
    handleError(event) {
      console.warn('[VoiceService] 에러 감지:', event.error)
      
      // 치명적인 에러(권한 거부)인 경우에만 중단
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this.shouldAutoRestart = false
        if (this.onErrorCallback) this.onErrorCallback(event.error)
      }
      // 그 외(no-speech, network 등)는 무시하고 onend에서 재시작됨
    }
  
    // 종료 처리 핸들러 (재시작 로직 핵심)
    handleEnd() {
      console.log('[VoiceService] 인식 세션 종료. 재시작 여부:', this.shouldAutoRestart)
      
      if (this.shouldAutoRestart) {
        // 아주 짧은 딜레이 후 재시작 (브라우저 과부하 방지)
        setTimeout(() => {
          try {
            if (this.recognition) this.recognition.start()
            console.log('[VoiceService] 자동 재시작 성공')
          } catch (e) {
            console.warn('[VoiceService] 재시작 실패(이미 시작됨 등):', e)
          }
        }, 100)
      } else {
        // 진짜 종료
        this.isListening = false
        this.releaseWakeLock() // 화면 잠금 해제
        if (this.onEndCallback) this.onEndCallback()
      }
    }
  
    // 마이크 권한 요청 및 화면 켜짐 유지
    async startListening(onResult, onError, onEnd, autoRestart = true) {
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
      this.shouldAutoRestart = autoRestart
      this.accumulatedTranscript = '' // 초기화
      this.onResultCallback = onResult
      this.onErrorCallback = onError
      this.onEndCallback = onEnd
      this.isListening = true
  
      // 4. 화면 켜짐 유지 (Wake Lock)
      this.requestWakeLock()
  
      // 5. 시작
      try {
        this.recognition.start()
        console.log('[VoiceService] 음성 인식 시작됨')
      } catch (e) {
        console.error('[VoiceService] 시작 실패:', e)
        // 이미 시작된 상태면 그냥 둠
      }
    }
  
    stopListening() {
      this.shouldAutoRestart = false // 재시작 플래그 끔
      this.isListening = false
      
      if (this.recognition) {
        try {
          this.recognition.stop()
        } catch (e) {
          console.warn('Stop failed:', e)
        }
      }
      this.releaseWakeLock()
    }
  
    // Wake Lock 관련 메서드
    async requestWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          this.wakeLock = await navigator.wakeLock.request('screen')
          console.log('[VoiceService] 화면 켜짐 유지 설정됨')
        }
      } catch (err) {
        console.warn('[VoiceService] Wake Lock 실패:', err)
      }
    }
  
    releaseWakeLock() {
      if (this.wakeLock) {
        this.wakeLock.release()
        this.wakeLock = null
        console.log('[VoiceService] 화면 켜짐 유지 해제됨')
      }
    }
    
    getAccumulatedTranscript() {
      return this.accumulatedTranscript
    }
  }
  
  const voiceService = new VoiceService()
  export default voiceService