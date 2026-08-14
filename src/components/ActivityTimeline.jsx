import React, { useState } from 'react'
import { Phone, Mail, FileText, CheckCircle, ChevronRight } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import EditActivityModal from './EditActivityModal'

const ActivityTimeline = ({ maxItems = 5 }) => {
    const { activities } = useData()
    const [editingActivityId, setEditingActivityId] = useState(null)

    const sortedActivities = (activities || [])
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, maxItems)

    if (!sortedActivities.length) {
        return (
            <div className="p-5 text-center text-gray-500 text-xs font-medium">
                No recent activities recorded.
            </div>
        )
    }

    return (
        <>
            <div className="flex flex-col">
                {sortedActivities.map((act) => {
                    let badgeColor = 'bg-gray-100 text-gray-600 border-gray-200'
                    let Icon = FileText

                    switch (act.type) {
                        case '전화':
                            badgeColor = { bg: 'rgba(59,130,246,0.1)', text: '#60A5FA', border: 'rgba(59,130,246,0.2)' }
                            Icon = Phone
                            break
                        case '이메일':
                            badgeColor = { bg: 'rgba(168,85,247,0.1)', text: '#C084FC', border: 'rgba(168,85,247,0.2)' }
                            Icon = Mail
                            break
                        case '미팅':
                            badgeColor = { bg: 'rgba(16,185,129,0.1)', text: '#34D399', border: 'rgba(16,185,129,0.2)' }
                            Icon = CheckCircle
                            break
                        default:
                            badgeColor = { bg: 'var(--bg-app)', text: 'var(--text-secondary)', border: 'var(--border)' }
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
                                        {act.title || act.clientName}
                                    </p>
                                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                        {new Date(act.date).toLocaleDateString()}
                                    </span>
                                </div>
                                <p className="text-[11px] font-medium truncate flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    <span className={`text-[9px] px-1.5 rounded-sm font-bold uppercase`}
                                        style={{ backgroundColor: badgeColor.bg, color: badgeColor.text, border: `1px solid ${badgeColor.border}` }}>
                                        {act.type}
                                    </span>
                                    <span>·</span>
                                    <span>{act.clientName}</span>
                                </p>
                            </div>
                            <div className="transition-colors" style={{ color: 'var(--text-muted)' }}>
                                <ChevronRight className="w-4 h-4 group-hover:text-emerald-400" />
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
