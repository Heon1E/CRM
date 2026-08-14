import React, { useState, useRef, useEffect } from 'react'
import Modal from './Modal'
import { useData } from '../contexts/DataContext'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import useEnterMove from '../hooks/useEnterMove'
// GoogleGenerativeAI SDK 대신 REST API 직접 호출 방식 사용
import { Sparkles, Loader2, X, Plus } from 'lucide-react'
import ClientCombobox from './ClientCombobox'
import toast from 'react-hot-toast'
import { showWarning, showError } from '../utils/alert'

const AddActivityModal = ({ isOpen, onClose, initialDate = null }) => {
  // 모든 Hook 선언을 최상단에 배치 (React Hooks 규칙 준수)
  const { clients, addActivity, addIssue, registerModal } = useData()
  const { isOnline } = useOnlineStatus()
  const formRef = useRef(null)
  const attendeeInputRef = useRef(null)

  const [formData, setFormData] = useState({
    clientId: '',
    type: '미팅',
    activity_date: new Date().toISOString().split('T')[0],
    activity_time: '',
    user: '',
    description: '',
    status: '완료',
    next_action_date: initialDate || '',
    next_action_detail: '',
  })
  const [registerAsIssue, setRegisterAsIssue] = useState(false)
  const [attendees, setAttendees] = useState([]) // 참석자 배열
  const [attendeeInput, setAttendeeInput] = useState('') // 참석자 입력 필드
  const [charCount, setCharCount] = useState(0)
  const [isAILoading, setIsAILoading] = useState(false)

  // 전역 엔터 네비게이션 적용 (textarea는 Shift+Enter로 줄바꿈)
  useEnterMove({ formRef, enabled: isOpen })

  // 모달 열림 상태를 DataContext에 등록 (데이터 새로고침 방지)
  useEffect(() => {
    if (isOpen && registerModal) {
      const unregister = registerModal()
      return unregister
    }
  }, [isOpen, registerModal])

  // initialDate가 변경되면 next_action_date 업데이트 (모달이 열려있을 때만)
  useEffect(() => {
    if (isOpen && initialDate) {
      setFormData((prev) => ({
        ...prev,
        next_action_date: initialDate,
      }))
    }
  }, [initialDate, isOpen])

  // 모달이 닫힐 때만 상태 초기화 (입력 데이터 보존)
  useEffect(() => {
    if (!isOpen) {
      // 모달이 닫힐 때만 초기화 (등록 성공 또는 취소 버튼 클릭 시)
      setRegisterAsIssue(false)
      setAttendees([])
      setAttendeeInput('')
      setCharCount(0)
      setFormData({
        clientId: '',
        type: '미팅',
        activity_date: new Date().toISOString().split('T')[0],
        activity_time: '',
        user: '',
        description: '',
        status: '완료',
        next_action_date: initialDate || '',
        next_action_detail: '',
      })
    }
  }, [isOpen, initialDate])

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
    if (!formData.clientId) {
      await showWarning('고객을 선택해주세요.')
      return
    }
    if (!formData.activity_date) {
      await showWarning('날짜를 입력해주세요.')
      return
    }
    if (!formData.description.trim()) {
      await showWarning('내용을 입력해주세요.')
      return
    }

    try {
      // 참석자 배열을 콤마로 구분된 문자열로 변환하여 user 필드에 저장
      const userString = attendees.length > 0 ? attendees.join(', ') : ''

      // 오프라인 상태 확인 및 처리
      if (!isOnline) {
        toast.warning('현재 오프라인 상태입니다. 데이터는 로컬에 저장되며, 연결 시 자동으로 업로드됩니다.', {
          duration: 5000,
          icon: '⚠️'
        })
      }

      // 영업 활동 등록 (오프라인 지원 - addActivity 내부에서 처리됨)
      const activity = await addActivity({
        ...formData,
        user: userString,
      })

      // [SMART LOGIC] Issue 등록 여부 판단
      // 1. 체크박스가 체크되어 있거나
      // 2. 'Follow-up Action Detail'이 입력되어 있는 경우
      const hasFollowUp = formData.next_action_detail && formData.next_action_detail.trim().length > 0
      const shouldRegisterIssue = registerAsIssue || hasFollowUp

      if (shouldRegisterIssue) {
        const selectedClient = clients.find(c => c.id === formData.clientId)

        // 이슈 제목
        const issueTitle = hasFollowUp
          ? `${selectedClient?.company || '고객'} - 후속 조치`
          : `${selectedClient?.company || '고객'} - ${formData.type}`

        // 이슈 내용
        const issueContent = hasFollowUp
          ? formData.next_action_detail
          : formData.description

        // 목표일
        const issueTargetDate = (hasFollowUp && formData.next_action_date)
          ? formData.next_action_date
          : formData.activity_date

        try {
          await addIssue({
            title: issueTitle,
            content: issueContent,
            status: '등록',
            target_date: issueTargetDate,
            date: formData.activity_date
          })

          if (isOnline) {
            toast.success(hasFollowUp ? '후속 조치 → 이슈 자동 등록됨!' : '활동 내역 → 이슈 등록됨!', {
              duration: 4000,
              icon: '✅'
            })
          } else {
            toast.success('활동과 이슈가 로컬에 저장되었습니다.', { duration: 5000, icon: '💾' })
          }
        } catch (issueError) {
          console.error('[AddActivityModal] Issue Registration Failed', issueError)
          toast.error(`이슈 등록 실패: ${issueError.message}`, { duration: 5000, icon: '❌' })
        }
      } else {
        if (isOnline) {
          toast.success('활동 내역이 추가되었습니다.', { duration: 3000, icon: '✅' })
        } else {
          toast.success('활동 내역이 로컬에 저장되었습니다.', { duration: 5000, icon: '💾' })
        }
      }

      // 등록 성공 후 모달 닫기 (useEffect에서 초기화 처리됨)
      onClose()
    } catch (error) {
      console.error('활동 등록 오류:', error)

      // 오프라인 상태이거나 네트워크 에러인 경우 특별 처리
      if (!isOnline || error.message?.includes('network') || error.message?.includes('fetch')) {
        toast.warning('오프라인 상태로 전환되었습니다. 데이터는 로컬에 저장되었으며, 연결 복구 시 자동으로 업로드됩니다.', {
          duration: 6000,
          icon: '💾'
        })
        // 오프라인 상태에서는 모달을 닫고, 데이터는 이미 로컬에 저장됨
        onClose()
      } else {
        toast.error(`활동 내역 등록 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`, {
          duration: 5000,
          icon: '❌'
        })
      }
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="활동 내역 추가" size="lg">
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="oem-label">
            CLIENT <span className="text-red-500">*</span>
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
            <label className="oem-label">
              ACTIVITY TYPE <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="oem-input"
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
            <label className="oem-label">
              STATUS <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="oem-input"
              required
            >
              <option value="완료">완료</option>
              <option value="진행중">진행중</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="oem-label">
              DATE <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={formData.activity_date}
              onChange={(e) => setFormData({ ...formData, activity_date: e.target.value })}
              className="oem-input"
              required
            />
          </div>
          <div>
            <label className="oem-label">
              TIME
            </label>
            <input
              type="time"
              value={formData.activity_time}
              onChange={(e) => setFormData({ ...formData, activity_time: e.target.value })}
              className="oem-input"
              placeholder="e.g. 14:00"
            />
          </div>
        </div>

        {/* 다음 일정 섹션 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="oem-label">
              Target Date
            </label>
            <input
              type="date"
              value={formData.next_action_date}
              onChange={(e) => setFormData({ ...formData, next_action_date: e.target.value })}
              className="oem-input"
            />
          </div>
          <div>
            <label className="oem-label">
              Action Detail
            </label>
            <input
              type="text"
              value={formData.next_action_detail}
              onChange={(e) => setFormData({ ...formData, next_action_detail: e.target.value })}
              className="oem-input"
              placeholder="e.g. Send Quotation"
            />
          </div>
        </div>

        {/* 참석자 입력 섹션 */}
        <div>
          <label className="oem-label">
            ATTENDEES
          </label>
          <div className="flex gap-2 mb-2">
            <input
              ref={attendeeInputRef}
              type="text"
              value={attendeeInput}
              onChange={(e) => setAttendeeInput(e.target.value)}
              onKeyDown={handleAttendeeKeyDown}
              className="flex-1 oem-input"
              placeholder="Type name and press Enter..."
            />
            <button
              type="button"
              onClick={handleAddAttendee}
              className="px-3 py-1.5 bg-oem-blue text-white border border-oem-blue rounded-sm hover:bg-blue-700 hover:border-blue-700 transition-all duration-200 flex items-center justify-center space-x-1 h-[34px]"
            >
              <Plus className="w-3 h-3" />
              <span>Add</span>
            </button>
          </div>
          {/* 참석자 태그 표시 */}
          {attendees.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3 bg-gray-50 border border-oem-border-color min-h-[50px] rounded-sm">
              {attendees.map((name, index) => (
                <div
                  key={index}
                  className="inline-flex items-center space-x-1 px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-sm text-xs font-bold"
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
            <label className="oem-label">
              DESCRIPTION <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={handleAIPolish}
              disabled={isAILoading || !formData.description.trim()}
              className="flex items-center space-x-1 px-2 py-1 text-[10px] font-bold text-oem-blue border border-oem-blue rounded-sm hover:bg-oem-blue hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAILoading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>PROCESSING...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3" />
                  <span>AI 다듬기</span>
                </>
              )}
            </button>
          </div>
          <textarea
            value={formData.description}
            onChange={handleDescriptionChange}
            rows={6}
            className="oem-input"
            placeholder="Enter activity details..."
            required
            disabled={isAILoading}
          />
          <p className="text-xs text-gray-500 mt-1">{charCount}/3000자</p>
        </div>

        {/* 이슈 등록 체크박스 */}
        <div className="flex items-center space-x-2 p-3 bg-gray-50 border border-oem-border rounded-sm">
          <input
            type="checkbox"
            id="registerAsIssue"
            checked={registerAsIssue}
            onChange={(e) => setRegisterAsIssue(e.target.checked)}
            className="w-4 h-4 text-oem-blue border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
          />
          <label htmlFor="registerAsIssue" className="text-sm font-bold text-oem-text-primary cursor-pointer uppercase">
            REGISTER AS ISSUE
          </label>
          <span className="text-xs text-oem-text-secondary ml-1">
            (Automatically adds this activity to the Issue Tracker)
          </span>
        </div>

        {registerAsIssue && (
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-sm">
            <p className="text-xs text-oem-blue font-medium">
              💡 This activity will be copied to the Issue Tracker with the same title and description.
            </p>
          </div>
        )}

        <div className="flex justify-end space-x-2 pt-4 px-0 border-t border-oem-border mt-6">
          <button
            type="button"
            onClick={onClose}
            className="oem-btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="oem-btn-primary"
          >
            Save
          </button>
        </div>
      </form>
    </Modal >
  )
}

export default AddActivityModal





