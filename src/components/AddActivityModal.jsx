import React, { useState, useRef, useEffect } from 'react'
import Modal from './Modal'
import { useData } from '../contexts/DataContext'
import useEnterMove from '../hooks/useEnterMove'
// GoogleGenerativeAI SDK 대신 REST API 직접 호출 방식 사용
import { Sparkles, Loader2, X, Plus } from 'lucide-react'
import ClientCombobox from './ClientCombobox'

const AddActivityModal = ({ isOpen, onClose, initialDate = null }) => {
  const { clients, addActivity } = useData()
  const formRef = useRef(null)

  const [formData, setFormData] = useState({
    clientId: '',
    type: '미팅',
    activity_date: new Date().toISOString().split('T')[0],
    user: '',
    description: '',
    status: '완료',
    next_action_date: initialDate || '',
    next_action_detail: '',
  })

  // initialDate가 변경되면 next_action_date 업데이트
  useEffect(() => {
    if (initialDate) {
      setFormData((prev) => ({
        ...prev,
        next_action_date: initialDate,
      }))
    }
  }, [initialDate])

  const [attendees, setAttendees] = useState([]) // 참석자 배열
  const [attendeeInput, setAttendeeInput] = useState('') // 참석자 입력 필드
  const [charCount, setCharCount] = useState(0)
  const [isAILoading, setIsAILoading] = useState(false)

  // 전역 엔터 네비게이션 적용 (textarea는 Shift+Enter로 줄바꿈)
  useEnterMove({ formRef, enabled: isOpen })

  // 참석자 추가
  const handleAddAttendee = () => {
    const name = attendeeInput.trim()
    if (name && !attendees.includes(name)) {
      setAttendees([...attendees, name])
      setAttendeeInput('')
    }
  }

  // 참석자 삭제
  const handleRemoveAttendee = (index) => {
    setAttendees(attendees.filter((_, i) => i !== index))
  }

  // 참석자 입력 필드에서 Enter 키 처리
  const handleAttendeeKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation() // useEnterMove와의 충돌 방지
      handleAddAttendee()
    }
  }

  const handleDescriptionChange = (e) => {
    const value = e.target.value
    if (value.length <= 3000) {
      setFormData({ ...formData, description: value })
      setCharCount(value.length)
    }
  }

  // AI 글 다듬기 기능
  const handleAIPolish = async () => {
    const currentText = formData.description.trim()
    
    if (!currentText) {
      alert('정리할 내용을 먼저 입력해주세요.')
      return
    }

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) {
      alert('API Key가 설정되지 않았습니다.')
      return
    }

    setIsAILoading(true)

    try {
      const prompt = `당신은 베테랑 영업 비서입니다. 사용자가 두서없이 작성한 미팅 메모를 보고받는 상사가 단 3초 만에 핵심을 파악할 수 있도록 재구성해야 합니다.

**[절대 준수 규칙]**
1. **서식 금지:** 텍스트에 볼드체(\`**\`), 헤더(\`##\`), 이탤릭 등을 **절대 사용하지 마십시오.** 오직 텍스트와 줄바꿈, 하이픈(\`-\`)만 사용하세요.
2. **구조 재배치 (시간순 X, 중요도순 O):**
   - 메모의 내용을 시간 순서로 나열하지 말고, **가장 중요한 성과나 결론**을 맨 윗줄에 배치하세요.
   - 그 다음으로 거래처의 핵심 요구사항이나 이슈를 배치하세요.
   - 마지막에 향후 계획(Next Step)을 적으세요.
3. **문체:** 군더더기 없는 건조한 보고체(개조식)를 사용하세요. (예: "~에 대해 논의함", "~하기로 결정함")
4. **분량:** 전체 길이는 5~7줄을 넘기지 않으면서 핵심 내용은 누락하지 마세요.

**[출력 예시]**
- [결론] A사 계약 건 단가 100원 인상하여 갱신하기로 구두 합의함.
- [이슈] 납기 지연에 대한 우려가 있어 재고 확보 계획을 공유 요청받음.
- [활동] 신규 제품 샘플 2종 전달 및 시연 진행.
- [향후] 다음 주 월요일 최종 견적서 발송 예정.

다음 영업 메모를 위 규칙에 따라 정리해줘:
${currentText}`

      // [수정 1] REST API 직접 호출: gemini-flash-latest 사용 (안정적인 최신 별칭)
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        }
      )

      // [수정 2] 에러 발생 시 즉시 처리하고 함수 종료
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) // 에러 상세 내용 파싱 시도
        console.error('Gemini API Error:', response.status, errorData)

        if (response.status === 429) {
          alert('사용량이 많아 잠시 지연되고 있습니다. 1분 뒤 다시 시도해주세요. (429)')
        } else if (response.status === 404) {
          alert('AI 모델을 찾을 수 없습니다. 관리자에게 문의하세요. (404)')
        } else {
          alert(`AI 서버 연결에 문제가 있습니다. 잠시 후 다시 시도해주세요. (Error: ${response.status})`)
        }
        return // 더 이상 진행하지 않음
      }

      const data = await response.json()
      
      // 데이터 파싱 안전장치
      const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text
      
      if (aiText) {
        // 정리된 텍스트를 입력창에 반영 (3000자 제한 확인)
        const finalText = aiText.length > 3000 ? aiText.substring(0, 3000) : aiText
        setFormData({ ...formData, description: finalText })
        setCharCount(finalText.length)
      } else {
        throw new Error('AI가 응답을 생성하지 못했습니다.')
      }

    } catch (error) {
      console.error('AI 정리 중 로직 오류:', error)
      alert('작업을 처리하는 중 오류가 발생했습니다.')
    } finally {
      // [수정 3] 성공하든 실패하든 로딩 상태는 무조건 해제
      setIsAILoading(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formData.clientId) {
      alert('고객을 선택해주세요.')
      return
    }
    if (!formData.activity_date) {
      alert('날짜를 입력해주세요.')
      return
    }
    if (!formData.description.trim()) {
      alert('내용을 입력해주세요.')
      return
    }

    // 참석자 배열을 콤마로 구분된 문자열로 변환하여 user 필드에 저장
    const userString = attendees.length > 0 ? attendees.join(', ') : ''
    
    addActivity({
      ...formData,
      user: userString,
    })
    alert('활동 내역이 추가되었습니다.')
    setFormData({
      clientId: '',
      type: '미팅',
      activity_date: new Date().toISOString().split('T')[0],
      user: '',
      description: '',
      status: '완료',
    })
    setAttendees([])
    setAttendeeInput('')
    setCharCount(0)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="활동 내역 추가" size="lg">
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            거래처 <span className="text-red-500">*</span>
          </label>
          <ClientCombobox
            clients={clients || []}
            value={formData.clientId || ''}
            onSelect={(clientId) => {
              if (clientId && clientId.trim()) {
                setFormData({ ...formData, clientId })
              }
            }}
            placeholder="거래처를 검색하세요..."
            disabled={false}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              활동 유형 <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="input-field"
              required
            >
              <option value="미팅">미팅</option>
              <option value="전화">전화</option>
              <option value="이메일">이메일</option>
              <option value="제안서">제안서</option>
              <option value="견적">견적</option>
              <option value="계약">계약</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              상태 <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="input-field"
              required
            >
              <option value="완료">완료</option>
              <option value="진행중">진행중</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            날짜 <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={formData.activity_date}
            onChange={(e) => setFormData({ ...formData, activity_date: e.target.value })}
            className="input-field"
            required
          />
        </div>

        {/* 다음 일정 섹션 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              다음 일정 날짜
            </label>
            <input
              type="date"
              value={formData.next_action_date}
              onChange={(e) => setFormData({ ...formData, next_action_date: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              다음 일정 내용
            </label>
            <input
              type="text"
              value={formData.next_action_detail}
              onChange={(e) => setFormData({ ...formData, next_action_detail: e.target.value })}
              className="input-field"
              placeholder="예: 견적서 발송"
            />
          </div>
        </div>

        {/* 참석자 입력 섹션 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            참석자
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={attendeeInput}
              onChange={(e) => setAttendeeInput(e.target.value)}
              onKeyDown={handleAttendeeKeyDown}
              className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
              placeholder="이름을 입력하고 Enter 또는 추가 버튼을 누르세요"
            />
            <button
              type="button"
              onClick={handleAddAttendee}
              className="btn-success flex items-center space-x-1"
            >
              <Plus className="w-4 h-4" />
              <span>추가</span>
            </button>
          </div>
          {/* 참석자 태그 표시 */}
          {attendees.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-card border border-border-light min-h-[50px]">
              {attendees.map((name, index) => (
                <div
                  key={index}
                  className="inline-flex items-center space-x-1 px-3 py-1.5 bg-purple-100 text-purple-800 rounded-full text-sm font-medium"
                >
                  <span>{name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttendee(index)}
                    className="ml-1 hover:bg-purple-200 rounded-full p-0.5 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">
              내용 <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={handleAIPolish}
              disabled={isAILoading || !formData.description.trim()}
              className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 hover:border-purple-300 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAILoading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>정리 중...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3" />
                  <span>✨ AI 자동 정리</span>
                </>
              )}
            </button>
          </div>
          <textarea
            value={formData.description}
            onChange={handleDescriptionChange}
            rows={6}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
            placeholder="활동 내용을 입력하세요 (최대 3000자)"
            required
            disabled={isAILoading}
          />
          <div className="mt-1 text-right text-sm text-gray-500">
            {charCount}/3000
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
          >
            취소
          </button>
          <button
            type="submit"
            className="btn-success"
          >
            저장
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default AddActivityModal

