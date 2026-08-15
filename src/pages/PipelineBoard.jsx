import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, RefreshCw, Loader2, Trash2, AlertTriangle, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { resolveSalesRep, SALES_REP_OPTIONS } from '../utils/salesRep'
import {
    STAGES, CLOSED, ALL_STAGES, isOpen, isStale, isOverdue, daysInStage,
    probabilityOf, summarize, groupByStage,
} from '../utils/dealStages'
import { showError, showSuccess, showConfirm } from '../utils/alert'

/**
 * 파이프라인 — 영업 기회를 단계로 세운다
 *
 * 예전에는 **거래처를 `clients.status`로 묶어** 보여줬다. 그래서 거래처 하나가
 * 단계 하나만 가질 수 있었고(한 곳과 두 건을 동시에 진행하면 표현 불가),
 * 금액도 예상 시기도 없었으며, 성사되면 status가 바뀌면서 그 건의 기록이
 * 통째로 사라져 수주율을 낼 수 없었다.
 *
 * 지금은 `deals` 표를 쓴다 — Pipedrive·HubSpot·Salesforce가 전부 '기회'를
 * 별도 레코드로 두는 이유가 그것이다. 거래처는 관계이고, 기회는 건별로 뜬다.
 */
const won = (v) => Math.round(Number(v) || 0).toLocaleString('ko-KR')
const eok = (v) => `${((Number(v) || 0) / 1e8).toFixed(1)}억`
const todayStr = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const emptyDeal = (owner) => ({
    client_id: null, client_name: '', title: '', stage: '리드',
    amount: 0, probability: '', expected_close: '', owner: owner || '',
    next_action: '', next_action_date: '', notes: '',
})

