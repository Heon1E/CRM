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
    <div className="space-y-3">
      {/* Header removed as it will be handled by Parent Panel */}

      <div className="flex justify-between items-center mb-2 px-1">
        <h4 className="text-[11px] font-bold text-oem-text-secondary uppercase tracking-tight">Active Issues ({activeIssues.length})</h4>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="oem-btn-secondary px-2 py-0.5 text-[10px] flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          <span>ADD_ISSUE</span>
        </button>
      </div>

      {activeIssues.length > 0 ? (
        <div className={`space-y-2 ${maxItems ? 'max-h-96 overflow-y-auto pr-1' : ''}`}>
          {activeIssues.map((issue) => {
            // 경과 일수 계산
            const baseDate = issue.date || issue.created_at
            const daysDiff = baseDate
              ? Math.floor((new Date() - new Date(baseDate)) / (1000 * 60 * 60 * 24))
              : 0

            return (
              <div
                key={issue.id}
                className="bg-white border border-oem-border rounded-sm p-3 hover:border-oem-blue transition-colors group relative"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold border ${issue.status === '완료' ? 'bg-gray-100 text-gray-500 border-gray-200' :
                          issue.status === '진행' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                            'bg-yellow-50 text-amber-600 border-amber-100'
                        }`}>
                        {issue.status}
                      </span>
                      {issue.target_date && (
                        <span className="text-[10px] text-oem-text-secondary">
                          D-{Math.ceil((new Date(issue.target_date) - new Date()) / (1000 * 60 * 60 * 24))}
                        </span>
                      )}
                      {daysDiff > 0 && (
                        <span className="text-[10px] text-oem-text-secondary">
                          ({daysDiff}d ago)
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-oem-text-primary text-xs mb-1 break-words group-hover:text-oem-blue transition-colors">{issue.title}</h4>
                    {issue.content && (
                      <p className="text-[11px] text-gray-600 mb-1.5 line-clamp-2 break-words leading-relaxed">
                        {issue.content}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-400">
                      Registered: {new Date(issue.created_at || issue.date).toLocaleDateString('ko-KR')}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 ml-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingIssueId(issue.id)
                      }}
                      className="p-1 text-gray-400 hover:text-oem-blue hover:bg-blue-50 rounded"
                      title="Edit"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-6 border border-dashed border-gray-200 rounded-sm bg-gray-50">
          <p className="text-[11px] text-gray-400 font-medium">No active issues found.</p>
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



