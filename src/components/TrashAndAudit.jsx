import React, { useState, useEffect, useCallback } from 'react'
import { Trash2, RotateCcw, History, Loader2, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { showError, showSuccess, showConfirm } from '../utils/alert'

/**
 * 휴지통 · 변경 이력 (설정 화면)
 *
 * 지운 것을 되돌릴 수 있어야 한다. 예전에는 거래처를 지우면 그 회사의
 * 매출·활동·담당자가 **진짜로** 사라졌다.
 *
 * 지금은 `deleted_at`만 채우고 행은 남긴다. 여기서 되살리면 딸린 자료도
 * 함께 돌아온다 — 거래처만 살아나고 매출은 안 돌아오면 되살린 의미가 없다.
 */
const ACTION_LABEL = { insert: '추가', update: '수정', delete: '삭제', restore: '되살림' }
const ACTION_COLOR = {
    insert: 'var(--success)', update: 'var(--info)',
    delete: 'var(--danger)', restore: 'var(--accent)',
}
const TABLE_LABEL = {
    clients: '거래처', sales: '매출', activities: '활동', products: '품목',
    quotes: '견적서', purchase_orders: '발주서', profiles: '계정',
    company_profile: '회사 정보', client_contacts: '담당자', schedules: '일정',
}

const when = (t) => {
    if (!t) return ''
    const d = new Date(t)
    const days = Math.floor((Date.now() - d) / 86400000)
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    if (days === 0) return `오늘 ${hhmm}`
    if (days === 1) return `어제 ${hhmm}`
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`
}

const TrashAndAudit = () => {
    const { restoreClient, refreshData } = useData()
    const { isAdmin } = useAuth()
    const [tab, setTab] = useState('trash')
    const [trash, setTrash] = useState([])
    const [logs, setLogs] = useState([])
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(null)
    const [notReady, setNotReady] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const [t, l] = await Promise.all([
                supabase.from('clients')
                    .select('id,company,sales_rep,deleted_at')
                    .not('deleted_at', 'is', null)
                    .order('deleted_at', { ascending: false }).limit(200),
                supabase.from('audit_log')
                    .select('*').order('at', { ascending: false }).limit(120),
            ])
            // 마이그레이션 전이면 칸도 표도 없다
            const missing = (e) => e && (e.code === '42703' || e.code === 'PGRST205'
                || /does not exist|could not find the table/i.test(e.message || ''))
            if (missing(t.error) || missing(l.error)) { setNotReady(true); return }
            setNotReady(false)
            setTrash(t.data || [])
            setLogs(l.data || [])
        } catch (e) {
            await showError(e.message)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const restore = async (row) => {
        if (!(await showConfirm(`'${row.company}'와 딸린 매출·활동을 되살립니다.`, '되살리기', '되살리기'))) return
        setBusy(row.id)
        try {
            await restoreClient(row.id)
            await showSuccess(`'${row.company}'를 되살렸습니다.`)
            await load()
            await refreshData()
        } catch (e) {
            await showError(e.message)
        } finally {
            setBusy(null)
        }
    }

    if (notReady) {
        return (
            <div className="win">
                <div className="win-title"><span>휴지통 · 변경 이력</span></div>
                <p style={{ padding: 16, margin: 0, fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                    아직 준비되지 않았습니다. Supabase SQL Editor에서{' '}
                    <code>execution/sql/soft_delete_and_audit.sql</code> 을 실행하면 나타납니다.
                </p>
            </div>
        )
    }

    return (
        <div className="win">
            <div className="win-title">
                <span>휴지통 · 변경 이력</span>
                <span className="meta">{tab === 'trash' ? `${trash.length}건` : `최근 ${logs.length}건`}</span>
            </div>

            <div className="toolbar">
                <button className={`tb-btn${tab === 'trash' ? ' primary' : ''}`} onClick={() => setTab('trash')}>
                    <Trash2 size={13} /> 휴지통
                </button>
                <button className={`tb-btn${tab === 'audit' ? ' primary' : ''}`} onClick={() => setTab('audit')}>
                    <History size={13} /> 변경 이력
                </button>
                <button className="tb-btn" onClick={load} disabled={loading}>
                    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> 새로고침
                </button>
                {loading && <Loader2 size={14} className="animate-spin" />}
            </div>

            {tab === 'trash' ? (
                <div style={{ overflowX: 'auto' }}>
                    <table className="dgrid">
                        <thead>
                            <tr>
                                <th style={{ minWidth: 200 }}>거래처</th>
                                <th style={{ minWidth: 90 }}>담당</th>
                                <th style={{ minWidth: 110 }}>지운 때</th>
                                <th style={{ width: 110 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {trash.map((r) => (
                                <tr key={r.id}>
                                    <td>{r.company}</td>
                                    <td>{r.sales_rep || '-'}</td>
                                    <td className="dt">{when(r.deleted_at)}</td>
                                    <td>
                                        <button className="tb-btn" disabled={busy === r.id || !isAdmin}
                                            onClick={() => restore(r)}
                                            title={isAdmin ? '' : '관리자만 되살릴 수 있습니다'}>
                                            <RotateCcw size={12} /> 되살리기
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {trash.length === 0 && !loading && (
                                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>
                                    휴지통이 비어 있습니다.
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
                    <table className="dgrid">
                        <thead>
                            <tr>
                                <th style={{ minWidth: 105 }}>때</th>
                                <th style={{ minWidth: 60 }}>구분</th>
                                <th style={{ minWidth: 80 }}>대상</th>
                                <th style={{ minWidth: 170 }}>이름</th>
                                <th style={{ minWidth: 110 }}>누가</th>
                                <th>바뀐 내용</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((r) => {
                                const keys = Object.keys(r.changed || {})
                                return (
                                    <tr key={r.id}>
                                        <td className="dt">{when(r.at)}</td>
                                        <td>
                                            <span style={{ fontWeight: 700, fontSize: 11.5, color: ACTION_COLOR[r.action] }}>
                                                {ACTION_LABEL[r.action] || r.action}
                                            </span>
                                        </td>
                                        <td>{TABLE_LABEL[r.table_name] || r.table_name}</td>
                                        <td>{r.label || '-'}</td>
                                        <td>{String(r.actor_email || '').split('@')[0] || '-'}</td>
                                        <td style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                                            {keys.length ? keys.slice(0, 6).join(', ') + (keys.length > 6 ? ` 외 ${keys.length - 6}개` : '') : '-'}
                                        </td>
                                    </tr>
                                )
                            })}
                            {logs.length === 0 && !loading && (
                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>
                                    아직 기록이 없습니다.
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            <p style={{ padding: '10px 12px', margin: 0, fontSize: 11.5, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                ※ 거래처를 지우면 딸린 <b>매출·활동·담당자도 함께</b> 휴지통으로 갑니다. 되살리면 같이 돌아옵니다.<br />
                ※ 변경 이력은 <b>읽기만</b> 됩니다. 고치거나 지울 수 있으면 이력이 아닙니다.<br />
                ※ 매출·활동은 일괄등록으로 수천 건이 오가므로 <b>삭제만</b> 기록합니다.
            </p>
        </div>
    )
}

export default TrashAndAudit
