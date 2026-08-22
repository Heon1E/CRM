import React, { useState, useEffect, useRef } from 'react'
import Modal from './Modal'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { resolveSalesRep } from '../utils/salesRep'
import useEnterMove from '../hooks/useEnterMove'
// GoogleGenerativeAI SDK 대신 REST API 직접 호출 방식 사용
import { Sparkles, Loader2, X, Plus , Undo2} from 'lucide-react'
import ClientCombobox from './ClientCombobox'
import { showWarning, showSuccess, showError, showConfirm } from '../utils/alert'
import { parseDateForInput } from '../utils/formatters'

const EditActivityModal = ({ isOpen, onClose, activityId, onDelete }) => {
  // 모든 Hook 선언을 최상단에 배치
  const { activities, clients, updateActivity, deleteActivity, registerModal } = useData()
  // '누가 다녀왔는지'를 넣으려면 로그인한 사람을 알아야 한다
  const { user, salesRep: authSalesRep } = useAuth()
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

  // ... (상태 및 useEffect 등 로직은 그대로 유지 - 복사 필요)
  const [attendees, setAttendees] = useState([])
  const [attendeeInput, setAttendeeInput] = useState('')
  const [charCount, setCharCount] = useState(0)
  const [isAILoading, setIsAILoading] = useState(false)
  // 다듬기 전 원문. 모델이 사실을 바꿔 놓는 일이 실제로 있었으므로
  // 한 번에 되돌릴 길을 남긴다 (조용히 덮어쓰지 않는다).
  const [preAIText, setPreAIText] = useState(null)

  // activity가 변경되거나 모달이 닫힐 때 폼 초기화
  useEffect(() => {
    if (activity && activityId) {
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

      const userString = activity?.user || ''
      const attendeesArray = userString
        ? userString.split(',').map((name) => name.trim()).filter((name) => name.length > 0)
        : []
      setAttendees(attendeesArray)
      setAttendeeInput('')
    } else if (!isOpen) {
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

  useEnterMove({ formRef, enabled: isOpen })

  useEffect(() => {
    if (isOpen && registerModal) {
      const unregister = registerModal()
      return unregister
    }
  }, [isOpen, registerModal])

  if (!isOpen || !activityId || !activity) {
    return null
  }

  const handleAddAttendee = () => {
    const name = attendeeInput.trim()
    if (name && !attendees.includes(name)) {
      setAttendees([...attendees, name])
      setAttendeeInput('')
      setTimeout(() => {
        attendeeInputRef.current?.focus()
      }, 0)
    }
  }

  const handleRemoveAttendee = (index) => {
    setAttendees(attendees.filter((_, i) => i !== index))
  }

  const handleAttendeeKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
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

  // 다듬기는 서버(`/api/polish-note`)가 한다. 브라우저에서 직접 Gemini를 부르면
  // 키가 배포 번들에 박힌다 — 자세한 사정은 그 파일 머리말에 적어 두었다.
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
      await updateActivity(activityId, {
        ...formData,
        description: mergedDescription,
        user_name: myRep,
        user: attendees.join(', '),
      })
      await showSuccess('활동 내역이 수정되었습니다.')
      onClose()
    } catch (error) {
      console.error('활동 수정 중 오류:', error)
      await showError('활동 내역 수정 중 오류가 발생했습니다.')
    }
  }

  const handleDeleteWrap = async () => {
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
    <Modal isOpen={isOpen} onClose={onClose} title="활동 수정" size="lg">
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 text-oem-text-primary">
        <div>
          <label className="block text-xs font-bold text-oem-text-secondary uppercase mb-1">
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
            <label className="block text-xs font-bold text-oem-text-secondary uppercase mb-1">
              활동 유형 <span className="text-[color:var(--danger)]">*</span>
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full px-3 py-2 border border-oem-border rounded-sm bg-white focus:border-oem-blue focus:ring-1 focus:ring-oem-blue outline-none text-sm transition-colors"
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
            <label className="block text-xs font-bold text-oem-text-secondary uppercase mb-1">
              상태 <span className="text-[color:var(--danger)]">*</span>
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full px-3 py-2 border border-oem-border rounded-sm bg-white focus:border-oem-blue focus:ring-1 focus:ring-oem-blue outline-none text-sm transition-colors"
              required
            >
              <option value="완료">완료 (Completed)</option>
              <option value="진행중">진행중 (In Progress)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-oem-text-secondary uppercase mb-1">
            날짜 <span className="text-[color:var(--danger)]">*</span>
          </label>
          <input
            type="date"
            value={formData.activity_date}
            onChange={(e) => setFormData({ ...formData, activity_date: e.target.value })}
            className="w-full px-3 py-2 border border-oem-border rounded-sm focus:border-oem-blue focus:ring-1 focus:ring-oem-blue outline-none text-sm text-oem-text-primary placeholder-gray-300"
            required
          />
        </div>

        {/* 다음 일정 */}
        <div className="p-3 bg-oem-bg-app border border-oem-border rounded-sm">
          <p className="text-[10px] font-bold text-oem-text-secondary uppercase mb-3 flex items-center gap-1">
            <span className="w-1 h-3 bg-oem-blue inline-block"></span>
            Follow-up Action
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-oem-text-secondary mb-1">
                Target Date
              </label>
              <input
                type="date"
                value={formData.next_action_date}
                onChange={(e) => setFormData({ ...formData, next_action_date: e.target.value })}
                className="w-full px-2 py-1.5 border border-oem-border rounded-sm text-sm focus:border-oem-blue outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-oem-text-secondary mb-1">
                Action Detail
              </label>
              <input
                type="text"
                value={formData.next_action_detail}
                onChange={(e) => setFormData({ ...formData, next_action_detail: e.target.value })}
                className="w-full px-2 py-1.5 border border-oem-border rounded-sm text-sm focus:border-oem-blue outline-none"
                placeholder="예: 견적서 보내기"
              />
            </div>
          </div>
        </div>

        {/* 참석자 */}
        <div>
          <label className="block text-xs font-bold text-oem-text-secondary uppercase mb-1">
            ATTENDEES
          </label>
          <div className="flex gap-2 mb-2">
            <input
              ref={attendeeInputRef}
              type="text"
              value={attendeeInput}
              onChange={(e) => setAttendeeInput(e.target.value)}
              onKeyDown={handleAttendeeKeyDown}
              className="flex-1 px-3 py-2 border border-oem-border rounded-sm focus:border-oem-blue focus:ring-1 focus:ring-oem-blue outline-none text-sm placeholder-gray-300"
              placeholder="이름을 넣고 Enter"
            />
            <button
              type="button"
              onClick={handleAddAttendee}
              className="bg-white border border-oem-border hover:bg-gray-50 text-oem-text-primary px-3 py-2 text-xs font-bold rounded-sm flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              ADD
            </button>
          </div>
          {attendees.length > 0 && (
            <div className="flex flex-wrap gap-2 p-2 min-h-[40px]">
              {attendees.map((name, index) => (
                <div
                  key={index}
                  className="inline-flex items-center space-x-1 px-2 py-1 bg-oem-blue/10 text-oem-blue border border-oem-blue/20 rounded-sm text-xs font-bold"
                >
                  <span>{name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttendee(index)}
                    className="hover:text-[color:var(--danger)] transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 내용 */}
        <div>
          <div className="flex items-center justify-between mb-1 gap-2">
            <label className="block text-xs font-bold text-oem-text-secondary uppercase">
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
              className="flex items-center space-x-1.5 px-2 py-1 text-[10px] font-bold text-oem-blue border border-oem-blue rounded-sm hover:bg-oem-blue hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="w-full px-3 py-2.5 border border-oem-border rounded-sm focus:border-oem-blue focus:ring-1 focus:ring-oem-blue outline-none text-sm leading-relaxed resize-none placeholder-gray-300"
            placeholder="무엇을 하고 왔는지 적습니다"
            required
            disabled={isAILoading}
          />
          <div className="mt-1 text-right text-[10px] text-oem-text-secondary">
            {charCount}/3000
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="flex justify-between pt-4 border-t border-oem-border mt-6">
          <button
            type="button"
            onClick={handleDeleteWrap}
            className="px-4 py-2 text-xs font-bold text-[color:var(--danger)] hover:bg-red-50 border border-transparent hover:border-red-200 rounded-sm transition-colors"
          >
            DELETE
          </button>
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-oem-text-primary bg-white border border-oem-border hover:bg-gray-50 rounded-sm transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-6 py-2 text-xs font-bold text-white bg-oem-blue hover:bg-oem-blue-dark rounded-sm shadow-sm transition-colors"
            >
              저장
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

export default EditActivityModal





