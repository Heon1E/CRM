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
    return <div className="text-gray-500 text-sm">로딩 중...</div>
  }

  // 완료된 건은 필터링 (대시보드에서만)
  const activeIssues = maxItems
    ? issues.filter((issue) => issue.status !== '완료').slice(0, maxItems)
    : issues.filter((issue) => issue.status !== '완료')

  // 상태 변경 핸들러 (리스트에서 바로 변경)
  const handleStatusChange = async (issueId, newStatus) => {
    try {
      await updateIssue(issueId, {
        status: newStatus,
        updated_at: new Date().toISOString() // 상태 변경 시 업데이트 시간 갱신
      })
    } catch (error) {
      console.error('상태 변경 중 오류:', error)
      alert('상태 변경 중 오류가 발생했습니다.')
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center mb-3 px-1">
        <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Active Issues ({activeIssues.length})</h4>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="bg-white border border-gray-300 text-gray-600 hover:text-oem-red hover:border-oem-red px-2 py-1 rounded-sm text-[10px] font-bold flex items-center gap-1 transition-all shadow-sm"
        >
          <Plus className="w-3 h-3" />
          <span>새 이슈</span>
        </button>
      </div>

      {activeIssues.length > 0 ? (
        <div className={`space-y-0 divide-y divide-gray-100 border border-gray-100 rounded-sm bg-white ${maxItems ? 'max-h-96' : ''}`}>
          {activeIssues.map((issue) => {
            // 경과 일수 계산
            const baseDate = issue.date || issue.created_at
            const daysDiff = baseDate
              ? Math.floor((new Date() - new Date(baseDate)) / (1000 * 60 * 60 * 24))
              : 0

            return (
              <div
                key={issue.id}
                className="p-3 hover:bg-gray-50 transition-colors group relative"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-1.5 py-0.5 rounded-[2px] text-[9px] font-bold border uppercase tracking-tight ${issue.status === '완료' ? 'bg-gray-100 text-gray-500 border-gray-200' :
                        issue.status === '진행' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                          'bg-amber-50 text-amber-700 border-amber-100'
                        }`}>
                        {issue.status}
                      </span>
                      {issue.target_date && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-sm border ${Math.ceil((new Date(issue.target_date) - new Date()) / (1000 * 60 * 60 * 24)) <= 3 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-gray-50 text-gray-500 border-gray-100'
                          }`}>
                          D-{Math.ceil((new Date(issue.target_date) - new Date()) / (1000 * 60 * 60 * 24))}
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-gray-800 text-xs mb-1 break-words group-hover:text-oem-red transition-colors leading-tight">{issue.title}</h4>
                    <p className="text-[11px] text-gray-500 line-clamp-1">
                      {new Date(issue.created_at || issue.date).toLocaleDateString()}
                    </p>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingIssueId(issue.id)
                    }}
                    className="p-1.5 text-gray-500 hover:text-oem-blue hover:bg-blue-50 rounded-sm transition-all"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-6 border border-dashed border-gray-200 rounded-sm bg-gray-50">
          <p className="text-[11px] text-gray-500 font-medium">No active issues found.</p>
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



