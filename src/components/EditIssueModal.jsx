import React, { useState, useEffect, useRef } from 'react'
import Modal from './Modal'
import { useData } from '../contexts/DataContext'
import useEnterMove from '../hooks/useEnterMove'

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
      alert('제목을 입력해주세요.')
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
      
      // payload 생성: date와 target_date 컬럼에 명시적으로 할당
      const payload = {
        title: formData.title.trim(),
        content: formData.content || '',
        date: dateValue, // 등록일 (NOT NULL 컬럼) - 기존 date 유지 또는 오늘 날짜
        target_date: targetDateValue, // 목표일 (사용자가 선택한 날짜 또는 null)
        status: formData.status || '등록',
      }
      
      // 전송 직전에 데이터 확인
      console.log('ISSUE 수정 전송할 데이터:', payload)
      
      await updateIssue(issueId, payload)
      alert('ISSUE가 수정되었습니다.')
      onClose()
    } catch (error) {
      console.error('ISSUE 수정 중 오류:', error)
      alert('ISSUE 수정 중 오류가 발생했습니다.')
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('정말로 이 ISSUE를 삭제하시겠습니까?')) {
      return
    }

    try {
      await deleteIssue(issueId)
      alert('ISSUE가 삭제되었습니다.')
      onClose()
    } catch (error) {
      console.error('ISSUE 삭제 중 오류:', error)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="ISSUE 수정" size="lg">
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            제목 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="input-field"
            required
            maxLength={200}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            내용
          </label>
          <textarea
            value={formData.content}
            onChange={handleContentChange}
            rows={6}
            className="input-field"
            placeholder="ISSUE 내용을 입력하세요 (최대 1000자)"
            maxLength={1000}
          />
          <div className="mt-1 text-right text-sm text-gray-500">
            {charCount}/1000
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              목표일
            </label>
            <input
              type="date"
              value={formData.target_date}
              onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
              className="input-field"
            />
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
              <option value="등록">등록</option>
              <option value="진행">진행</option>
              <option value="완료">완료</option>
            </select>
          </div>
        </div>

        <div className="flex justify-between pt-4">
          <button
            type="button"
            onClick={handleDelete}
            className="px-4 py-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all duration-200 font-semibold shadow-sm"
          >
            삭제
          </button>
          <div className="space-x-3">
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
        </div>
      </form>
    </Modal>
  )
}

export default EditIssueModal
