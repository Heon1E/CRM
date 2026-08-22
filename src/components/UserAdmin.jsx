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
const ROLE_LABEL = { pending: '승인 대기', admin: '관리자', sales: '영업', viewer: '조회 전용' }
const ROLE_DESC = {
    // 새로 가입한 계정은 여기로 들어온다. **아무것도 못 읽는다.**
    // 배포 주소가 공개돼 있어서, 가입만으로 데이터가 열리면 안 된다.
    pending: '아무것도 볼 수 없음 — 관리자가 역할을 정해야 합니다',
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

    // 승인 대기를 맨 위로 — 새로 들어온 계정을 놓치면 안 된다.
    // (이 세 줄이 `if (tableMissing)` 안에 들어가 있어서 설정 화면이
    //  `pending is not defined`로 죽었다. 화면을 열어 보지 않았으면 몰랐다.)
    const ORDER = { pending: 0, admin: 1, sales: 2, viewer: 3 }
    const sorted = [...rows].sort((a, b) =>
        (ORDER[a.role] ?? 9) - (ORDER[b.role] ?? 9) || String(a.email).localeCompare(String(b.email)))
    const pending = rows.filter((r) => r.role === 'pending').length

    return (
        <div className="win">
            <div className="win-title">
                <span><Shield size={13} style={{ verticalAlign: -2, marginRight: 4 }} />계정 · 권한</span>
                <span className="meta">
                    {rows.length}명
                    {pending > 0 && <b style={{ color: 'var(--warning)', marginLeft: 8 }}>승인 대기 {pending}명</b>}
                </span>
            </div>

            {pending > 0 && (
                <div style={{ padding: '9px 12px', background: 'var(--warning-bg, #fff8e6)', fontSize: 12.5, lineHeight: 1.7 }}>
                    <b>모르는 계정이 있으면 권한을 주지 마세요.</b> 승인 대기 계정은 아무것도 볼 수 없습니다.
                    쓰지 않을 계정은 Supabase &gt; Authentication &gt; Users 에서 지우면 됩니다.
                </div>
            )}

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
                        {sorted.map((r) => (
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
                                    {/* 라벨로 감싸 누르는 자리를 넓힌다 (모바일 44px) */}
                                    <label className="tap-box" aria-label={`${String(r.email || '').split('@')[0]} 사용 여부`}>
                                        <input type="checkbox" checked={!!r.active} disabled={busy === r.id || r.id === profile?.id}
                                            onChange={(e) => patch(r, { active: e.target.checked })} />
                                    </label>
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
                {/*
                  예전 문구: '그 다음부터는 영업으로 들어오고 여기서 올려 줍니다.'
                  **스스로 가입하는 길을 없앤 뒤로 사실이 아니다.** 아무도
                  '들어오지' 않는다. 그런데 이 화면에는 계정을 만드는 단추가
                  없어서, 관리자가 새 직원 계정을 어떻게 만드는지 알 길이 없었다.

                  계정 만들기를 화면에 붙일 수도 없다 — `supabase.auth.signUp`을
                  브라우저에서 부르면 **만든 계정으로 세션이 바뀌어 관리자가
                  로그아웃된다.** 남을 대신 만들려면 서비스 롤 키가 필요한데
                  그건 브라우저에 두면 안 되는 값이다.
                  그래서 실제 절차를 그대로 적는다.
                */}
                ※ <b>새 계정은 Supabase 대시보드에서 만듭니다</b> (Authentication &gt; Users &gt; Add user).
                아이디에 <code>@idibc.local</code>을 붙인 주소로 만들면 됩니다 —
                예: <code>park@idibc.local</code>. 만들어진 계정은 여기 <b>승인 대기</b>로
                올라오고, 권한을 정해 주기 전까지는 아무것도 보지 못합니다.<br />
                ※ 맨 처음 만들어진 계정만 자동으로 관리자입니다.<br />
                ※ 자기 권한과 사용 여부는 스스로 바꿀 수 없습니다 (관리자가 스스로를 잠그는 것을 막습니다).
            </p>
        </div>
    )
}

export default UserAdmin
