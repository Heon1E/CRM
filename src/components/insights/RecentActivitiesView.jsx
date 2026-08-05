import React from 'react'
import { Link } from 'react-router-dom'
import { Calendar, User, FileText, CheckCircle, Clock, AlertCircle } from 'lucide-react'

const RecentActivitiesView = ({ data, advice }) => {
    if (!data || data.length === 0) {
        return (
            <div className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>
                <p>최근 활동 데이터가 없습니다.</p>
            </div>
        )
    }

    // Group by date
    const groupedByDate = data.reduce((acc, activity) => {
        const date = new Date(activity.date).toLocaleDateString()
        if (!acc[date]) acc[date] = []
        acc[date].push(activity)
        return acc
    }, {})

    const getActivityIcon = (type) => {
        switch (type?.toLowerCase()) {
            case 'call':
            case '전화':
                return <User className="w-4 h-4" />
            case 'meeting':
            case '미팅':
                return <Calendar className="w-4 h-4" />
            case 'email':
            case '이메일':
                return <FileText className="w-4 h-4" />
            default:
                return <CheckCircle className="w-4 h-4" />
        }
    }

    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'completed':
            case '완료':
                return { bg: 'rgba(16,185,129,0.1)', text: '#34D399', border: 'rgba(16,185,129,0.2)' } // Emerald
            case 'pending':
            case '대기':
                return { bg: 'rgba(245,158,11,0.1)', text: '#FBBF24', border: 'rgba(245,158,11,0.2)' } // Amber
            case 'cancelled':
            case '취소':
                return { bg: 'rgba(239,68,68,0.1)', text: '#F87171', border: 'rgba(239,68,68,0.2)' } // Red
            default:
                return { bg: 'var(--bg-app)', text: 'var(--text-secondary)', border: 'var(--border)' }
        }
    }

    return (
        <div className="p-6">
            {/* Summary */}
            <div className="rounded-lg p-4 mb-6" style={{ backgroundColor: 'var(--bg-card-hover)', border: '1px solid var(--border)' }}>
                <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 mt-0.5" style={{ color: 'var(--accent)' }} />
                    <div>
                        <h3 className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                            최근 7일간 {data.length}건의 활동
                        </h3>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            고객사와의 접점 활동 내역입니다. 지속적인 관계 관리가 중요합니다.
                        </p>
                    </div>
                </div>
            </div>

            {/* Timeline */}
            <div className="space-y-6">
                {Object.entries(groupedByDate).map(([date, activities]) => (
                    <div key={date}>
                        <h4 className="font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                            <Calendar className="w-4 h-4" />
                            {date}
                            <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                                ({activities.length}건)
                            </span>
                        </h4>
                        <div className="space-y-4 ml-6 border-l-2 pl-4" style={{ borderColor: 'var(--border)' }}>
                            {activities.map((activity) => {
                                const statusStyle = getStatusColor(activity.status)
                                return (
                                    <div
                                        key={activity.id}
                                        className="p-3 rounded-lg hover:shadow-lg transition-all"
                                        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-start gap-3 flex-1">
                                                <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--bg-card-hover)' }}>
                                                    {getActivityIcon(activity.type)}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <Link
                                                            to={`/clients/${activity.clientId}`}
                                                            className="font-semibold text-sm hover:underline"
                                                            style={{ color: 'var(--accent-light)' }}
                                                        >
                                                            {activity.client}
                                                        </Link>
                                                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>•</span>
                                                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{activity.type}</span>
                                                    </div>
                                                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                                                        {activity.description || '설명 없음'}
                                                    </p>
                                                </div>
                                            </div>
                                            {activity.status && (
                                                <span className={`text-xs px-2 py-1 rounded-full font-medium`}
                                                    style={{ backgroundColor: statusStyle.bg, color: statusStyle.text, border: `1px solid ${statusStyle.border}` }}>
                                                    {activity.status}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Stats Footer */}
            <div className="mt-6 p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-card-hover)' }}>
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                        <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>총 활동</p>
                        <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{data.length}건</p>
                    </div>
                    <div>
                        <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>일평균</p>
                        <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                            {(data.length / 7).toFixed(1)}건
                        </p>
                    </div>
                    <div>
                        <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>고객사</p>
                        <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                            {new Set(data.map(a => a.clientId)).size}개
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default RecentActivitiesView
