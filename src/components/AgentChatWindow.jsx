import React, { useState, useRef, useEffect } from 'react'
import { MessageSquare, X, Send, Minimize2, Terminal, Loader2, Image as ImageIcon, Trash2, Mic, MicOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const AgentChatWindow = () => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'agent',
      content: '안녕하세요! AI 비서입니다. 명함 촬영, 활동 기록, 음성 입력으로 자동 등록을 도와드릴게요! 🎤📸',
      timestamp: new Date()
    }
  ])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedImage, setSelectedImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recognition, setRecognition] = useState(null)
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const { user } = useAuth()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Web Speech API 초기화
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      const recognitionInstance = new SpeechRecognition()
      recognitionInstance.continuous = false
      recognitionInstance.interimResults = false
      recognitionInstance.lang = 'ko-KR'

      recognitionInstance.onresult = (event) => {
        const transcript = event.results[0][0].transcript
        setInputValue(transcript)
        setIsRecording(false)
      }

      recognitionInstance.onerror = (event) => {
        console.error('Speech recognition error:', event.error)
        setIsRecording(false)
        const errorMsg = {
          id: messages.length + 1,
          type: 'agent',
          content: `⚠️ 음성인식 오류: ${event.error === 'no-speech' ? '음성이 감지되지 않았습니다.' : '음성인식에 실패했습니다.'}`,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, errorMsg])
      }

      recognitionInstance.onend = () => {
        setIsRecording(false)
      }

      setRecognition(recognitionInstance)
    }
  }, [])

  const handleSendMessage = async () => {
    if ((!inputValue.trim() && !selectedImage) || isLoading) return

    const userMessage = {
      id: messages.length + 1,
      type: 'user',
      content: inputValue,
      image: imagePreview,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    const currentImage = selectedImage
    const currentImagePreview = imagePreview
    setInputValue('')
    setSelectedImage(null)
    setImagePreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    setIsLoading(true)

    try {
      // 대화 히스토리를 Claude API 포맷으로 변환
      const conversationHistory = [...messages, userMessage]
        .filter(msg => msg.type !== 'system')
        .map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.content
        }))

      let assistantText = ''
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY

      // 로컬 개발 환경: 직접 Gemini API 호출
      if (import.meta.env.DEV && apiKey) {
        console.log('🔧 Development mode: Calling Gemini API directly')

        // 현재 날짜 정보
        const today = new Date()
        const todayStr = today.toISOString().split('T')[0]
        const tomorrowStr = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]

        const systemPrompt = `당신은 CRM 비서 AI입니다. 사용자의 입력을 분석하여 다음 작업을 수행합니다:

**현재 날짜:**
- 오늘: ${todayStr}
- 내일: ${tomorrowStr}

**1. 명함 인식 (이미지가 있을 때)**
- 명함에서 정보를 추출하여 JSON 형식으로 반환
- 형식: {"action": "add_client", "client": {"company": "회사명", "contact_person": "담당자", "phone": "전화번호", "email": "이메일", "address": "주소"}}

**2. 활동내역 등록 (텍스트 입력)**
- "오늘 A사 방문", "내일 삼두 미팅 오후 2시" 등을 파싱
- 형식: {"action": "add_activity", "activity": {"title": "활동명", "client_name": "거래처명", "type": "미팅|전화|방문|이메일", "description": "내용", "activity_date": "YYYY-MM-DD", "activity_time": "HH:MM"}}
- **중요**: "오늘"은 ${todayStr}, "내일"은 ${tomorrowStr}로 변환
- **시간 변환**: "오후 2시" → "14:00", "오전 9시" → "09:00", "오후 3시 30분" → "15:30" (24시간 형식)
- 시간 정보가 없으면 activity_time은 null

**3. 일반 대화**
- 위 두 가지에 해당하지 않으면 친절하게 대화

**중요:** 명함이나 활동 등록이 감지되면 반드시 JSON을 \`\`\`json 블록 안에 포함하여 답변하세요.`

        // Gemini 포맷으로 변환 (이미지 포함)
        const contents = conversationHistory.map((msg, idx) => {
          const parts = [{ text: msg.content }]

          // 이미지가 있으면 추가 (base64 inline_data 형식)
          if (msg.role === 'user' && currentImagePreview) {
            const base64Data = currentImagePreview.split(',')[1]
            const mimeType = currentImagePreview.split(';')[0].split(':')[1]
            parts.push({
              inline_data: {
                mime_type: mimeType,
                data: base64Data
              }
            })
          }

          return {
            role: msg.role === 'user' ? 'user' : 'model',
            parts: parts
          }
        })

        // 시스템 프롬프트를 첫 번째 user 메시지에 추가
        if (contents.length > 0) {
          contents[0].parts[0].text = `${systemPrompt}\n\n${contents[0].parts[0].text}`
        }

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: contents,
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 4096,
              }
            })
          }
        )

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error?.message || `Gemini API 오류: ${response.status}`)
        }

        const data = await response.json()
        assistantText = data.candidates?.[0]?.content?.parts?.[0]?.text || '응답을 생성할 수 없습니다.'

        // DB 저장 시도
        await processAndSaveData(assistantText, inputValue, currentImagePreview)
      }
      // 프로덕션 환경: Serverless Function 사용
      else {
        console.log('🚀 Production mode: Using serverless function')

        const apiEndpoint = import.meta.env.VITE_AGENT_API_URL || '/api/chat-agent'

        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: conversationHistory,
            stream: false
          })
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || `API 요청 실패: ${response.status}`)
        }

        const data = await response.json()
        assistantText = data.content?.[0]?.text || '응답을 생성할 수 없습니다.'

        // DB 저장 시도
        await processAndSaveData(assistantText, inputValue, currentImagePreview)
      }

      const agentResponse = {
        id: messages.length + 2,
        type: 'agent',
        content: assistantText,
        timestamp: new Date()
      }

      setMessages(prev => [...prev, agentResponse])
    } catch (error) {
      console.error('Agent API 오류:', error)

      const errorResponse = {
        id: messages.length + 2,
        type: 'agent',
        content: `⚠️ 오류가 발생했습니다: ${error.message}\n\n**해결 방법:**\n1. 프로젝트 루트에 .env 파일을 생성하세요\n2. 다음 내용을 추가하세요:\n   VITE_GEMINI_API_KEY=your-gemini-api-key-here\n3. 개발 서버를 재시작하세요 (npm run dev)\n\nAPI 키는 https://aistudio.google.com/app/apikey 에서 발급받을 수 있습니다.`,
        timestamp: new Date()
      }

      setMessages(prev => [...prev, errorResponse])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleImageSelect = (e) => {
    const file = e.target.files[0]
    if (file && file.type.startsWith('image/')) {
      setSelectedImage(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleRemoveImage = () => {
    setSelectedImage(null)
    setImagePreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handlePaste = (e) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault()
        const file = items[i].getAsFile()
        if (file) {
          setSelectedImage(file)
          const reader = new FileReader()
          reader.onloadend = () => {
            setImagePreview(reader.result)
          }
          reader.readAsDataURL(file)
        }
        break
      }
    }
  }

  const toggleRecording = () => {
    if (!recognition) {
      const errorMsg = {
        id: messages.length + 1,
        type: 'agent',
        content: '⚠️ 이 브라우저는 음성인식을 지원하지 않습니다. Chrome 브라우저를 사용해주세요.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMsg])
      return
    }

    if (isRecording) {
      recognition.stop()
      setIsRecording(false)
    } else {
      recognition.start()
      setIsRecording(true)
    }
  }

  // [Fix] FK Constraint Error 방지용 Safe ID 로직
  const getSafeUserId = async () => {
    try {
      if (!user?.id) {
        // 1. 로그인 안 된 경우 -> DB 첫 번째 유저 사용
        const { data: firstUser } = await supabase.from('users').select('id').limit(1).maybeSingle()
        return firstUser?.id || null
      }

      // 2. 로그인 ID가 public.users에 실제로 있는지 확인
      const { data: exists } = await supabase.from('users').select('id').eq('id', user.id).maybeSingle()
      if (exists) return user.id

      // 3. 없으면(FK 오류 예정) -> DB 첫 번째 유저로 Fallback
      console.warn('Current auth user not found in public.users. Falling back to default user.')
      const { data: fallbackUser } = await supabase.from('users').select('id').limit(1).maybeSingle()
      return fallbackUser?.id || user.id // 정말 없으면 그냥 user.id 던져서 에러 확인

    } catch (e) {
      console.error('getSafeUserId error:', e)
      return user?.id
    }
  }

  // Gemini를 통한 명령 파싱 및 DB 저장
  const processAndSaveData = async (aiResponse, userText, userImage) => {
    try {
      const safeUserId = await getSafeUserId()

      // Gemini 응답에서 JSON 추출 시도
      const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/) || aiResponse.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return false

      const parsedData = JSON.parse(jsonMatch[1] || jsonMatch[0])

      if (parsedData.action === 'add_client' && parsedData.client) {
        // 거래처 등록
        const { data, error } = await supabase
          .from('clients')
          .insert({
            ...parsedData.client,
            created_by: safeUserId,
            created_at: new Date().toISOString()
          })
          .select()
          .single()

        if (error) throw error

        const successMsg = {
          id: messages.length + 1,
          type: 'agent',
          content: `✅ 거래처 등록 완료!\n\n**${data.company}**\n담당자: ${data.contact_person || '-'}\n연락처: ${data.phone || '-'}`,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, successMsg])
        return true
      }

      if (parsedData.action === 'add_activity' && parsedData.activity) {
        // 거래처명으로 client_id 조회
        let clientId = null

        if (parsedData.activity.client_name) {
          const { data: clientData, error: clientError } = await supabase
            .from('clients')
            .select('id, company')
            .ilike('company', `%${parsedData.activity.client_name}%`)
            .limit(1)
            .maybeSingle()

          if (clientError && clientError.code !== 'PGRST116') {
            console.error('Client lookup error:', clientError)
            throw clientError
          }

          if (!clientData) {
            const errorMsg = {
              id: messages.length + 1,
              type: 'agent',
              content: `⚠️ 거래처 "${parsedData.activity.client_name}"를 찾을 수 없습니다.\n먼저 거래처를 등록해주세요.`,
              timestamp: new Date()
            }
            setMessages(prev => [...prev, errorMsg])
            return false
          }

          clientId = clientData.id
        }

        if (!clientId) {
          const errorMsg = {
            id: messages.length + 1,
            type: 'agent',
            content: `⚠️ 거래처 정보가 필요합니다.\n"[거래처명]과 미팅" 형식으로 입력해주세요.`,
            timestamp: new Date()
          }
          setMessages(prev => [...prev, errorMsg])
          return false
        }

        // 활동내역 등록 (Supabase snake_case 스키마에 맞게)
        // 활동내역의 created_by도 Safe ID 사용
        const activityData = {
          client_id: clientId,
          type: parsedData.activity.type || '미팅',
          activity_date: parsedData.activity.activity_date || new Date().toISOString().split('T')[0],
          activity_time: parsedData.activity.activity_time || null,
          description: parsedData.activity.description || parsedData.activity.title || '',
          status: '완료',
          next_action_date: parsedData.activity.next_action_date || null,
          next_action_detail: parsedData.activity.next_action_detail || null,
          created_by: safeUserId
        }

        const { data, error } = await supabase
          .from('activities')
          .insert(activityData)
          .select()

        if (error) {
          console.error('Activity insert error:', error)
          throw error
        }

        const successMsg = {
          id: messages.length + 1,
          type: 'agent',
          content: `✅ 일정이 등록되었습니다!\n\n**${parsedData.activity.title || '활동'}**\n거래처: ${parsedData.activity.client_name}\n일시: ${parsedData.activity.activity_date}\n내용: ${parsedData.activity.notes || '-'}`,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, successMsg])

        // 데이터 새로고침 이벤트 발생
        window.dispatchEvent(new Event('dataUpdated'))
        return true
      }

      return false
    } catch (error) {
      console.error('Data processing error:', error)
      const errorMsg = {
        id: messages.length + 1,
        type: 'agent',
        content: `❌ 등록 중 오류가 발생했습니다: ${error.message}`,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMsg])
      return false
    }
  }

  const formatTime = (date) => {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }

  // Minimized FAB
  if (!isExpanded) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setIsExpanded(true)}
          className="group relative w-16 h-16 bg-gradient-to-br from-teal-500 to-teal-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110"
          aria-label="Open AI Agent Chat"
        >
          <Terminal className="w-7 h-7 mx-auto" />

          {/* Tooltip */}
          <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-slate-800 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            AI Developer Agent
            <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-800"></div>
          </div>

          {/* Pulse indicator */}
          <span className="absolute top-0 right-0 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
        </button>
      </div>
    )
  }

  // Expanded Chat Window
  return (
    <div className="fixed bottom-6 right-6 z-50 w-[768px] h-[600px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-teal-500 to-teal-700 text-white">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5" />
          <div>
            <h3 className="font-bold text-sm">Cursor Developer Agent</h3>
            <div className="flex items-center gap-1 text-xs opacity-90">
              <span className="inline-block w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
              <span>Ready</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(false)}
            className="p-2.5 bg-slate-900/80 hover:bg-slate-900 rounded-lg transition-all shadow-lg border border-slate-700"
            aria-label="Minimize"
            title="최소화"
          >
            <Minimize2 className="w-5 h-5 text-white" />
          </button>
          <button
            onClick={() => setIsExpanded(false)}
            className="p-2.5 bg-red-500/90 hover:bg-red-600 rounded-lg transition-all shadow-lg border border-red-400"
            aria-label="Close"
            title="닫기"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-slate-50/50 to-white">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${message.type === 'user'
                ? 'bg-gradient-to-br from-teal-500 to-teal-700 text-white'
                : 'bg-white border border-slate-200 text-slate-800 shadow-sm'
                }`}
            >
              {message.image && (
                <img
                  src={message.image}
                  alt="첨부 이미지"
                  className="max-w-full rounded-lg mb-2 max-h-48 object-contain"
                />
              )}
              <p className="text-base leading-relaxed whitespace-pre-wrap">{message.content}</p>
              <p
                className={`text-sm mt-1 ${message.type === 'user' ? 'text-white/70' : 'text-slate-400'
                  }`}
              >
                {formatTime(message.timestamp)}
              </p>
            </div>
          </div>
        ))}

        {/* 로딩 인디케이터 */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                <span className="text-sm text-slate-500">Agent가 생각 중입니다...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-200 bg-white p-4">
        {/* 이미지 미리보기 */}
        {imagePreview && (
          <div className="mb-3 relative inline-block">
            <img
              src={imagePreview}
              alt="미리보기"
              className="max-h-32 rounded-lg border border-slate-200"
            />
            <button
              onClick={handleRemoveImage}
              className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors flex items-center justify-center"
              aria-label="이미지 제거"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* 이미지 첨부 버튼 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 w-10 h-10 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all"
            aria-label="이미지 첨부"
            title="명함/이미지 첨부"
          >
            <ImageIcon className="w-5 h-5 mx-auto" />
          </button>

          {/* 음성 녹음 버튼 */}
          <button
            onClick={toggleRecording}
            className={`flex-shrink-0 w-10 h-10 rounded-xl transition-all ${isRecording
              ? 'bg-red-500 text-white animate-pulse'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            aria-label="음성 녹음"
            title={isRecording ? '녹음 중지' : '음성 입력'}
          >
            {isRecording ? (
              <MicOff className="w-5 h-5 mx-auto" />
            ) : (
              <Mic className="w-5 h-5 mx-auto" />
            )}
          </button>

          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            onPaste={handlePaste}
            placeholder="Type a command or paste a screenshot (Ctrl+V)..."
            className="flex-1 resize-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-base text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
            rows="2"
          />
          <button
            onClick={handleSendMessage}
            disabled={(!inputValue.trim() && !selectedImage) || isLoading}
            className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-teal-500 to-teal-700 text-white rounded-xl hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
            aria-label="Send"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 mx-auto animate-spin" />
            ) : (
              <Send className="w-4 h-4 mx-auto" />
            )}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-xs">Enter</kbd> to send,
          <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-xs ml-1">Shift+Enter</kbd> for new line,
          <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-xs ml-1">Ctrl+V</kbd> to paste image
        </p>
      </div>
    </div>
  )
}

export default AgentChatWindow
