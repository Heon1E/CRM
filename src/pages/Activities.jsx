import React, { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Edit, Download, Search, Phone, Users, ChevronDown, CalendarClock } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import EditActivityModal from '../components/EditActivityModal'
import AddActivityModal from '../components/AddActivityModal'
import { exportActivitiesToExcel } from '../utils/excelExport'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { showError } from '../utils/alert'
import { parseActivityDescription } from '../utils/activityMerge'
import { todayYmd } from '../utils/day'

/*
 * 영업활동 — **읽는 화면이다.**
 *
 * 예전에는 표 한 줄에 내용을 통째로 밀어 넣었다. 줄바꿈이 없어 가로로 삐져나가
 * 스크롤바가 생겼고, 한 줄에 보이는 건 앞의 스무 글자뿐이었다. 정작 읽으려고
 * 누르면 **수정 폼**이 떠서 좁은 입력칸 안에서 읽어야 했다.
 *
 * 통화 녹음이 들어오면서 기록이 400~800자가 됐다. 방문 직전에 이걸 읽고
 * 나가는 것이 이 화면의 용도이므로, 표가 아니라 **읽을 수 있는 카드**로 세운다.
 *
 * - 내용은 `white-space: pre-wrap` 으로 줄과 번호를 그대로 살린다.
 * - 길면 접어 두고 눌러서 편다. **읽으려고 눌렀는데 폼이 뜨면 안 된다** —
 *   수정은 연필 단추로만 연다.
 * - '다음에 할 일'은 따로 띄운다. 이게 이 기록에서 유일하게 행동을 부르는 값이고
 *   아침 브리핑이 고르는 값이다.
 * - `[통화 3회]`·`[담당자] …` 는 봇이 심은 머리글이다. 본문에 그대로 두면
 *   글자만 늘어나므로 배지로 뽑아 올린다 (`parseActivityDescription`).
 */

const TYPE_ICON = { 전화: Phone, 미팅: Users, 방문: Users }

const fmtDate = (d) => {
    const dt = new Date(`${String(d).slice(0, 10)}T00:00:00`)
    if (Number.isNaN(dt.getTime())) return String(d ?? '')
    return dt.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
}

