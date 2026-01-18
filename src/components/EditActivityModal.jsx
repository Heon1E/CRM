import React, { useState, useEffect, useRef } from 'react'
import Modal from './Modal'
import { useData } from '../contexts/DataContext'
import useEnterMove from '../hooks/useEnterMove'
// GoogleGenerativeAI SDK 대신 REST API 직접 호출 방식 사용
import { Sparkles, Loader2, X, Plus } from 'lucide-react'
import ClientCombobox from './ClientCombobox'
import { showWarning, showSuccess, showError, showConfirm } from '../utils/alert'
import { parseDateForInput } from '../utils/formatters'

const EditActivityModal = ({ isOpen, onClose, activityId, onDelete }) => {
  // 모든 Hook 선언을 최상단에 배치 (React Hooks 규칙 준수)
  const { activities, clients, updateActivity, deleteActivity, registerModal } = useData()
  const activity = activities?.find((a) => a.id === activityId)
  const formRef = useRef(null)
  const attendeeInputRef = useRef(null)

  const [formData, setFormData] = useState({
    clientId: '',
    type: '미팅',
    activity_date: '',
    user: '',
    description: '',
    status: '완료',
    next_action_date: '',
    next_action_detail: '',
  })

  const [attendees, setAttendees] = useState([]) // 참석자 배열
  const [attendeeInput, setAttendeeInput] = useState('') // 참석자 입력 필드
  const [charCount, setCharCount] = useState(0)
  const [isAILoading, setIsAILoading] = useState(false)


  // activity가 변경되거나 모달이 닫힐 때 폼 초기화 (.cursorrules 규칙: 모달 재오픈 시 폼 상태 초기화)
  useEffect(() => {
    if (activity && activityId) {
      // 날짜 파싱 적용 (공통 유틸리티 함수 사용)
      const parsedDate = parseDateForInput(activity?.activity_date || activity?.date || '')
      
      const parsedNextActionDate = parseDateForInput(activity?.next_action_date || '')
      
      setFormData({
        clientId: activity?.clientId || '',
        type: activity?.type || '미팅',
        activity_date: parsedDate,
        user: activity?.user || '',
        description: activity?.description || '',
        status: activity?.status || '완료',
        next_action_date: parsedNextActionDate,
        next_action_detail: activity?.next_action_detail || '',
      })
      setCharCount(activity?.description?.length || 0)
      
      // user 필드를 콤마로 분리하여 attendees 배열로 변환
      const userString = activity?.user || ''
      const attendeesArray = userString
        ? userString.split(',').map((name) => name.trim()).filter((name) => name.length > 0)
        : []
      setAttendees(attendeesArray)
      setAttendeeInput('')
    } else if (!isOpen) {
      // 모달이 닫힐 때도 폼 초기화
      setFormData({
        clientId: '',
        type: '미팅',
        activity_date: '',
        user: '',
        description: '',
        status: '완료',
        next_action_date: '',
        next_action_detail: '',
      })
      setAttendees([])
      setAttendeeInput('')
      setCharCount(0)
    }
  }, [activity, activityId, isOpen])

  // 전역 엔터 네비게이션 적용 (textarea는 Shift+Enter로 줄바꿈)
  useEnterMove({ formRef, enabled: isOpen })

  // 모달 열림 상태를 DataContext에 등록 (데이터 새로고침 방지)
  useEffect(() => {
    if (isOpen && registerModal) {
      const unregister = registerModal()
      return unregister
    }
  }, [isOpen, registerModal])

  // Guard Clause: activity가 없으면 아무것도 렌더링하지 않음 (.cursorrules 규칙 준수)
  // 모든 Hook 선언이 끝난 후에 조기 리턴
  if (!isOpen || !activityId || !activity) {
    return null
  }

  // 참석자 추가
  const handleAddAttendee = () => {
    const name = attendeeInput.trim()
    if (name && !attendees.includes(name)) {
      setAttendees([...attendees, name])
      setAttendeeInput('')
      // 참석자 추가 후 입력창에 포커스 반환
      setTimeout(() => {
        attendeeInputRef.current?.focus()
      }, 0)
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
      await showWarning('정리할 내용을 먼저 입력해주세요.')
      return
    }

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) {
      await showWarning('API Key가 설정되지 않았습니다.')
      return
    }

    setIsAILoading(true)

    try {
      const prompt = `당신은 현장의 거친 메모를 **품격 있고 핵심적인 '단문형 보고서'**로 탈바꿈시키는 **전문 에디터**입니다.
입력된 내용을 내부적으로 분석하여 비즈니스 용어로 다듬은 뒤, **최종 결과물만** 출력하십시오.

**[작성 가이드 (Internal Rules - Do NOT Output)]**
1. **전문적 재구성:** '돈 때문에' -> '단가 민감도', '다시 잘해보자' -> '협력 강화' 등 격식 있는 표현으로 변환하십시오.
2. **핵심 요약:** 서술어를 '~함', '~임', '~요청', '~협의' 등 명사형이나 단문으로 종결하십시오. (예의 차리는 '습니다' 금지)
3. **구조:** 소제목, 불렛포인트, 번호 매기기를 절대 사용하지 마십시오. 오직 **줄바꿈(Enter)**으로만 문단을 나누십시오.

**[출력 포맷 예시 (Strict Output Format)]**
현대산업 이상호 사장 방문, 주문량 감소 원인 파악 및 물량 회복 협의.

현재 BF타입(월 500개) 운용 중이나, 재생 시장의 높은 단가 민감도로 인한 물량 이탈 확인. MF타입(월 160~200개) 66,000원 공급 가능 여부 타진 및 자차 수령 조건 최저 견적 요청 접수.

당사, 주문량의 점진적 정상화 강력 요청하였으며 사측 역시 협력 강화 및 발주 증대 약속.

**[입력 데이터]**
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
          await showError('사용량이 많아 잠시 지연되고 있습니다. 1분 뒤 다시 시도해주세요. (429)')
        } else if (response.status === 404) {
          await showError('AI 모델을 찾을 수 없습니다. 관리자에게 문의하세요. (404)')
        } else {
          await showError(`AI 서버 연결에 문제가 있습니다. 잠시 후 다시 시도해주세요. (Error: ${response.status})`)
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
      await showError('작업을 처리하는 중 오류가 발생했습니다.')
    } finally {
      // [수정 3] 성공하든 실패하든 로딩 상태는 무조건 해제
      setIsAILoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!activityId || !activity) {
      await showError('활동 내역을 찾을 수 없습니다.')
      onClose()
      return
    }
    if (!formData.clientId) {
      await showWarning('고객을 선택해주세요.')
      return
    }
    if (!formData.activity_date) {
      await showWarning('날짜를 입력해주세요.')
      return
    }

    try {
      // 참석자 배열을 콤마로 구분된 문자열로 변환하여 user 필드에 저장
      const userString = attendees.length > 0 ? attendees.join(', ') : ''
      
      await updateActivity(activityId, {
        ...formData,
        user: userString,
      })
      await showSuccess('활동 내역이 수정되었습니다.')
      onClose()
    } catch (error) {
      console.error('활동 수정 중 오류:', error)
      await showError('활동 내역 수정 중 오류가 발생했습니다.')
    }
  }

  const handleDelete = async () => {
    if (!activityId || !activity) {
      await showError('활동 내역을 찾을 수 없습니다.')
      onClose()
      return
    }
    const confirmed = await showConfirm(
      '이 활동 기록이 영구적으로 삭제됩니다.',
      '정말 삭제하시겠습니까?',
      '삭제',
      '취소'
    )
    if (confirmed) {
      try {
        await deleteActivity(activityId)
        await showSuccess('활동 내역이 삭제되었습니다.')
        onClose()
      } catch (error) {
        console.error('활동 삭제 중 오류:', error)
        await showError('활동 내역 삭제 중 오류가 발생했습니다.')
      }
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="활동 내역 수정" size="lg">
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            거래처 <span className="text-red-400">*</span>
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
              활동 유형 <span className="text-red-400">*</span>
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
              상태 <span className="text-red-400">*</span>
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
            날짜 <span className="text-red-400">*</span>
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
              ref={attendeeInputRef}
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
              className="btn-success flex items-center space-x-1 px-4 py-2.5 h-[42px]"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
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
              내용 <span className="text-red-400">*</span>
            </label>
            <button
              type="button"
              onClick={handleAIPolish}
              disabled={isAILoading || !formData.description.trim()}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 hover:border-purple-300 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAILoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>정리 중...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI 자동 정리</span>
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

        <div className="flex justify-between pt-4">
          <button
            type="button"
            onClick={handleDelete}
            className="px-4 py-2.5 bg-red-400/20 text-red-200 border border-red-400/30 rounded-xl hover:bg-red-400/30 transition-all duration-200 font-semibold"
          >
            삭제
          </button>
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary px-6 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-success px-6 py-2"
            >
              Save
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

export default EditActivityModal





