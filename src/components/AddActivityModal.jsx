import React, { useState, useRef, useEffect } from 'react'
import Modal from './Modal'
import { todayYmd } from '../utils/day'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { resolveSalesRep } from '../utils/salesRep'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import useEnterMove from '../hooks/useEnterMove'
// GoogleGenerativeAI SDK 대신 REST API 직접 호출 방식 사용
import { Sparkles, Loader2, X, Plus , Undo2} from 'lucide-react'
import ClientCombobox from './ClientCombobox'
import toast from 'react-hot-toast'
import { showWarning, showError } from '../utils/alert'

const AddActivityModal = ({ isOpen, onClose, initialDate = null }) => {
  // 모든 Hook 선언을 최상단에 배치 (React Hooks 규칙 준수)
  const { clients, addActivity, addIssue, registerModal } = useData()
  // '누가 다녀왔는지'를 넣으려면 로그인한 사람을 알아야 한다
  const { user, salesRep: authSalesRep } = useAuth()
  const { isOnline } = useOnlineStatus()
  const formRef = useRef(null)
  const attendeeInputRef = useRef(null)

  const [formData, setFormData] = useState({
    clientId: '',
    type: '미팅',
    activity_date: todayYmd(),
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
  // 다듬기 전 원문. 모델이 사실을 바꿔 놓는 일이 실제로 있었으므로
  // 한 번에 되돌릴 길을 남긴다 (조용히 덮어쓰지 않는다).
  const [preAIText, setPreAIText] = useState(null)

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
        activity_date: todayYmd(),
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
  /*
   * 글 다듬기 — **서버(`/api/polish-note`)를 거친다.**
   *
   * 예전에는 여기서 브라우저가 직접 Gemini를 불렀다
   * (`import.meta.env.VITE_GEMINI_API_KEY`). 그런데 배포본에는 그 값이 없어서
   * 단추를 누르면 'API Key가 설정되지 않았습니다'만 떴다 — **아무도 못 쓰는
   * 기능이었다.** 값을 넣었으면 더 나빴다: `VITE_` 접두어가 붙은 값은 배포된
   * JS에서 문자열로 그대로 추출되므로 남이 우리 할당량을 쓸 수 있다.
   * 그래서 `analyze-erp`·`client-briefing`과 같이 서버로 옮겼다.
   */
  const handleAIPolish = async () => {
    const currentText = formData.description.trim()
    if (!currentText) {
      await showWarning('정리할 내용을 먼저 입력해주세요.')
      return
    }

    setIsAILoading(true)
    try {
      const res = await fetch('/api/polish-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: currentText }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        await showError(data.message || '글 다듬기에 실패했습니다. 원문은 그대로 남아 있습니다.')
        return
      }
      // 원문을 덮어쓰므로 길이는 잘라 둔다 (DB 칸과 화면 모두 감당할 크기로)
      const text = String(data.text || '')
      if (!text) { await showError('결과가 비어 있습니다. 원문은 그대로 남아 있습니다.'); return }
      setPreAIText(currentText)
      setFormData({ ...formData, description: text.length > 3000 ? text.slice(0, 3000) : text })
    } catch (e) {
      console.error('[handleAIPolish]', e)
      await showError('글 다듬기에 실패했습니다. 원문은 그대로 남아 있습니다.')
    } finally {
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
      /*
       * **`user_name`은 '누가 다녀왔는가'다 — 상대측 참석자가 아니다.**
       *
       * 예전에는 참석자 목록을 그대로 `user`로 넘겼고, `addActivity`가 그 값을
       * `user_name`에 넣은 뒤 **거래처의 담당자가 비어 있으면 그 이름으로
       * 채웠다.** 즉 참석자를 적는 순간 `clients.sales_rep`에 **고객사 직원
       * 이름**이 우리 담당자로 박힌다. 담당자는 KPI·영업 코치·거래처 정렬의
       * 기준이라 한 번 틀어지면 여러 화면이 함께 어긋난다.
       * (다행히 아직 그런 값은 없다 — 담당 지정된 86곳 전부 우리 영업사원이다.)
       *
       * 지금은 로그인한 사람을 넣는다. 참석자는 지울 수 없는 정보이므로
       * 내용 끝에 `[참석] …`으로 남긴다 — `activities`에 참석자 칸이 없다.
       */
      const myRep = authSalesRep || resolveSalesRep(user) || null
      const attendeeLine = attendees.length > 0 ? `[참석] ${attendees.join(', ')}` : ''
      const mergedDescription = [formData.description, attendeeLine].filter(Boolean).join('\n')

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
        description: mergedDescription,
        user_name: myRep,
        user: attendees.join(', '),   // 화면 표시용 (DB의 user_name과 다르다)
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
            거래처 <span className="text-[color:var(--danger)]">*</span>
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
              활동 유형 <span className="text-[color:var(--danger)]">*</span>
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
              상태 <span className="text-[color:var(--danger)]">*</span>
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
              날짜 <span className="text-[color:var(--danger)]">*</span>
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
              시각
            </label>
            <input
              type="time"
              value={formData.activity_time}
              onChange={(e) => setFormData({ ...formData, activity_time: e.target.value })}
              className="oem-input"
              placeholder="예: 14:00"
            />
          </div>
        </div>

        {/* 다음 일정 섹션 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="oem-label">
              다음 조치일
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
              다음에 할 일
            </label>
            <input
              type="text"
              value={formData.next_action_detail}
              onChange={(e) => setFormData({ ...formData, next_action_detail: e.target.value })}
              className="oem-input"
              placeholder="예: 견적서 보내기"
            />
          </div>
        </div>

        {/* 참석자 입력 섹션 */}
        <div>
          <label className="oem-label">
            참석자
          </label>
          <div className="flex gap-2 mb-2">
            <input
              ref={attendeeInputRef}
              type="text"
              value={attendeeInput}
              onChange={(e) => setAttendeeInput(e.target.value)}
              onKeyDown={handleAttendeeKeyDown}
              className="flex-1 oem-input"
              placeholder="이름을 넣고 Enter"
            />
            <button
              type="button"
              onClick={handleAddAttendee}
              className="px-3 py-1.5 bg-oem-blue text-white border border-oem-blue rounded-sm hover:bg-oem-blue-dark hover:border-oem-blue transition-all duration-200 flex items-center justify-center space-x-1 h-[34px]"
            >
              <Plus className="w-3 h-3" />
              <span>추가</span>
            </button>
          </div>
          {/* 참석자 태그 표시 */}
          {attendees.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3 bg-gray-50 border border-oem-border min-h-[50px] rounded-sm">
              {attendees.map((name, index) => (
                <div
                  key={index}
                  className="inline-flex items-center space-x-1 px-2 py-1 bg-oem-grey-light text-oem-blue border border-oem-border rounded-sm text-xs font-bold"
                >
                  <span>{name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttendee(index)}
                    className="ml-1 hover:bg-oem-grey-light rounded-full p-0.5 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1 gap-2">
            <label className="oem-label">
              내용 <span className="text-[color:var(--danger)]">*</span>
            </label>
            {preAIText !== null && !isAILoading && (
              <button
                type="button"
                onClick={() => { setFormData((f) => ({ ...f, description: preAIText })); setPreAIText(null) }}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-[color:var(--text-secondary)] border border-oem-border rounded-sm hover:bg-oem-grey-light"
              >
                <Undo2 className="w-3 h-3" />
                <span>원문으로</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleAIPolish}
              disabled={isAILoading || !formData.description.trim()}
              className="flex items-center space-x-1 px-2 py-1 text-[10px] font-bold text-oem-blue border border-oem-blue rounded-sm hover:bg-oem-blue hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAILoading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>다듬는 중…</span>
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
            placeholder="무엇을 하고 왔는지 적습니다"
            required
            disabled={isAILoading}
          />
          <p className="text-xs text-gray-500 mt-1">{charCount}/3000자</p>
        </div>

        {/* 이슈 등록 체크박스 */}
        <div className="flex items-center gap-1 p-3 bg-gray-50 border border-oem-border rounded-sm">
          {/* 네이티브 체크박스는 `padding`을 무시한다(Chrome). 누르는 자리는
              감싼 라벨(`.tap-box`, 44x44)로 넓힌다 — 폰에서 22px짜리 네모를
              손가락으로 맞추기 어렵다. */}
          <label htmlFor="registerAsIssue" className="tap-box" aria-label="이슈로 등록">
            <input
              type="checkbox"
              id="registerAsIssue"
              checked={registerAsIssue}
              onChange={(e) => setRegisterAsIssue(e.target.checked)}
              className="w-4 h-4 text-oem-blue border-gray-300 rounded focus:ring-oem-blue cursor-pointer"
            />
          </label>
          <label htmlFor="registerAsIssue" className="text-sm font-bold text-oem-text-primary cursor-pointer">
            이슈로도 등록
          </label>
          <span className="text-xs text-oem-text-secondary ml-1">
            (Automatically adds this activity to the Issue Tracker)
          </span>
        </div>

        {registerAsIssue && (
          <div className="p-3 bg-oem-grey-light border border-oem-border rounded-sm">
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
          >취소</button>
          <button
            type="submit"
            className="oem-btn-primary"
          >
            저장
          </button>
        </div>
      </form>
    </Modal >
  )
}

export default AddActivityModal