/** 하나의 활동 카드. 길면 접는다. */
const ActivityCard = ({ activity, onEdit }) => {
    const [open, setOpen] = useState(false)
    const parsed = useMemo(
        () => parseActivityDescription(activity.description || activity.title || ''),
        [activity.description, activity.title]
    )
    const body = parsed.body || '(내용 없음)'
    // 넉 줄쯤 넘으면 접어 둔다. 글자 수로 재야 줄바꿈 없는 긴 글도 잡힌다.
    const long = body.length > 180 || body.split('\n').length > 4
    const Icon = TYPE_ICON[activity.type] || Phone

    const due = activity.next_action_date
    const overdue = due && String(due).slice(0, 10) < todayYmd()

    return (
        <div className="px-4 py-3 hover:bg-[color:var(--bg-panel)] transition-colors">
            <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-[color:var(--text-secondary)]">
                    <Icon className="w-3.5 h-3.5" />
                    {activity.type}
                </span>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-bold text-[color:var(--text-primary)]">
                            {activity.clientName || '거래처 없음'}
                        </span>
                        {parsed.persons.length > 0 && (
                            <span className="text-[12px] text-[color:var(--text-secondary)]">
                                {parsed.persons.join(', ')}
                            </span>
                        )}
                        {parsed.count > 1 && (
                            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                                style={{ background: 'var(--ind-yellow)', color: 'var(--ind-ink)' }}>
                                {parsed.label || '접촉'} {parsed.count}회
                            </span>
                        )}
                        {activity.status && activity.status !== '완료' && (
                            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded border border-[color:var(--danger)] text-[color:var(--danger)]">
                                {activity.status}
                            </span>
                        )}
                        {activity.user_name && (
                            <span className="text-[11px] text-[color:var(--text-secondary)]">· {activity.user_name}</span>
                        )}
                    </div>

                    {/* 본문 — 줄과 번호를 그대로 살린다 */}
                    <p
                        className="mt-1 text-[13px] leading-relaxed text-[color:var(--text-primary)] whitespace-pre-wrap break-words"
                        style={long && !open ? {
                            display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        } : undefined}
                    >
                        {body}
                    </p>

                    {long && (
                        <button
                            type="button"
                            onClick={() => setOpen((v) => !v)}
                            className="mt-1 inline-flex items-center gap-1 text-[12px] font-bold text-[color:var(--accent)]"
                        >
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
                            {open ? '접기' : '전체 보기'}
                        </button>
                    )}

                    {(due || activity.next_action_detail) && (
                        <div className="mt-2 flex items-start gap-1.5 text-[12px]">
                            <CalendarClock className="w-3.5 h-3.5 mt-0.5 shrink-0"
                                style={{ color: overdue ? 'var(--danger)' : 'var(--accent)' }} />
                            <span>
                                <b style={{ color: overdue ? 'var(--danger)' : 'var(--accent)' }}>
                                    {due ? fmtDate(due) : '기한 없음'}{overdue ? ' (지남)' : ''}
                                </b>
                                {activity.next_action_detail ? ` — ${activity.next_action_detail}` : ''}
                            </span>
                        </div>
                    )}
                </div>

                <button
                    type="button"
                    onClick={() => onEdit(activity.id)}
                    title="고치기"
                    className="shrink-0 icon-btn text-[color:var(--text-secondary)] hover:text-[color:var(--accent)]"
                >
                    <Edit className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}

const Activities = () => {
    const { activities, loading } = useData()
    const [searchParams] = useSearchParams()
    const [editingActivityId, setEditingActivityId] = useState(null)
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [searchInput, setSearchInput] = useState('')
    const [searchTerm, setSearchTerm] = useState('')

    const statusFilter = searchParams.get('status')

    /*
     * 거래처명뿐 아니라 **내용도 찾는다.** 기록이 길어지면서 "라이너 얘기가
     * 어디 있었지"처럼 본문으로 되찾는 일이 생겼는데, 예전에는 거래처명만
     * 봐서 못 찾았다.
     */
    const filtered = useMemo(() => {
        const all = activities || []
        const byStatus = statusFilter ? all.filter((a) => a.status === statusFilter) : all
        const term = searchTerm.toLowerCase().trim()
        if (!term) return byStatus
        return byStatus.filter((a) => {
            const name = (a.clientName || a.client_name || a.company || '').toLowerCase()
            const body = `${a.description || ''} ${a.next_action_detail || ''}`.toLowerCase()
            return name.includes(term) || body.includes(term)
        })
    }, [activities, statusFilter, searchTerm])

    const flattened = useMemo(() => {
        const rows = [...filtered]
        rows.sort((a, b) => String(b.activity_date || b.date || '').localeCompare(String(a.activity_date || a.date || '')))
        return rows.map((a) => ({ ...a, _dateKey: a.activity_date || a.date }))
    }, [filtered])

    const { visibleItems, hasMore, containerRef } = useInfiniteScroll(
        flattened, 30, { threshold: 100, enabled: !loading }
    )

    // 보이는 것만 날짜로 묶는다 (Map이라 넣은 순서 = 최신순이 유지된다)
    const visibleGroups = useMemo(() => {
        const m = new Map()
        visibleItems.forEach((a) => {
            const d = a._dateKey || a.activity_date || a.date
            if (!m.has(d)) m.set(d, [])
            m.get(d).push(a)
        })
        return [...m.entries()]
    }, [visibleItems])

    const handleExport = async () => {
        try {
            if (!filtered.length) { await showError('내보낼 자료가 없습니다.'); return }
            exportActivitiesToExcel(filtered)
        } catch (error) {
            console.error('Export failed:', error)
            await showError('엑셀 내보내기 중 오류가 발생했습니다.')
        }
    }

    if (loading) {
        return (
            <div className="p-3 md:p-6 max-w-[1100px] mx-auto space-y-3">
                {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-20 rounded" />)}
            </div>
        )
    }

    return (
        <div className="p-3 md:p-6">
            {/* 읽는 화면이므로 폭을 줄인다 — 한 줄이 너무 길면 눈이 되돌아올 자리를 잃는다 */}
            <div className="max-w-[1100px] mx-auto space-y-4">

                <div className="win-title" style={{ border: '1px solid var(--border)', borderBottom: 0 }}>
                    <span className="flex items-baseline gap-3">
                        영업활동
                        <span className="meta">{statusFilter ? `${statusFilter} · ` : ''}{filtered.length}건</span>
                    </span>
                </div>

                <div className="toolbar" style={{ border: '1px solid var(--border)', borderTop: 0, marginTop: 0 }}>
                    <button onClick={() => setIsAddModalOpen(true)} className="tb-btn primary">
                        <Edit className="w-3.5 h-3.5" /> 신규 <kbd>F2</kbd>
                    </button>
                    <span className="tb-sep" />
                    <button onClick={handleExport} className="tb-btn">
                        <Download className="w-3.5 h-3.5" /> 엑셀 내리기
                    </button>
                    <span className="flex-1" />
                    <div className="relative flex-1 max-w-[420px]">
                        <input
                            type="text"
                            placeholder="거래처·내용으로 찾기 (Enter)"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') setSearchTerm(searchInput) }}
                            className="w-full pr-8"
                        />
                        <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-secondary)] pointer-events-none" />
                    </div>
                </div>

                <div className="oem-panel bg-white shadow-sm" ref={containerRef}>
                    <div className="oem-panel-header">
                        <span>활동 기록</span>
                        <span className="text-[11px] font-medium text-[color:var(--text-secondary)]">최신순</span>
                    </div>

                    <div className="overflow-y-auto max-h-[calc(100vh-260px)]">
                        {visibleGroups.length > 0 ? visibleGroups.map(([date, rows]) => (
                            <div key={date}>
                                <div className="px-4 py-1.5 flex items-center gap-3 sticky top-0 z-10 border-b"
                                    style={{ background: 'var(--ind-panel)', borderColor: 'var(--border)' }}>
                                    <span className="font-bold text-[12px] whitespace-nowrap">{fmtDate(date)}</span>
                                    <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
                                    <span className="text-[11px] text-[color:var(--text-secondary)]">{rows.length}건</span>
                                </div>
                                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                                    {rows.map((a) => (
                                        <ActivityCard key={a.id} activity={a} onEdit={setEditingActivityId} />
                                    ))}
                                </div>
                            </div>
                        )) : (
                            <div className="py-20 text-center text-[color:var(--text-secondary)]">
                                {searchTerm ? `'${searchTerm}'에 해당하는 기록이 없습니다.` : '아직 기록이 없습니다.'}
                            </div>
                        )}

                        {hasMore && (
                            <div className="p-6 text-center text-[12px] text-[color:var(--text-secondary)]">
                                더 불러오는 중…
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="statusbar" style={{ border: '1px solid var(--border)' }}>
                <span><span className="dot" />준비됨</span>
                <span>표시 {filtered.length}건</span>
                {statusFilter && <span>필터: {statusFilter}</span>}
                <span className="flex-1" />
                <span className="hint"><kbd>F2</kbd> 신규</span>
            </div>

            <AddActivityModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
            <EditActivityModal
                isOpen={editingActivityId !== null}
                onClose={() => setEditingActivityId(null)}
                activityId={editingActivityId}
            />
        </div>
    )
}

export default Activities
