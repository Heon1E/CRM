import React, { useState, useEffect, useRef } from 'react'
import Modal from './Modal'
import { useData } from '../contexts/DataContext'
import useEnterMove from '../hooks/useEnterMove'
import { showWarning, showSuccess, showError, showConfirm } from '../utils/alert'

const EditIssueModal = ({ isOpen, onClose, issueId, onDelete }) => {
  const { issues, updateIssue, deleteIssue } = useData()
  const issue = issues?.find((i) => i.id === issueId)
  const formRef = useRef(null)

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    target_date: '',
    status: '등록',
  })

  const [charCount, setCharCount] = useState(0)

  useEffect(() => {
    if (issue && issueId) {
      const parseDate = (dateValue) => {
        if (!dateValue) return ''
        if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
          return dateValue
        }
        try {
          const date = new Date(dateValue)
          if (isNaN(date.getTime())) return ''
          const year = date.getFullYear()
          const month = String(date.getMonth() + 1).padStart(2, '0')
          const day = String(date.getDate()).padStart(2, '0')
          return `${year}-${month}-${day}`
        } catch (error) {
          return ''
        }
      }

      setFormData({
        title: issue?.title || '',
        content: issue?.content || '',
        target_date: parseDate(issue?.target_date),
        status: issue?.status || '등록',
      })
      setCharCount(issue?.content?.length || 0)
    } else if (!isOpen) {
      setFormData({
        title: '',
        content: '',
        target_date: '',
        status: '등록',
      })
      setCharCount(0)
    }
  }, [issue, issueId, isOpen])

  useEnterMove({ formRef, enabled: isOpen })

  if (!isOpen || !issueId || !issue) {
    return null
  }

  const handleContentChange = (e) => {
    const value = e.target.value
    if (value.length <= 1000) {
      setFormData({ ...formData, content: value })
      setCharCount(value.length)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.title.trim()) {
      await showWarning('제목을 입력해주세요.')
      return
    }

    try {
      // date (등록일): 기존 issue의 date를 유지하거나 오늘 날짜로 설정 (NOT NULL 컬럼)
      let dateValue = issue?.date || ''

      // dateValue가 없으면 오늘 날짜로 설정
      if (!dateValue || dateValue.trim() === '') {
        const today = new Date()
        const year = today.getFullYear()
        const month = String(today.getMonth() + 1).padStart(2, '0')
        const day = String(today.getDate()).padStart(2, '0')
        dateValue = `${year}-${month}-${day}`
      } else {
        // YYYY-MM-DD 형식으로 변환
        if (typeof dateValue === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
          try {
            const date = new Date(dateValue)
            if (!isNaN(date.getTime())) {
              const year = date.getFullYear()
              const month = String(date.getMonth() + 1).padStart(2, '0')
              const day = String(date.getDate()).padStart(2, '0')
              dateValue = `${year}-${month}-${day}`
            }
          } catch (error) {
            console.warn('등록일 변환 실패, 오늘 날짜 사용:', error)
            const today = new Date()
            const year = today.getFullYear()
            const month = String(today.getMonth() + 1).padStart(2, '0')
            const day = String(today.getDate()).padStart(2, '0')
            dateValue = `${year}-${month}-${day}`
          }
        }
      }

      // target_date (목표일): 사용자가 선택한 날짜 또는 null
      let targetDateValue = formData.target_date || formData.targetDate || ''

      // target_date가 있으면 YYYY-MM-DD 형식으로 변환
      if (targetDateValue && targetDateValue.trim() !== '') {
        // 이미 YYYY-MM-DD 형식인지 확인
        if (typeof targetDateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(targetDateValue)) {
          targetDateValue = targetDateValue
        } else {
          // Date 객체나 다른 형식인 경우 변환
          try {
            const date = new Date(targetDateValue)
            if (!isNaN(date.getTime())) {
              const targetYear = date.getFullYear()
              const targetMonth = String(date.getMonth() + 1).padStart(2, '0')
              const targetDay = String(date.getDate()).padStart(2, '0')
              targetDateValue = `${targetYear}-${targetMonth}-${targetDay}`
            } else {
              targetDateValue = null // 유효하지 않은 날짜는 null
            }
          } catch (error) {
            console.warn('목표일 변환 실패:', error)
            targetDateValue = null
          }
        }
      } else {
        targetDateValue = null // 목표일이 없으면 null
      }

      // payload 생성: DB 컬럼명(snake_case)에 맞게 변환
      const payload = {
        title: formData.title.trim(),
        content: formData.content || '',
        target_date: targetDateValue, // 목표일 (사용자가 선택한 날짜 또는 null)
        status: formData.status || '등록', // 상태 필드 (DB의 status 컬럼과 정확히 매핑)
      }

      // date 필드는 등록일이므로 수정 시 변경하지 않음 (DB에서 자동으로 updated_at이 갱신됨)

      await updateIssue(issueId, payload)
      await showSuccess('ISSUE가 수정되었습니다.')
      onClose()
    } catch (error) {
      console.error('이슈 수정 중 오류:', error)
      await showError('이슈 수정 중 오류가 발생했습니다.')
    }
  }

  const handleDelete = async () => {
    const confirmed = await showConfirm(
      '이 이슈 정보가 영구적으로 삭제됩니다.',
      '정말 삭제하시겠습니까?',
      '삭제',
      '취소'
    )
    if (!confirmed) {
      return
    }

    try {
      await deleteIssue(issueId)
      await showSuccess('ISSUE가 삭제되었습니다.')
      onClose()
    } catch (error) {
      console.error('ISSUE 삭제 중 오류:', error)
      await showError('ISSUE 삭제 중 오류가 발생했습니다.')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="이슈 수정" size="lg">
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 px-1">
        <div>
          <label className="block text-[11px] font-bold text-oem-text-secondary uppercase tracking-tight mb-1">
            TITLE <span className="text-[color:var(--danger)]">*</span>
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="oem-input w-full"
            required
            maxLength={200}
            placeholder="Issue Title"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-oem-text-secondary uppercase tracking-tight mb-1">
            CONTENT
          </label>
          <textarea
            value={formData.content}
            onChange={handleContentChange}
            rows={6}
            className="oem-input w-full resize-none"
            placeholder="Describe the issue..."
            maxLength={1000}
          />
          <div className="mt-1 text-right text-[10px] text-gray-500 font-mono">
            {charCount}/1000
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-oem-text-secondary uppercase tracking-tight mb-1">
              TARGET DATE
            </label>
            <input
              type="date"
              value={formData.target_date}
              onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
              className="oem-input w-full"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-oem-text-secondary uppercase tracking-tight mb-1">
              STATUS <span className="text-[color:var(--danger)]">*</span>
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="oem-input w-full"
              required
            >
              <option value="등록">Registered</option>
              <option value="진행">In Progress</option>
              <option value="완료">Completed</option>
            </select>
          </div>
        </div>

        <div className="flex justify-between pt-4 border-t border-oem-border mt-2">
          <button
            type="button"
            onClick={handleDelete}
            className="px-4 py-2 bg-red-50 text-[color:var(--danger)] border border-red-200 rounded hover:bg-red-100 transition-colors text-[11px] font-bold uppercase"
          >
            DELETE_ISSUE
          </button>
          <div className="space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="oem-btn-secondary px-4 py-2"
            >
              취소
            </button>
            <button
              type="submit"
              className="oem-btn-primary px-4 py-2"
            >
              UPDATE
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

export default EditIssueModal



