import React, { useState, useRef } from 'react'
import Modal from './Modal'
import { useData } from '../contexts/DataContext'
import useEnterMove from '../hooks/useEnterMove'
import { showWarning, showSuccess, showError } from '../utils/alert'

const AddIssueModal = ({ isOpen, onClose }) => {
  const { addIssue } = useData()
  const formRef = useRef(null)

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    target_date: '',
    status: '등록',
  })

  const [charCount, setCharCount] = useState(0)

  useEnterMove({ formRef, enabled: isOpen })

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
      // date (등록일): 항상 오늘 날짜로 설정 (NOT NULL 컬럼)
      const today = new Date()
      const year = today.getFullYear()
      const month = String(today.getMonth() + 1).padStart(2, '0')
      const day = String(today.getDate()).padStart(2, '0')
      const dateValue = `${year}-${month}-${day}` // 등록일은 항상 오늘

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

      // payload 생성: date와 target_date 컬럼에 명시적으로 할당
      const payload = {
        title: formData.title.trim(),
        content: formData.content || '',
        date: dateValue, // 등록일 (NOT NULL 컬럼) - 항상 오늘 날짜
        target_date: targetDateValue, // 목표일 (사용자가 선택한 날짜 또는 null)
        status: formData.status || '등록',
      }

      // 전송 직전에 데이터 확인

      await addIssue(payload)
      await showSuccess('ISSUE가 추가되었습니다.')
      setFormData({
        title: '',
        content: '',
        target_date: '',
        status: '등록',
      })
      setCharCount(0)
      onClose()
    } catch (error) {
      console.error('ISSUE 추가 중 오류:', error)
      await showError('ISSUE 추가 중 오류가 발생했습니다.')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="ISSUE 추가" size="lg">
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 px-1">
        <div>
          <label className="block text-[11px] font-bold text-oem-text-secondary uppercase tracking-tight mb-1">
            TITLE <span className="text-red-500">*</span>
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
          <div className="mt-1 text-right text-[10px] text-gray-400 font-mono">
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
              STATUS <span className="text-red-500">*</span>
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

        <div className="flex justify-end space-x-2 pt-4 border-t border-oem-border mt-2">
          <button
            type="button"
            onClick={onClose}
            className="oem-btn-secondary px-4 py-2"
          >
            CANCEL
          </button>
          <button
            type="submit"
            className="oem-btn-primary px-4 py-2"
          >
            SAVE ISSUE
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default AddIssueModal



