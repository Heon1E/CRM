import React, { useState } from 'react'
import { Phone, Mail, FileText, CheckCircle, ChevronRight } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import EditActivityModal from './EditActivityModal'
import { parseActivityDescription } from '../utils/activityMerge'

/** 봇이 심은 머리글([통화 N회]·[담당자])을 걷어내고 첫 줄만 보여준다 */
const summaryOf = (act) => {
    const body = parseActivityDescription(act.description || '').body
    const first = body.split('\n').map((l) => l.trim()).find(Boolean) || ''
    return first.replace(/^\d+\.\s*/, '') || '(내용 없음)'
}

const ActivityTimeline = ({ maxItems = 5 }) => {
    const { activities } = useData()
    const [editingActivityId, setEditingActivityId] = useState(null)

    const sortedActivities = (activities || [])
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, maxItems)

    if (!sortedActivities.length) {
        return (
            <div className="p-5 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                아직 기록이 없습니다.
            </div>
        )
    }

    return (
        <>
            <div className="flex flex-col">
                {sortedActivities.map((act) => {
                    /*
                     * **다크 테마 잔재였다.** 글자색이 #34D399 · #60A5FA · #C084FC —
                     * 어두운 배경 위에 쓰라고 만든 밝은 색인데, 배경이 흰색으로
                     * 바뀌면서 그 위에 그대로 남았다. 브라우저에서 재보니 '미팅'
                     * 배지가 **대비 1.75**였다(4.5 필요). 사실상 안 보인다.
                     * 배경 틴트는 그대로 두고 글자만 진한 쪽으로 내린다.
                     */
                    let badgeColor = { bg: 'var(--bg-app)', text: 'var(--text-secondary)', border: 'var(--border)' }
                    let Icon = FileText

                    switch (act.type) {
                        case '전화':
                            badgeColor = { bg: 'rgba(0,117,56,0.08)', text: '#007538', border: 'rgba(0,117,56,0.25)' }
                            Icon = Phone
                            break
                        case '이메일':
                            badgeColor = { bg: 'rgba(168,85,247,0.1)', text: '#6d28d9', border: 'rgba(168,85,247,0.25)' }
                            Icon = Mail
                            break
                        case '미팅':
                            badgeColor = { bg: 'rgba(16,185,129,0.1)', text: '#146b46', border: 'rgba(16,185,129,0.25)' }
                            Icon = CheckCircle
                            break
                        default:
                            break
                    }

                    return (
                        <div
                            key={act.id}
                            className="flex items-center gap-4 px-5 py-3 cursor-pointer group transition-colors table-row-hover"
                            style={{ borderBottom: '1px solid var(--border)' }}
                            onClick={() => setEditingActivityId(act.id)}
                        >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm`}
                                style={{ backgroundColor: badgeColor.bg, color: badgeColor.text, border: `1px solid ${badgeColor.border}` }}>
                                <Icon className="w-4 h-4" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                                    <p className="text-[12px] font-bold truncate transition-colors"
                                        style={{ color: 'var(--text-primary)' }}>
                                        {act.clientName || '거래처 없음'}
                                    </p>
                                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                        {String(act.activity_date || act.date || '').slice(5).replace('-', '/')}
                                    </span>
                                </div>
                                {/*
                                  * 예전에는 여기에 거래처명을 한 번 더 찍고 있었다 —
                                  * 위에 이미 있는 것을 되풀이하느라 **무슨 일이 있었는지는
                                  * 한 글자도 안 보였다.** (`act.title`은 activities에 없는
                                  * 칸이라 늘 clientName으로 떨어졌다. /calendar가 없는 칸
                                  * `summary`를 보다 227건이 전부 'No Title'이던 것과 같다.)
                                  */}
                                <p className="text-[11px] font-medium truncate flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    <span className={`text-xs px-1.5 rounded-sm font-bold shrink-0`}
                                        style={{ backgroundColor: badgeColor.bg, color: badgeColor.text, border: `1px solid ${badgeColor.border}` }}>
                                        {act.type}
                                    </span>
                                    <span className="truncate">{summaryOf(act)}</span>
                                </p>
                            </div>
                            <div className="transition-colors" style={{ color: 'var(--text-muted)' }}>
                                <ChevronRight className="w-4 h-4 group-hover:text-[color:var(--accent)]" />
                            </div>
                        </div>
                    )
                })}
            </div>

            {editingActivityId && (
                <EditActivityModal
                    isOpen={true}
                    onClose={() => setEditingActivityId(null)}
                    activityId={editingActivityId}
                />
            )}
        </>
    )
}

export default ActivityTimeline
