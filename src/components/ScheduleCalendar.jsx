import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Plus, Loader2, Check, Trash2, MapPin, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useData } from '../contexts/DataContext'
import { showError, showConfirm } from '../utils/alert'
import { getHolidays, hasHolidayData } from '../utils/koreanHolidays'
import { openFollowUps } from '../utils/followUps'

/**
 * 대시보드 달력 — 앞으로 할 일을 매일 확인하는 곳.
 *
 * 데이터는 `schedules` 테이블이다. **activities와 따로 둔다.**
 * activities는 '다녀온 기록'이고 KPI 정기적방문횟수의 근거라, 아직 가지 않은
 * 계획을 같은 표에 넣으면 방문 실적이 부풀려진다.
 *
 * 텔레그램으로 "내일 오후 2시 한국화학 방문"을 보내면 봇이 여기에 바로 넣는다.
 */

const WEEK = ['일', '월', '화', '수', '목', '금', '토']
const KIND_COLOR = {
    방문: '#2563EB',
    미팅: '#7C3AED',
    전화: '#0891B2',
    기타: '#6B7280',
}

/** Date -> 'YYYY-MM-DD' (로컬 기준. toISOString은 UTC라 하루 밀린다) */
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/**
 * 제목에 이미 거래처명이 들어 있으면 따로 또 붙이지 않는다.
 * 봇이 "10일 대달산업 방문"을 읽으면 title='대달산업 방문', client_name='대달산업'이
 * 되는데, 둘을 그냥 이어 붙이면 '대달산업 대달산업 방문'이 된다.
 */
const titleOf = (r) => {
    const t = String(r.title || '').trim()
    const c = String(r.client_name || '').trim()
    if (!c) return t
    if (!t) return c
    return t.includes(c) ? t : `${c} ${t}`
}

/** 목록에서 제목과 따로 보여줄 거래처명 (제목에 이미 있으면 감춘다) */
const subClientOf = (r) => {
    const t = String(r.title || '').trim()
    const c = String(r.client_name || '').trim()
    return c && !t.includes(c) ? c : ''
}

