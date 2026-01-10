import React, { useState } from 'react'
import { Plus, Edit, Trash2, AlertCircle } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import AddIssueModal from '../components/AddIssueModal'
import EditIssueModal from '../components/EditIssueModal'

const Issues = () => {
  const { issues, loading, deleteIssue } = useData()
  const [editingIssueId, setEditingIssueId] = useState(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all') // all, 등록, 진행, 완료

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">데이터를 불러오는 중...</div>
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
      return 'bg-gray-50 border-gray-200'
    }

    const lastUpdate = issue.updated_at || issue.created_at
    if (!lastUpdate) {
      return 'bg-white border-gray-200'
    }

    const now = new Date()
    const updateDate = new Date(lastUpdate)
    const daysDiff = Math.floor((now - updateDate) / (1000 * 60 * 60 * 24))

    if (daysDiff >= 14) {
      return 'bg-red-50 border-red-200'
    } else if (daysDiff >= 7) {
      return 'bg-orange-50 border-orange-200'
    }

    return 'bg-white border-gray-200'
  }

  const getStatusColor = (status) => {
    switch (status) {
      case '완료':
        return 'bg-emerald-50 text-emerald-700'
      case '진행':
        return 'bg-blue-50 text-blue-700'
      case '등록':
        return 'bg-gray-50 text-gray-700'
      default:
        return 'bg-gray-50 text-gray-700'
    }
  }

  const handleDelete = async (id) => {
    if (window.confirm('정말로 이 ISSUE를 삭제하시겠습니까?')) {
      try {
        await deleteIssue(id)
        alert('ISSUE가 삭제되었습니다.')
      } catch (error) {
        console.error('ISSUE 삭제 중 오류:', error)
      }
    }
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center space-x-2">
            <AlertCircle className="w-6 h-6 text-brand-blue" />
            <span>ISSUE 트래커</span>
          </h1>
          <p className="text-gray-500 mt-1.5 text-sm md:text-base">
            총 {filteredIssues.length}건의 ISSUE
            {statusFilter !== 'all' && ` (전체 ${issues.length}건 중)`}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn-success w-full sm:w-auto flex items-center justify-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>ISSUE 추가</span>
        </button>
      </div>

      {/* 필터 */}
      <div className="card p-4">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-gray-700">상태 필터:</span>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              statusFilter === 'all'
                ? 'bg-brand-blue text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            전체
          </button>
          <button
            onClick={() => setStatusFilter('등록')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              statusFilter === '등록'
                ? 'bg-brand-blue text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            등록
          </button>
          <button
            onClick={() => setStatusFilter('진행')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              statusFilter === '진행'
                ? 'bg-brand-blue text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            진행
          </button>
          <button
            onClick={() => setStatusFilter('완료')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              statusFilter === '완료'
                ? 'bg-brand-blue text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
                      <span className="text-xs text-gray-500">
                        목표일: {new Date(issue.target_date).toLocaleDateString('ko-KR')}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      생성: {new Date(issue.created_at).toLocaleDateString('ko-KR')}
                    </span>
                    {issue.updated_at && issue.updated_at !== issue.created_at && (
                      <span className="text-xs text-gray-400">
                        수정: {new Date(issue.updated_at).toLocaleDateString('ko-KR')}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2 break-words">{issue.title}</h3>
                  {issue.content && (
                    <p className="text-sm text-gray-700 mb-3 leading-relaxed break-words whitespace-pre-wrap">
                      {issue.content}
                    </p>
                  )}
                </div>
                <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
                  <button
                    onClick={() => setEditingIssueId(issue.id)}
                    className="text-brand-blue hover:text-brand-blue-hover font-medium flex items-center space-x-1 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                    <span className="text-sm">수정</span>
                  </button>
                  <button
                    onClick={() => handleDelete(issue.id)}
                    className="text-red-500 hover:text-red-600 font-medium flex items-center space-x-1 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-sm">삭제</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12 text-gray-500">
            {statusFilter === 'all' ? '등록된 ISSUE가 없습니다.' : `'${statusFilter}' 상태의 ISSUE가 없습니다.`}
          </div>
        )}
      </div>

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

export default Issues
