import React, { useState, useRef, useEffect } from 'react'
import { MessageSquare, X, Send, Minimize2, Terminal, Loader2 } from 'lucide-react'

const AgentChatWindow = () => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'agent',
      content: '안녕하세요! Cursor Developer Agent입니다. 코드베이스 수정을 도와드릴게요.',
      timestamp: new Date()
    }
  ])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage = {
      id: messages.length + 1,
      type: 'user',
      content: inputValue,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
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
        
        const systemPrompt = `당신은 프론트엔드 개발 전문가입니다. React, Supabase, Tailwind CSS를 사용하는 CRM 프로젝트를 돕고 있습니다.
사용자의 요청을 분석하고, 구체적인 코드 수정 방안을 제시하세요.
항상 한국어로 답변하며, 명확하고 실행 가능한 지침을 제공하세요.`

        // Gemini 포맷으로 변환
        const contents = conversationHistory.map((msg, idx) => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        }))

        // 시스템 프롬프트를 첫 번째 user 메시지에 추가
        if (contents.length > 0) {
          contents[0].parts[0].text = `${systemPrompt}\n\n${contents[0].parts[0].text}`
        }

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
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

  const formatTime = (date) => {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }

  // Minimized FAB
  if (!isExpanded) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setIsExpanded(true)}
          className="group relative w-16 h-16 bg-gradient-to-br from-primary-teal to-primary-teal-dark text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110"
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
    <div className="fixed bottom-6 right-6 z-50 w-96 h-[600px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary-teal to-primary-teal-dark text-white">
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
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsExpanded(false)}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            aria-label="Minimize"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsExpanded(false)}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
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
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                message.type === 'user'
                  ? 'bg-gradient-to-br from-primary-teal to-primary-teal-dark text-white'
                  : 'bg-white border border-slate-200 text-slate-800 shadow-sm'
              }`}
            >
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
              <p
                className={`text-xs mt-1 ${
                  message.type === 'user' ? 'text-white/70' : 'text-slate-400'
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
                <Loader2 className="w-4 h-4 animate-spin text-primary-teal" />
                <span className="text-sm text-slate-500">Agent가 생각 중입니다...</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-200 bg-white p-4">
        <div className="flex items-end gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Command the agent (e.g., 'Fix the chart data bug')..."
            className="flex-1 resize-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-teal/50 focus:border-primary-teal transition-all"
            rows="2"
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-primary-teal to-primary-teal-dark text-white rounded-xl hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
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
          Press <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-xs">Enter</kbd> to send, <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-xs">Shift+Enter</kbd> for new line
        </p>
      </div>
    </div>
  )
}

export default AgentChatWindow