const hhmm = (iso) => {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * 공휴일 표 ('YYYY-MM-DD' -> 이름).
 * `koreanHolidays.js`는 매출 추정 엔진의 영업일 계산과 같은 자료를 쓴다.
 * 2023~2026만 들어 있으므로 **매년 갱신해야 한다** (없는 해는 주말만 빨갛게 나온다).
 */
const holidayCache = {}
const holidayName = (year, key) => {
    if (!holidayCache[year]) {
        const m = {}
        getHolidays(year).forEach((h) => { m[h.date] = h.name })
        holidayCache[year] = m
    }
    return holidayCache[year][key]
}

const ScheduleCalendar = () => {
    const { clients, activities } = useData()
    const today = useMemo(() => new Date(), [])

    const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
    const [selected, setSelected] = useState(() => ymd(today))
    const [rows, setRows] = useState([])
    const [loading, setLoading] = useState(true)
    const [tableMissing, setTableMissing] = useState(false)
    const [adding, setAdding] = useState(false)
    const [form, setForm] = useState({ title: '', clientName: '', time: '', kind: '방문', location: '' })

    const monthStart = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1), [cursor])
    const monthEnd = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1), [cursor])

    const load = useCallback(async () => {
        setLoading(true)
        try {
            // 앞뒤 한 주씩 넉넉히 가져온다 (달력에 이웃 달 칸이 보인다)
            const from = new Date(monthStart); from.setDate(from.getDate() - 7)
            const to = new Date(monthEnd); to.setDate(to.getDate() + 7)

            const { data, error } = await supabase
                .from('schedules').select('*')
                .gte('starts_at', from.toISOString())
                .lt('starts_at', to.toISOString())
                .neq('status', '취소')
                .order('starts_at')
                .limit(500)

            if (error) {
                if (error.code === '42P01' || error.code === 'PGRST205' ||
                    /does not exist|could not find the table/i.test(error.message || '')) {
                    setTableMissing(true); setRows([]); return
                }
                throw error
            }
            setTableMissing(false)
            setRows(data || [])
        } catch (e) {
            console.error('일정 조회 실패:', e)
        } finally {
            setLoading(false)
        }
    }, [monthStart, monthEnd])

    useEffect(() => { load() }, [load])

    /** 'YYYY-MM-DD' -> 그날 일정들 */
    const byDay = useMemo(() => {
        const m = {}
        rows.forEach((r) => {
            const k = ymd(new Date(r.starts_at))
            ;(m[k] = m[k] || []).push(r)
        })
        // 같은 날은 시간 순으로 (종일 일정이 먼저)
        Object.values(m).forEach((list) => list.sort((a, b) => {
            if (a.all_day !== b.all_day) return a.all_day ? -1 : 1
            return new Date(a.starts_at) - new Date(b.starts_at)
        }))
        return m
    }, [rows])

    /** 달력 칸 (일요일 시작, 6주 고정 — 달마다 높이가 튀지 않게) */
    const cells = useMemo(() => {
        const first = new Date(monthStart)
        first.setDate(1 - first.getDay())
        return Array.from({ length: 42 }, (_, i) => {
            const d = new Date(first)
            d.setDate(first.getDate() + i)
            return d
        })
    }, [monthStart])

    /**
     * 후속조치 — '언제 다시 연락할지'. 어디서도 안 보여줘서 아무도 안 쓰던 기능이다.
     * 일정 옆에 같이 두어야 매일 눈에 들어온다.
     */
    const followUps = useMemo(() => {
        const names = new Map((clients || []).map((c) => [c.id, c.company]))
        return openFollowUps(activities || [], { today: ymd(today), names })
    }, [activities, clients, today])

    const selectedList = byDay[selected] || []
    const upcoming = useMemo(() => {
        const now = new Date()
        return rows.filter((r) => new Date(r.starts_at) >= now && r.status === '예정')
            .slice(0, 5)
    }, [rows])

    const addSchedule = async () => {
        if (!form.title.trim() && !form.clientName.trim()) {
            await showError('무엇을 하는지 또는 거래처를 적어 주세요.')
            return
        }
        const time = /^\d{1,2}:\d{2}$/.test(form.time) ? form.time.padStart(5, '0') : null
        const starts = new Date(`${selected}T${time || '09:00'}:00`)
        const client = clients.find((c) => c.company === form.clientName.trim())

        try {
            const { error } = await supabase.from('schedules').insert([{
                title: form.title.trim() || `${form.clientName.trim()} ${form.kind}`,
                starts_at: starts.toISOString(),
                ends_at: new Date(starts.getTime() + 3600000).toISOString(),
                all_day: !time,
                client_id: client?.id || null,
                client_name: form.clientName.trim() || null,
                location: form.location.trim() || null,
                kind: form.kind,
                status: '예정',
                source: 'app',
            }])
            if (error) throw error
            setForm({ title: '', clientName: '', time: '', kind: '방문', location: '' })
            setAdding(false)
            await load()
        } catch (e) {
            await showError(e.message || '일정을 넣지 못했습니다.')
        }
    }

    const setStatus = async (row, status) => {
        const { error } = await supabase.from('schedules').update({ status }).eq('id', row.id)
        if (error) { await showError(error.message); return }
        await load()
    }
    const removeRow = async (row) => {
        if (!(await showConfirm(`'${row.title}' 일정을 지웁니다.`, '일정 삭제'))) return
        const { error } = await supabase.from('schedules').delete().eq('id', row.id)
        if (error) { await showError(error.message); return }
        await load()
    }

    if (tableMissing) {
        return (
            <div className="win">
                <div className="win-title"><span>일정</span></div>
                <p style={{ padding: 16, margin: 0, fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                    아직 준비되지 않았습니다. Supabase SQL Editor에서{' '}
                    <code>execution/sql/schedules_and_inbox.sql</code> 을 실행하면 달력이 나타납니다.
                </p>
            </div>
        )
    }

    return (
        <div className="win">
            <div className="win-title">
                <span>일정</span>
                <span className="meta">텔레그램으로 보내면 여기에 바로 등록됩니다</span>
            </div>

            <div className="toolbar">
                <button className="tb-btn" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
                    <ChevronLeft size={14} />
                </button>
                <b style={{ minWidth: 96, textAlign: 'center' }}>
                    {cursor.getFullYear()}. {String(cursor.getMonth() + 1).padStart(2, '0')}
                </b>
                <button className="tb-btn" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
                    <ChevronRight size={14} />
                </button>
                <button className="tb-btn" onClick={() => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(ymd(today)) }}>
                    오늘
                </button>
                {loading && <Loader2 size={14} className="animate-spin" />}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>
                    {!hasHolidayData(cursor.getFullYear()) && (
                        <span style={{ color: '#B45309', marginRight: 8 }}>
                            {cursor.getFullYear()}년 공휴일 미등록
                        </span>
                    )}
                    이번 달 {rows.filter((r) => new Date(r.starts_at).getMonth() === cursor.getMonth()).length}건
                </span>
            </div>

            <div className="sched-body">
                {/* 달력 */}
                <div className="sched-grid">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 2, marginBottom: 4 }}>
                        {/* 요일 글자 크기는 클래스로 준다 — 인라인 `fontSize`는
                            모바일 12px 규칙을 이겨 버린다. 토요일 파랑은 브랜드
                            팔레트 밖이라 먹색 계열로 눌렀다(일요일 빨강만 남긴다). */}
                        {WEEK.map((w, i) => (
                            <div key={w} className="card-label" style={{
                                textAlign: 'center', fontWeight: 700, padding: '3px 0',
                                color: i === 0 ? '#B91C1C' : 'var(--text-secondary)'
                            }}>{w}</div>
                        ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 2 }}>
                        {cells.map((d) => {
                            const key = ymd(d)
                            const inMonth = d.getMonth() === cursor.getMonth()
                            const isToday = key === ymd(today)
                            const isSel = key === selected
                            const list = byDay[key] || []
                            const holiday = holidayName(d.getFullYear(), key)
                            return (
                                <button
                                    key={key}
                                    onClick={() => setSelected(key)}
                                    style={{
                                        minHeight: 52, padding: '3px 4px', textAlign: 'left',
                                        border: isSel ? '2px solid var(--accent)' : '1px solid var(--border)',
                                        borderRadius: 'var(--radius)',
                                        background: isToday ? 'var(--bg-card-hover)' : 'transparent',
                                        opacity: inMonth ? 1 : 0.38,
                                        cursor: 'pointer', display: 'block',
                                    }}
                                >
                                    <span style={{
                                        fontSize: 12, fontWeight: isToday ? 800 : 500,
                                        // 공휴일은 일요일과 같은 빨간색으로 (한국 달력 관례)
                                        color: (holiday || d.getDay() === 0) ? '#B91C1C'
                                            : d.getDay() === 6 ? '#1D4ED8' : 'var(--text-primary)'
                                    }}>
                                        {d.getDate()}
                                    </span>
                                    {holiday && (
                                        /* 칸이 좁아 '대체공휴일'은 잘린다(말줄임).
                                           누르면 아래 상세에 전체 이름이 뜨고,
                                           마우스로는 여기서 바로 보인다. */
                                        <span title={holiday} style={{
                                            display: 'block', fontSize: 10, lineHeight: 1.2, color: '#B91C1C',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                        }}>
                                            {holiday}
                                        </span>
                                    )}
                                    <span style={{ display: 'flex', gap: 2, marginTop: 2, flexWrap: 'wrap' }}>
                                        {list.slice(0, 4).map((r) => (
                                            <span key={r.id} style={{
                                                width: 5, height: 5, borderRadius: '50%',
                                                background: r.status === '완료' ? 'var(--text-muted)' : (KIND_COLOR[r.kind] || KIND_COLOR.기타)
                                            }} />
                                        ))}
                                        {list.length > 4 && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>+{list.length - 4}</span>}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* 선택한 날 + 다가오는 일정 */}
                <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <b style={{ fontSize: 13 }}>
                            {selected.slice(5).replace('-', '/')} ({WEEK[new Date(`${selected}T00:00:00`).getDay()]})
                            {holidayName(Number(selected.slice(0, 4)), selected) && (
                                <span style={{ marginLeft: 6, color: '#B91C1C', fontWeight: 600 }}>
                                    {holidayName(Number(selected.slice(0, 4)), selected)}
                                </span>
                            )}
                        </b>
                        <button className="tb-btn" onClick={() => setAdding((v) => !v)}>
                            <Plus size={13} /> 추가
                        </button>
                    </div>

                    {adding && (
                        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 8, display: 'grid', gap: 5 }}>
                            <input placeholder="무엇을 하나요" value={form.title}
                                onChange={(e) => setForm({ ...form, title: e.target.value })} />
                            <input placeholder="거래처 (선택)" list="sched-clients" value={form.clientName}
                                onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
                            <datalist id="sched-clients">
                                {clients.slice(0, 800).map((c) => <option key={c.id} value={c.company} />)}
                            </datalist>
                            <div style={{ display: 'flex', gap: 5 }}>
                                <input placeholder="14:00" value={form.time} style={{ width: 78 }}
                                    onChange={(e) => setForm({ ...form, time: e.target.value })} />
                                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                                    {['방문', '미팅', '전화', '기타'].map((k) => <option key={k}>{k}</option>)}
                                </select>
                            </div>
                            <input placeholder="장소 (선택)" value={form.location}
                                onChange={(e) => setForm({ ...form, location: e.target.value })} />
                            <button className="tb-btn primary" onClick={addSchedule}><Check size={13} /> 넣기</button>
                        </div>
                    )}

                    {selectedList.length === 0 && !adding && (
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>이 날은 일정이 없습니다.</p>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 210, overflowY: 'auto' }}>
                        {selectedList.map((r) => (
                            <div key={r.id} style={{
                                border: '1px solid var(--border)', borderLeft: `3px solid ${KIND_COLOR[r.kind] || KIND_COLOR.기타}`,
                                borderRadius: 'var(--radius)', padding: '6px 8px',
                                opacity: r.status === '완료' ? 0.55 : 1,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                    <b style={{ fontSize: 12 }}>{r.all_day ? '종일' : hhmm(r.starts_at)}</b>
                                    <span style={{ fontSize: 12, textDecoration: r.status === '완료' ? 'line-through' : 'none' }}>
                                        {titleOf(r)}
                                    </span>
                                    {r.source === 'telegram' && <Send size={10} style={{ opacity: 0.5 }} />}
                                </div>
                                {(subClientOf(r) || r.location) && (
                                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                                        {subClientOf(r)}
                                        {r.location && <> · <MapPin size={9} style={{ display: 'inline' }} /> {r.location}</>}
                                    </div>
                                )}
                                {r.notes && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{r.notes}</div>}
                                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                    {r.status !== '완료' && (
                                        <button className="rowbtn" onClick={() => setStatus(r, '완료')} title="다녀옴">
                                            <Check size={12} />
                                        </button>
                                    )}
                                    <button className="rowbtn" onClick={() => removeRow(r)} title="삭제">
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {(followUps.overdue.length > 0 || followUps.today.length > 0) && (
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                            <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
                                하기로 한 것
                            </p>
                            {followUps.today.map((r) => (
                                <div key={r.id} style={{ fontSize: 11.5, padding: '2px 0', display: 'flex', gap: 5 }}>
                                    <span style={{ color: '#1C6B3C', fontWeight: 700, flexShrink: 0 }}>오늘</span>
                                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {r.clientName}{r.detail ? ` · ${r.detail}` : ''}
                                    </span>
                                </div>
                            ))}
                            {followUps.overdue.slice(0, 4).map((r) => (
                                <div key={r.id} style={{ fontSize: 11.5, padding: '2px 0', display: 'flex', gap: 5 }}>
                                    <span style={{ color: '#B91C1C', fontWeight: 700, flexShrink: 0 }}>{r.daysLate}일 지남</span>
                                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {r.clientName}{r.detail ? ` · ${r.detail}` : ''}
                                    </span>
                                </div>
                            ))}
                            {followUps.overdue.length > 4 && (
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>… 외 {followUps.overdue.length - 4}건</div>
                            )}
                        </div>
                    )}

                    {upcoming.length > 0 && (
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 'auto' }}>
                            <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>다가오는 일정</p>
                            {upcoming.map((r) => (
                                <div key={r.id} style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '1px 0' }}>
                                    {ymd(new Date(r.starts_at)).slice(5).replace('-', '/')} {r.all_day ? '' : hhmm(r.starts_at)}{' '}
                                    {titleOf(r)}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default ScheduleCalendar