const PipelineBoard = () => {
    const { clients } = useData()
    const { user, salesRep: authRep, canWrite } = useAuth()
    const myRep = useMemo(() => authRep || resolveSalesRep(user), [user, authRep])

    const [deals, setDeals] = useState([])
    const [loading, setLoading] = useState(true)
    const [notReady, setNotReady] = useState(false)
    const [editing, setEditing] = useState(null)
    const [saving, setSaving] = useState(false)
    const [dragId, setDragId] = useState(null)
    const [mineOnly, setMineOnly] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('deals').select('*').order('updated_at', { ascending: false }).limit(500)
        if (error) {
            if (error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message || '')) {
                setNotReady(true)
            } else {
                await showError(error.message)
            }
        } else {
            setNotReady(false)
            setDeals(data || [])
        }
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])

    const shown = useMemo(
        () => (mineOnly && myRep ? deals.filter((d) => d.owner === myRep) : deals),
        [deals, mineOnly, myRep])

    const sum = useMemo(() => summarize(shown), [shown])
    const byStage = useMemo(() => groupByStage(shown), [shown])

    /** 단계 옮기기 — 보드에서 끌어다 놓으면 바로 저장된다 */
    const moveTo = async (id, stage) => {
        const deal = deals.find((d) => d.id === id)
        if (!deal || deal.stage === stage) return
        // 화면을 먼저 바꾼다. 되돌아오는 것을 기다리면 끌어 놓는 맛이 안 난다.
        setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, stage, stage_changed_at: new Date().toISOString() } : d)))

        let patch = { stage }
        if (stage === '실패') {
            const reason = window.prompt('실패 사유를 적어 주세요. (수주율을 볼 때 근거가 됩니다)', deal.lost_reason || '')
            if (reason === null) { await load(); return }   // 취소하면 되돌린다
            patch.lost_reason = reason
        }
        const { error } = await supabase.from('deals').update(patch).eq('id', id)
        if (error) { await showError(error.message); await load() }
    }

    const save = async () => {
        const d = editing
        if (!d.client_name?.trim()) { await showError('거래처를 고르거나 이름을 넣어 주세요.'); return }
        if (!d.title?.trim()) { await showError('건 이름을 넣어 주세요. (예: 2026 IBC 연간 물량)'); return }
        setSaving(true)
        const payload = {
            client_id: d.client_id || null,
            client_name: d.client_name.trim(),
            title: d.title.trim(),
            stage: d.stage,
            amount: Number(d.amount) || 0,
            probability: d.probability === '' ? null : Number(d.probability),
            expected_close: d.expected_close || null,
            owner: d.owner || null,
            next_action: d.next_action || null,
            next_action_date: d.next_action_date || null,
            notes: d.notes || null,
        }
        const { error } = d.id
            ? await supabase.from('deals').update(payload).eq('id', d.id)
            : await supabase.from('deals').insert([payload])
        setSaving(false)
        if (error) { await showError(error.message); return }
        setEditing(null)
        await showSuccess('저장했습니다.')
        await load()
    }

    const remove = async (d) => {
        if (!(await showConfirm(`'${d.title}'을(를) 지웁니다.`, '삭제'))) return
        const { error } = await supabase.from('deals')
            .update({ deleted_at: new Date().toISOString() }).eq('id', d.id)
        if (error) { await showError(error.message); return }
        await load()
    }

    if (notReady) {
        return (
            <div className="win" style={{ margin: 12 }}>
                <div className="win-title"><span>파이프라인</span></div>
                <p style={{ padding: 16, margin: 0, fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                    아직 준비되지 않았습니다. Supabase SQL Editor에서{' '}
                    <code>execution/sql/deals.sql</code> 을 실행하면 나타납니다.
                </p>
            </div>
        )
    }

    return (
        <div style={{ margin: 12 }}>
            {/* ── 요약 ─────────────────────────────────────────────── */}
            <div className="win">
                <div className="win-title">
                    <span>파이프라인</span>
                    <span className="meta">진행 중인 영업 기회</span>
                </div>
                <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <button className="tb-btn primary" onClick={() => setEditing(emptyDeal(myRep))} disabled={!canWrite}>
                        <Plus size={13} /> 새 기회
                    </button>
                    <button className="tb-btn" onClick={load} disabled={loading}>
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> 새로고침
                    </button>
                    {myRep && (
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}>
                            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
                            내 것만
                        </label>
                    )}
                    {loading && <Loader2 size={14} className="animate-spin" />}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1, background: 'var(--border-light)' }}>
                    {[
                        ['진행 중', `${sum.openCount}건`, eok(sum.openAmount)],
                        ['기대값', eok(sum.weighted), '금액 × 확률'],
                        ['수주', `${sum.wonCount}건`, eok(sum.wonAmount)],
                        ['수주율', sum.winRate === null ? '—' : `${sum.winRate}%`, '닫힌 건 기준'],
                        ['멈춘 건', `${sum.staleCount}건`, '단계에 오래 머묾'],
                        ['기한 지남', `${sum.overdueCount}건`, '예상 마감 초과'],
                    ].map(([label, big, sub]) => (
                        <div key={label} style={{ background: 'var(--bg-card)', padding: '8px 10px' }}>
                            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{label}</div>
                            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>{big}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── 보드 ─────────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, overflowX: 'auto', paddingBottom: 8 }}>
                {ALL_STAGES.map((st) => {
                    const list = byStage[st.key] || []
                    const total = list.reduce((a, d) => a + (Number(d.amount) || 0), 0)
                    return (
                        <div key={st.key}
                            onDragOver={(e) => { if (dragId) e.preventDefault() }}
                            onDrop={(e) => { e.preventDefault(); if (dragId) { moveTo(dragId, st.key); setDragId(null) } }}
                            style={{
                                flex: '0 0 232px', background: 'var(--bg-subtle)',
                                border: '1px solid var(--border-light)', borderRadius: 'var(--radius-lg)',
                                display: 'flex', flexDirection: 'column', minHeight: 220,
                            }}>
                            <div style={{
                                padding: '6px 9px', borderBottom: '1px solid var(--border-light)',
                                background: isOpen(st.key) ? 'var(--bg-header)' : 'var(--bg-card)',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <b style={{ fontSize: 12.5, color: st.key === '수주' ? 'var(--success)' : st.key === '실패' ? 'var(--danger)' : 'var(--text-primary)' }}>
                                        {st.label}
                                    </b>
                                    <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{list.length}건</span>
                                </div>
                                <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                                    {total > 0 ? `${won(total)}원` : '—'}
                                    {isOpen(st.key) && <span> · {st.prob}%</span>}
                                </div>
                            </div>

                            <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {list.map((d) => {
                                    const stale = isStale(d)
                                    const over = isOverdue(d)
                                    return (
                                        <div key={d.id}
                                            draggable={canWrite}
                                            onDragStart={() => setDragId(d.id)}
                                            onDragEnd={() => setDragId(null)}
                                            onClick={() => setEditing({ ...d, probability: d.probability ?? '' })}
                                            title={`${daysInStage(d)}일째 ${d.stage}`}
                                            style={{
                                                background: 'var(--bg-card)', border: '1px solid var(--border-light)',
                                                borderLeft: `3px solid ${stale ? 'var(--warning)' : over ? 'var(--danger)' : 'var(--accent)'}`,
                                                borderRadius: 'var(--radius)', padding: '7px 8px', cursor: canWrite ? 'grab' : 'pointer',
                                            }}>
                                            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 2 }}>{d.client_name}</div>
                                            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 4 }}>{d.title}</div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                                                <span className="num" style={{ fontSize: 12, fontWeight: 700 }}>
                                                    {Number(d.amount) > 0 ? `${won(d.amount)}` : '금액 미정'}
                                                </span>
                                                {isOpen(d.stage) && (
                                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{probabilityOf(d)}%</span>
                                                )}
                                            </div>
                                            {(stale || over || d.expected_close) && (
                                                <div style={{ marginTop: 4, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                                    {over && <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
                                                        <AlertTriangle size={10} style={{ verticalAlign: -1 }} /> 기한 지남</span>}
                                                    {stale && !over && <span style={{ color: 'var(--warning)', fontWeight: 700 }}>
                                                        <Clock size={10} style={{ verticalAlign: -1 }} /> {daysInStage(d)}일째</span>}
                                                    {d.expected_close && !over && (
                                                        <span className="dt" style={{ color: 'var(--text-muted)' }}>~{String(d.expected_close).slice(5)}</span>
                                                    )}
                                                </div>
                                            )}
                                            {d.owner && (
                                                <div style={{ marginTop: 3, fontSize: 10.5, color: 'var(--text-muted)' }}>{d.owner}</div>
                                            )}
                                        </div>
                                    )
                                })}
                                {list.length === 0 && (
                                    <div style={{ padding: '14px 6px', textAlign: 'center', fontSize: 11.5, color: 'var(--text-muted)' }}>
                                        {isOpen(st.key) ? '여기로 끌어다 놓으세요' : '아직 없습니다'}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            <p style={{ margin: '8px 2px 0', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                카드를 끌어다 다른 칸에 놓으면 단계가 바뀝니다. 카드를 누르면 고칩니다.
                왼쪽 색 막대 — <b style={{ color: 'var(--warning)' }}>노랑</b> 단계에 오래 머문 건,
                <b style={{ color: 'var(--danger)' }}> 빨강</b> 예상 마감이 지난 건.
            </p>

            {/* ── 편집 ─────────────────────────────────────────────── */}
            {editing && (
                <div onClick={() => setEditing(null)} style={{
                    position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.4)',
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 12px', overflowY: 'auto',
                }}>
                    <div className="win" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 520 }}>
                        <div className="win-title">
                            <span>{editing.id ? '기회 고치기' : '새 기회'}</span>
                            {editing.id && (
                                <button className="rowbtn" onClick={() => remove(editing)} title="삭제"><Trash2 size={12} /></button>
                            )}
                        </div>
                        <div style={{ padding: 12, display: 'grid', gap: 9 }}>
                            <label style={{ fontSize: 12 }}>거래처
                                <select value={editing.client_id || ''}
                                    onChange={(e) => {
                                        const c = (clients || []).find((x) => x.id === e.target.value)
                                        setEditing((d) => ({ ...d, client_id: c?.id || null, client_name: c?.company || d.client_name }))
                                    }}
                                    style={{ width: '100%', marginTop: 3 }}>
                                    <option value="">직접 입력</option>
                                    {(clients || []).slice(0, 400).map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
                                </select>
                            </label>
                            {!editing.client_id && (
                                <label style={{ fontSize: 12 }}>거래처명
                                    <input value={editing.client_name}
                                        onChange={(e) => setEditing((d) => ({ ...d, client_name: e.target.value }))}
                                        style={{ width: '100%', marginTop: 3 }} />
                                </label>
                            )}
                            <label style={{ fontSize: 12 }}>건 이름
                                <input value={editing.title} placeholder="예) 2026 IBC 연간 물량"
                                    onChange={(e) => setEditing((d) => ({ ...d, title: e.target.value }))}
                                    style={{ width: '100%', marginTop: 3 }} />
                            </label>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
                                <label style={{ fontSize: 12 }}>단계
                                    <select value={editing.stage} onChange={(e) => setEditing((d) => ({ ...d, stage: e.target.value }))}
                                        style={{ width: '100%', marginTop: 3 }}>
                                        {ALL_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                                    </select>
                                </label>
                                <label style={{ fontSize: 12 }}>담당
                                    <select value={editing.owner || ''} onChange={(e) => setEditing((d) => ({ ...d, owner: e.target.value }))}
                                        style={{ width: '100%', marginTop: 3 }}>
                                        <option value="">지정 안 함</option>
                                        {SALES_REP_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                </label>
                                <label style={{ fontSize: 12 }}>예상 금액 (원)
                                    <input type="number" value={editing.amount}
                                        onChange={(e) => setEditing((d) => ({ ...d, amount: e.target.value }))}
                                        style={{ width: '100%', marginTop: 3 }} />
                                </label>
                                <label style={{ fontSize: 12 }}>확률 (%)
                                    <input type="number" value={editing.probability} placeholder={`기본 ${ALL_STAGES.find((s) => s.key === editing.stage)?.prob ?? 0}`}
                                        onChange={(e) => setEditing((d) => ({ ...d, probability: e.target.value }))}
                                        style={{ width: '100%', marginTop: 3 }} />
                                </label>
                                <label style={{ fontSize: 12 }}>예상 마감
                                    <input type="date" value={editing.expected_close || ''}
                                        onChange={(e) => setEditing((d) => ({ ...d, expected_close: e.target.value }))}
                                        style={{ width: '100%', marginTop: 3 }} />
                                </label>
                                <label style={{ fontSize: 12 }}>다음 조치일
                                    <input type="date" value={editing.next_action_date || ''}
                                        onChange={(e) => setEditing((d) => ({ ...d, next_action_date: e.target.value }))}
                                        style={{ width: '100%', marginTop: 3 }} />
                                </label>
                            </div>

                            <label style={{ fontSize: 12 }}>다음에 할 일
                                <input value={editing.next_action || ''} placeholder="예) 샘플 결과 확인 후 단가 제시"
                                    onChange={(e) => setEditing((d) => ({ ...d, next_action: e.target.value }))}
                                    style={{ width: '100%', marginTop: 3 }} />
                            </label>
                            <label style={{ fontSize: 12 }}>메모
                                <textarea rows={3} value={editing.notes || ''}
                                    onChange={(e) => setEditing((d) => ({ ...d, notes: e.target.value }))}
                                    style={{ width: '100%', marginTop: 3, resize: 'vertical' }} />
                            </label>
                        </div>
                        <div className="toolbar">
                            <button className="tb-btn" onClick={() => setEditing(null)}>닫기</button>
                            <button className="tb-btn primary" onClick={save} disabled={saving || !canWrite} style={{ marginLeft: 'auto' }}>
                                {saving ? <Loader2 size={13} className="animate-spin" /> : null} 저장
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default PipelineBoard
