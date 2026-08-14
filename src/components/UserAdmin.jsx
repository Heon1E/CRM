import React, { useState, useEffect, useCallback } from 'react'
import { Loader2, Shield, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { SALES_REP_OPTIONS } from '../utils/salesRep'
import { showError, showSuccess } from '../utils/alert'

/**
 * 계정 · 권한 관리 (설정 화면, 관리자만 보인다)
 *
 * 여기서 정하는 두 가지가 앱 전체를 좌우한다:
 *   - **역할**   admin(전부) / sales(읽기·쓰기) / viewer(읽기만)
 *   - **담당자** `clients.sales_rep`과 맞물리는 한글 이름.
 *               이게 비어 있으면 그 사람의 '내 담당'이 하나도 안 잡힌다.
 *
 * 역할을 못 바꾸게 막는 것은 화면이 아니라 DB다 (`profiles`의 RLS).
 * 화면에서 숨겨도 요청을 직접 보내면 그만이라, 서버에서 막아야 한다.
 */
const ROLE_LABEL = { admin: '관리자', sales: '영업', viewer: '조회 전용' }
const ROLE_DESC = {
    admin: '모든 기능 + 삭제 + 계정 관리',
    sales: '읽기 · 쓰기 (삭제 불가)',
    viewer: '읽기만',
}

const UserAdmin = () => {
    const { isAdmin, profile } = useAuth()
    const [rows, setRows] = useState([])
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(null)
    const [tableMissing, setTableMissing] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('profiles').select('*').order('created_at')
        if (error) {
            if (error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message || '')) {
                setTableMissing(true)
            } else {
                await showError(error.message)
            }
        } else {
            setTableMissing(false)
            setRows(data || [])
        }
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])

    const patch = async (row, changes) => {
        setBusy(row.id)
        const { error } = await supabase.from('profiles').update(changes).eq('id', row.id)
        setBusy(null)
        if (error) { await showError(error.message); return }
        await showSuccess('저장했습니다.')
        await load()
    }

    if (tableMissing) {
        return (
            <div className="win">
                <div className="win-title"><span>계정 · 권한</span></div>
                <p style={{ padding: 16, margin: 0, fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                    아직 준비되지 않았습니다. Supabase SQL Editor에서{' '}
                    <code>execution/sql/auth_and_roles.sql</code> 을 실행하면 나타납니다.
                </p>
            </div>
        )
    }

    if (!isAdmin) {
        return (
            <div className="win">
                <div className="win-title"><span>계정 · 권한</span></div>
                <p style={{ padding: 16, margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                    관리자만 볼 수 있습니다. 지금 권한: <b>{ROLE_LABEL[profile?.role] || '알 수 없음'}</b>
                </p>
            </div>
        )
    }

    return (
        <div className="win">
            <div className="win-title">
                <span><Shield size={13} style={{ verticalAlign: -2, marginRight: 4 }} />계정 · 권한</span>
                <span className="meta">{rows.length}명</span>
            </div>

            <div className="toolbar">
                <button className="tb-btn" onClick={load} disabled={loading}>
                    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> 새로고침
                </button>
                {loading && <Loader2 size={14} className="animate-spin" />}
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table className="dgrid">
                    <thead>
                        <tr>
                            <th style={{ minWidth: 150 }}>아이디</th>
                            <th style={{ minWidth: 110 }}>이름</th>
                            <th style={{ minWidth: 120 }}>담당자 (한글)</th>
                            <th style={{ minWidth: 130 }}>권한</th>
                            <th style={{ minWidth: 70 }}>사용</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.id}>
                                <td>{String(r.email || '').split('@')[0]}
                                    {r.id === profile?.id && <b style={{ color: 'var(--accent)' }}> (나)</b>}
                                </td>
                                <td>{r.full_name || '-'}</td>
                                <td>
                                    {/* 이 값이 비면 그 사람의 KPI·영업 코치가 통째로 0이 된다 */}
                                    <select value={r.sales_rep || ''} disabled={busy === r.id}
                                        onChange={(e) => patch(r, { sales_rep: e.target.value || null })}>
                                        <option value="">(지정 안 함)</option>
                                        {SALES_REP_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                </td>
                                <td>
                                    <select value={r.role} disabled={busy === r.id || r.id === profile?.id}
                                        onChange={(e) => patch(r, { role: e.target.value })}
                                        title={r.id === profile?.id ? '자기 권한은 스스로 바꿀 수 없습니다' : ROLE_DESC[r.role]}>
                                        {Object.keys(ROLE_LABEL).map((k) => (
                                            <option key={k} value={k}>{ROLE_LABEL[k]}</option>
                                        ))}
                                    </select>
                                </td>
                                <td>
                                    <input type="checkbox" checked={!!r.active} disabled={busy === r.id || r.id === profile?.id}
                                        onChange={(e) => patch(r, { active: e.target.checked })} />
                                </td>
                            </tr>
                        ))}
                        {rows.length === 0 && !loading && (
                            <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>
                                계정이 없습니다.
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <p style={{ padding: '10px 12px', margin: 0, fontSize: 11.5, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                ※ <b>담당자</b>를 지정해야 그 사람의 KPI · 영업 코치 · 거래처 정렬이 돕니다. 비워 두면 전부 0으로 나옵니다.<br />
                ※ 맨 처음 만들어진 계정이 자동으로 관리자입니다. 그 다음부터는 영업으로 들어오고 여기서 올려 줍니다.<br />
                ※ 자기 권한과 사용 여부는 스스로 바꿀 수 없습니다 (관리자가 스스로를 잠그는 것을 막습니다).
            </p>
        </div>
    )
}

export default UserAdmin
