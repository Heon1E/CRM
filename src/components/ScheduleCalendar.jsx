import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Plus, Loader2, Check, Trash2, MapPin, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useData } from '../contexts/DataContext'
import { showError, showConfirm } from '../utils/alert'
import { nextBusinessDay } from '../utils/businessDay'
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
/*
 * 일정 종류별 점 색. 예전에는 파랑·보라·청록이었다 — 이 앱에서 걷어낸
 * 색이고, 우리 브랜드와 아무 상관이 없다.
 *
 * **노랑은 여기에 못 쓴다.** 5px짜리 점을 흰 바탕에 찍으면 1.2:1이라 보이지
 * 않는다. 노랑은 면을 채우고 어두운 글씨를 얹을 때만 산다.
 * 대신 브랜드 초록에서 시작해 어두운 쪽으로 벌린다 (흰 바탕 대비 4.8~11.2:1).
 */
const KIND_COLOR = {
    방문: '#007538',   /* 직접 간 것 — 브랜드 초록 */
    미팅: '#3e3a39',   /* 먹색 */
    전화: '#8a6b00',   /* 겨자 (노랑 계열의 '글씨용' 값) */
    기타: '#6b7280',
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
    const { clients, activities, updateActivity } = useData()
    const today = useMemo(() => new Date(), [])

    const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
    const [selected, setSelected] = useState(() => ymd(today))
    const [rows, setRows] = useState([])
    const [loading, setLoading] = useState(true)
    const [tableMissing, setTableMissing] = useState(false)
    const [adding, setAdding] = useState(false)
    const [busyFollowUp, setBusyFollowUp] = useState(null)
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

    /*
     * '하기로 한 것'을 **여기서 바로 끝낸다.**
     *
     * 예전에는 글자만 나열돼 있어 아무것도 할 수 없었다. 봇이 날짜를 자동으로
     * 잡아 주기 시작하면서 목록이 쌓이는데, 이미 처리했거나 쓸데없이 잡힌 것을
     * 지울 방법이 화면에 없었다 - 볼 때마다 거슬리는데 손쓸 수 없으면 결국
     * 그 영역 전체를 안 보게 된다.
     *
     * 활동의 next_action_date를 비우면 목록에서 빠진다. **활동 기록 자체는
     * 그대로 남는다** - 지우는 것은 '언제까지 할 일'이라는 표시뿐이다.
     */
    const clearFollowUp = async (row) => {
        setBusyFollowUp(row.id)
        try {
            await updateActivity(row.id, { next_action_date: null, next_action_detail: '' })
        } catch (e) {
            await showError(e.message || '처리하지 못했습니다.')
        } finally { setBusyFollowUp(null) }
    }

    /*
     * 미룬다 - 오늘 못 한 것을 지우지 않고 넘긴다.
     * **다음 영업일로 간다.** 그냥 하루를 더하면 토요일에 누른 것이 일요일이
     * 되어 아무 일도 할 수 없는 날이 기한이 된다(실제로 그랬다).
     */
    const postponeFollowUp = async (row, days = 1) => {
        setBusyFollowUp(row.id)
        try {
            const base = row.due < ymd(today) ? ymd(today) : row.due
            const next = nextBusinessDay(base, days)
            if (!next) { await showError('날짜를 계산하지 못했습니다.'); return }
            await updateActivity(row.id, { next_action_date: next })
        } catch (e) {
            await showError(e.message || '미루지 못했습니다.')
        } finally { setBusyFollowUp(null) }
    }

    const setStatus = async (row, status) => {
        const { error } = await supabase.from('schedules').update({ status }).eq('id', row.id)
        if (error) { await showError(error.message); return }
        await load()
    }
    const removeRow = async (row) => {
        if (!(await showConfirm(`'${row.title}' 일정을 지웁니다.`, '일정 삭제', '삭제'))) return
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
                            모바일 12px 규칙을 이겨 버린다.
                            **일요일 빨강 · 토요일 파랑은 한국 달력 관례다.**
                            브랜드 색이 아니라 사람들이 그렇게 읽는 규칙이므로
                            파랑을 걷어내는 정리에서 예외로 둔다. 아래 날짜 칸도
                            같은 색을 쓴다 — 머리글만 바꾸면 어긋나 보인다. */}
                        {WEEK.map((w, i) => (
                            <div key={w} className="card-label" style={{
                                textAlign: 'center', fontWeight: 700, padding: '3px 0',
                                color: i === 0 ? '#B91C1C' : i === 6 ? '#1D4ED8' : 'var(--text-secondary)'
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
                                    /* **고르고 나서 또 찾아 눌러야 했다.** 날짜를 고르면 오른쪽
                                       패널로 눈을 옮겨 '추가'를 다시 눌러야 넣을 수 있었다.
                                       두 번 누르면 그 날짜로 바로 입력칸이 열린다.

                                       **`onDoubleClick`만 두면 폰에서는 못 쓴다.** 터치에는
                                       더블클릭이 없다(브라우저가 확대로 가져간다). 이미 고른
                                       날을 다시 누르는 것을 같은 뜻으로 받는다 — 마우스로도
                                       그대로 되고, 처음 누르는 날은 고르기만 하므로 실수로
                                       입력칸이 열리지 않는다. */
                                    onClick={() => {
                                        if (key === selected) setAdding(true)
                                        else { setSelected(key); setAdding(false) }
                                    }}
                                    onDoubleClick={() => { setSelected(key); setAdding(true) }}
                                    title="한 번 더 누르면 이 날짜에 일정을 넣습니다"
                                    className="cal-day"
                                    style={{
                                        minHeight: 52, padding: '3px 4px', textAlign: 'left',
                                        border: isSel ? '2px solid var(--accent)' : '1px solid var(--border)',
                                        borderRadius: 'var(--radius)',
                                        /* 오늘 — 달력에서 한 칸뿐이므로 진짜 노랑으로 찍는다 */
                                        background: isToday ? 'var(--sel)' : 'transparent',
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
                                <span style={{ marginLeft: 6, fontWeight: 500, color: 'var(--text-muted)' }}>
                                    ✓ 처리 · 다음날로 미루기
                                </span>
                            </p>
                            {[...followUps.today.map((r) => ({ ...r, kind: 'today' })),
                              ...followUps.overdue.slice(0, 6).map((r) => ({ ...r, kind: 'late' }))].map((r) => (
                                <div key={r.id} className="fu-row" data-busy={busyFollowUp === r.id ? '1' : undefined}>
                                    <span className="fu-when" style={{ color: r.kind === 'today' ? '#1C6B3C' : '#B91C1C' }}>
                                        {r.kind === 'today' ? '오늘' : `${r.daysLate}일 지남`}
                                    </span>
                                    <span className="fu-text" title={`${r.clientName}${r.detail ? ` · ${r.detail}` : ''}`}>
                                        {r.clientName}{r.detail ? ` · ${r.detail}` : ''}
                                    </span>
                                    <span className="fu-acts">
                                        <button className="rowbtn" title="다음 영업일로 미루기"
                                            disabled={busyFollowUp === r.id}
                                            onClick={() => postponeFollowUp(r, 1)}>
                                            <ChevronRight size={12} />
                                        </button>
                                        <button className="rowbtn" title="처리함 (목록에서 뺍니다)"
                                            disabled={busyFollowUp === r.id}
                                            onClick={() => clearFollowUp(r)}>
                                            <Check size={12} />
                                        </button>
                                    </span>
                                </div>
                            ))}
                            {followUps.overdue.length > 6 && (
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>… 외 {followUps.overdue.length - 6}건</div>
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
