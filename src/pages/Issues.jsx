import React, { useState } from 'react'
import { Plus, Edit, Trash2, AlertCircle } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import AddIssueModal from '../components/AddIssueModal'
import EditIssueModal from '../components/EditIssueModal'
import { showConfirm, showSuccess, showError } from '../utils/alert'

const Issues = () => {
  const { issues, loading, deleteIssue } = useData()
  const [editingIssueId, setEditingIssueId] = useState(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all') // all, 등록, 진행, 완료

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-[color:var(--text-secondary)]">데이터를 불러오는 중...</div>
      </div>
    )
  }

  // 필터링
  const filteredIssues = statusFilter === 'all'
    ? issues
    : issues.filter((issue) => issue.status === statusFilter)

  // 날짜 내림차순 정렬
  const sortedIssues = [...filteredIssues].sort((a, b) => {
    return new Date(b.created_at) - new Date(a.created_at)
  })

  // 색상 코딩 함수
  const getIssueColor = (issue) => {
  if (issue.status === '완료') {
      return 'bg-[color:var(--bg-card)] border-[color:var(--border)]'
    }

    const lastUpdate = issue.updated_at || issue.created_at
    if (!lastUpdate) {
      return 'bg-[color:var(--bg-card)] border-[color:var(--border)]'
    }

    const now = new Date()
    const updateDate = new Date(lastUpdate)
    const daysDiff = Math.floor((now - updateDate) / (1000 * 60 * 60 * 24))

    if (daysDiff >= 14) {
      return 'bg-[color:var(--bg-card)] border-[color:var(--border)]'
    } else if (daysDiff >= 7) {
      return 'bg-[color:var(--bg-card)] border-[color:var(--border)]'
    }

    return 'bg-[color:var(--bg-card)] border-[color:var(--border)]'
  }

  const getStatusColor = (status) => {
    switch (status) {
      case '완료':
        return 'bg-[color:var(--bg-card)] text-[color:var(--text-secondary)] border border-[color:var(--border)]'
      case '진행':
        return 'bg-[color:var(--bg-card)] text-[color:var(--text-secondary)] border border-[color:var(--border)]'
      case '등록':
        return 'bg-[color:var(--bg-card)] text-[color:var(--text-secondary)] border border-[color:var(--border)]'
      default:
        return 'bg-[color:var(--bg-card)] text-[color:var(--text-secondary)] border border-[color:var(--border)]'
    }
  }

  const handleDelete = async (id) => {
    const confirmed = await showConfirm(
      '이 이슈 정보가 영구적으로 삭제됩니다.',
      '정말 삭제하시겠습니까?',
      '삭제',
      '취소'
    )
    if (confirmed) {
      try {
        await deleteIssue(id)
        await showSuccess('이슈가 삭제되었습니다.')
      } catch (error) {
        console.error('이슈 삭제 중 오류:', error)
        await showError('이슈 삭제 중 오류가 발생했습니다.')
      }
    }
  }

  return (
    <div className="space-y-8">
      {/* 타이틀바 */}
      <div className="win-title" style={{ border: '1px solid var(--border)', borderBottom: 0 }}>
        <span className="flex items-baseline gap-3">
          <span className="flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
            이슈 관리
          </span>
          <span className="meta">
            ISSUE · {filteredIssues.length}건
            {statusFilter !== 'all' && ` (전체 ${issues.length}건 중)`}
          </span>
        </span>
      </div>

      {/* 툴바 */}
      <div className="toolbar" style={{ border: '1px solid var(--border)', borderTop: 0 }}>
        <button onClick={() => setIsAddModalOpen(true)} className="tb-btn primary">
          <Plus className="w-3.5 h-3.5" /> 신규 <kbd>F2</kbd>
        </button>
      </div>

      {/* 필터 */}
      <div className="card p-4 bg-[color:var(--bg-card)] border-[color:var(--border)]">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-[color:var(--text-secondary)]">상태 필터:</span>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              statusFilter === 'all'
                ? 'bg-[color:var(--accent)] text-white'
                : 'bg-transparent text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-subtle)]'
            }`}
          >
            전체
          </button>
          <button
            onClick={() => setStatusFilter('등록')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              statusFilter === '등록'
                ? 'bg-[color:var(--accent)] text-white'
                : 'bg-transparent text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-subtle)]'
            }`}
          >
            등록
          </button>
          <button
            onClick={() => setStatusFilter('진행')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              statusFilter === '진행'
                ? 'bg-[color:var(--accent)] text-white'
                : 'bg-transparent text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-subtle)]'
            }`}
          >
            진행
          </button>
          <button
            onClick={() => setStatusFilter('완료')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              statusFilter === '완료'
                ? 'bg-[color:var(--accent)] text-white'
                : 'bg-transparent text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-subtle)]'
            }`}
          >
            완료
          </button>
        </div>
      </div>

      {/* ISSUE 리스트 */}
      <div className="space-y-4">
        {sortedIssues.length > 0 ? (
          sortedIssues.map((issue) => (
            <div
              key={issue.id}
              className={`border rounded-xl p-5 transition-all duration-200 ${getIssueColor(issue)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-3">
                    <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${getStatusColor(issue.status)}`}>
                      {issue.status}
                    </span>
                    {issue.target_date && (
                      <span className="text-xs text-[color:var(--text-secondary)]">
                        목표일: {new Date(issue.target_date).toLocaleDateString('ko-KR')}
                      </span>
                    )}
                    <span className="text-xs text-[color:var(--text-secondary)]">
                      생성: {new Date(issue.created_at).toLocaleDateString('ko-KR')}
                    </span>
                    {issue.updated_at && issue.updated_at !== issue.created_at && (
                      <span className="text-xs text-[color:var(--text-secondary)]">
                        수정: {new Date(issue.updated_at).toLocaleDateString('ko-KR')}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-[color:var(--text-primary)] mb-2 break-words">{issue.title}</h3>
                  {issue.content && (
                    <p className="text-sm text-[color:var(--text-secondary)] mb-3 leading-relaxed break-words whitespace-pre-wrap">
                      {issue.content}
                    </p>
                  )}
                </div>
                <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
                  <button
                    onClick={() => setEditingIssueId(issue.id)}
                    className="text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] font-medium flex items-center space-x-1 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                    <span className="text-sm">수정</span>
                  </button>
                  <button
                    onClick={() => handleDelete(issue.id)}
                    className="text-red-300 hover:text-red-200 font-medium flex items-center space-x-1 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-sm">삭제</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12 text-[color:var(--text-secondary)]">
            {statusFilter === 'all' ? '등록된 ISSUE가 없습니다.' : `'${statusFilter}' 상태의 ISSUE가 없습니다.`}
          </div>
        )}
      </div>

      {/* Modals */}
      <div className="statusbar" style={{ border: '1px solid var(--border)' }}>
        <span><span className="dot" />준비됨</span>
        <span>표시 {filteredIssues.length}건 / 전체 {issues.length}건</span>
        {statusFilter !== 'all' && <span>필터: {statusFilter}</span>}
        <span className="flex-1" />
        <span className="hint"><kbd>F2</kbd> 신규</span>
      </div>

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

export default Issues




