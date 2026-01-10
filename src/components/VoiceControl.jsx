import React, { useState, useEffect } from 'react'
import voiceService from '../services/VoiceService'
import { Mic, Circle, Loader2 } from 'lucide-react'

const VoiceControl = () => {
  const [isListening, setIsListening] = useState(false)

  const toggleListening = async () => {
    if (isListening) {
      voiceService.stopListening()
      setIsListening(false)
    } else {
      try {
        await voiceService.startListening(
          (final, interim) => console.log('인식 중:', interim),
          (error) => console.error('에러:', error),
          () => setIsListening(false),
          true // autoRestart
        )
        setIsListening(true)
      } catch (error) {
        alert('마이크 실행 실패: ' + error.message)
      }
    }
  }

  if (!voiceService.getSupported()) {
    return null
  }

  return (
    <button
      onClick={toggleListening}
      className={`p-3 rounded-full transition-all duration-300 flex items-center justify-center touch-manipulation min-h-[44px] ${
        isListening 
          ? 'bg-red-100 text-red-600 animate-pulse ring-2 ring-red-400' 
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
      style={{ WebkitTapHighlightColor: 'transparent' }}
      aria-label="음성 제어"
    >
      {isListening ? (
        <Circle className="w-5 h-5 fill-red-600 text-red-600" strokeWidth={0} />
      ) : (
        <Mic className="w-5 h-5" />
      )}
    </button>
  )
}

export default VoiceControl
