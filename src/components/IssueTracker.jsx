import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Edit, Trash2, AlertCircle } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import AddIssueModal from './AddIssueModal'
import EditIssueModal from './EditIssueModal'

const IssueTracker = ({ maxItems = null }) => {
  const { issues, loading, updateIssue } = useData()
  const navigate = useNavigate()
  const [editingIssueId, setEditingIssueId] = useState(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  if (loading) {
    return <div className="text-gray-300 text-sm">로딩 중...</div>
  }

  // 완료된 건은 필터링 (대시보드에서만)
  const activeIssues = maxItems
    ? issues.filter((issue) => issue.status !== '완료').slice(0, maxItems)
    : issues.filter((issue) => issue.status !== '완료')

  // 색상 코딩 함수 (date 기준일과 오늘 날짜 비교)
  const getIssueColor = (issue) => {
    const baseDate = issue.date || issue.created_at
    if (!baseDate) {
      return 'bg-[#1E1E1E] border-gray-800'
    }

    const now = new Date()
    const baseDateObj = new Date(baseDate)
    const daysDiff = Math.floor((now - baseDateObj) / (1000 * 60 * 60 * 24))

    if (daysDiff >= 14) {
      return 'bg-[#1E1E1E] border-gray-700'
    }

    if (daysDiff >= 7) {
      return 'bg-[#1E1E1E] border-gray-700'
    }

    return 'bg-[#1E1E1E] border-gray-800'
  }

  // 상태 색상
  const getStatusColor = (status) => {
    switch (status) {
      case '완료':
        return 'bg-[#1E1E1E] text-gray-300 border border-gray-800'
      case '진행':
        return 'bg-[#1E1E1E] text-gray-300 border border-gray-800'
      case '등록':
        return 'bg-[#1E1E1E] text-gray-300 border border-gray-800'
      default:
        return 'bg-[#1E1E1E] text-gray-300 border border-gray-800'
    }
  }

  // 상태 변경 핸들러 (리스트에서 바로 변경)
  const handleStatusChange = async (issueId, newStatus) => {
    try {
      await updateIssue(issueId, { 
        status: newStatus,
        updated_at: new Date().toISOString() // 상태 변경 시 업데이트 시간 갱신
      })
      // 완료로 변경하면 대시보드에서 즉시 사라짐 (필터링에 의해)
    } catch (error) {
      console.error('상태 변경 중 오류:', error)
      alert('상태 변경 중 오류가 발생했습니다.')
    }
  }

  return (
    <div className="bg-[#1E1E1E] rounded-xl border border-gray-800 p-5 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate('/issues')}
          className="text-lg md:text-xl font-semibold text-white flex items-center space-x-2 hover:text-white/80 transition-colors cursor-pointer"
        >
          <AlertCircle className="w-5 h-5 text-gray-300" />
          <span>ISSUE 트래커</span>
        </button>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn-primary px-3 py-1.5 flex items-center space-x-1 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          <span>추가</span>
        </button>
      </div>

      {activeIssues.length > 0 ? (
        <div className={`space-y-3 ${maxItems ? 'max-h-96 overflow-y-auto pr-2' : ''}`}>
          {activeIssues.map((issue) => {
            // 경과 일수 계산 (시각적 표시용)
            const baseDate = issue.date || issue.created_at
            const daysDiff = baseDate 
              ? Math.floor((new Date() - new Date(baseDate)) / (1000 * 60 * 60 * 24))
              : 0
            
            return (
              <div
                key={issue.id}
                className={`border rounded-lg p-4 transition-all duration-200 ${getIssueColor(issue)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-2 flex-wrap">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(issue.status)}`}>
                        {issue.status}
                      </span>
                      {issue.target_date && (
                      <span className="text-xs text-gray-300">
                          목표일: {new Date(issue.target_date).toLocaleDateString('ko-KR')}
                        </span>
                      )}
                      {daysDiff > 0 && (
                      <span className="text-xs text-gray-300">
                          ({daysDiff}일 경과)
                        </span>
                      )}
                    </div>
                    <h4 className="font-semibold text-white mb-1 break-words">{issue.title}</h4>
                    {issue.content && (
                      <p className="text-sm text-gray-300 mb-2 line-clamp-2 break-words">
                        {issue.content}
                      </p>
                    )}
                    <p className="text-xs text-gray-300">
                      등록일: {new Date(issue.created_at || issue.date).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
                    {/* 상태 변경 드롭다운 */}
                    <select
                      value={issue.status}
                      onChange={(e) => {
                        e.stopPropagation()
                        handleStatusChange(issue.id, e.target.value)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className={`px-2 py-1 rounded text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-white/20 cursor-pointer ${getStatusColor(issue.status)}`}
                    >
                      <option value="등록">등록</option>
                      <option value="진행">진행</option>
                      <option value="완료">완료</option>
                    </select>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingIssueId(issue.id)
                      }}
                      className="text-gray-300 hover:text-white transition-colors"
                      title="수정"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-300 text-sm">
          등록된 ISSUE가 없습니다.
        </div>
      )}

      {/* Modals */}
      <AddIssueModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
      <EditIssueModal
        isOpen={editingIssueId !== null}
        onClose={() => setEditingIssueId(null)}
        issueId={editingIssueId}
      />
    </div>
  )
}

export default IssueTracker



