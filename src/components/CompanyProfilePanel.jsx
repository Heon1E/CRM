import React, { useState, useEffect, useCallback } from 'react'
import { Save, Loader2, RefreshCw, Building2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { showError, showSuccess } from '../utils/alert'

/**
 * 회사 정보 · 문서 기본값 (설정 화면)
 *
 * 견적서·발주서 머리글과 바닥글에 들어가는 값이다. 예전에는 SQL로 한 번 넣어
 * 두고 고칠 방법이 없어서, 전화번호 하나 바꾸려 해도 개발자를 거쳐야 했다.
 *
 * 안내문구를 여기 두는 이유: 견적서마다 손으로 적으면 반복되고, 코드에 박으면
 * 문구를 고칠 때마다 배포해야 한다. 문서에 늘 들어가는 말은 회사 정보 옆이 맞다.
 */
const FIELDS = [
    { key: 'name', label: '상호', required: true },
    { key: 'ceo', label: '대표자' },
    { key: 'biz_no', label: '사업자등록번호' },
    { key: 'address', label: '주소', wide: true },
    { key: 'phone', label: '전화' },
    { key: 'fax', label: '팩스' },
    { key: 'email', label: '이메일' },
    { key: 'bank_account', label: '입금계좌', wide: true, hint: '견적서 조건표에 나옵니다' },
]

const CompanyProfilePanel = () => {
    const { canWrite } = useAuth()
    const [form, setForm] = useState(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [dirty, setDirty] = useState(false)
    const [notReady, setNotReady] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('company_profile').select('*').eq('id', 1).maybeSingle()
        if (error) {
            if (error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message || '')) {
                setNotReady(true)
            } else {
                await showError(error.message)
            }
        } else {
            setForm(data || { id: 1 })
            setDirty(false)
        }
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])

    const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true) }

    const save = async () => {
        if (!form?.name?.trim()) { await showError('상호는 비울 수 없습니다.'); return }
        setSaving(true)
        // 행이 없을 수도 있으므로 upsert. 문서가 회사 정보 없이 나가면 안 된다.
        const { error } = await supabase.from('company_profile')
            .upsert({ ...form, id: 1, updated_at: new Date().toISOString() })
        setSaving(false)
        if (error) { await showError(error.message); return }
        setDirty(false)
        await showSuccess('저장했습니다. 다음에 만드는 문서부터 반영됩니다.')
    }

    if (notReady) {
        return (
            <div className="win">
                <div className="win-title"><span>회사 정보</span></div>
                <p style={{ padding: 16, margin: 0, fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                    아직 준비되지 않았습니다. Supabase SQL Editor에서{' '}
                    <code>execution/sql/quotes_and_orders.sql</code> 을 실행하면 나타납니다.
                </p>
            </div>
        )
    }

    return (
        <div className="win">
            <div className="win-title">
                <span><Building2 size={13} style={{ verticalAlign: -2, marginRight: 4 }} />회사 정보 · 문서 기본값</span>
                <span className="meta">견적서 · 발주서에 나갑니다</span>
            </div>

            <div className="toolbar">
                <button className="tb-btn primary" onClick={save} disabled={saving || !dirty || !canWrite}
                    title={canWrite ? '' : '조회 전용 계정은 고칠 수 없습니다'}>
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} 저장
                </button>
                <button className="tb-btn" onClick={load} disabled={loading}>
                    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> 되돌리기
                </button>
                {dirty && <span style={{ fontSize: 12, color: 'var(--warning)' }}>저장하지 않은 변경이 있습니다</span>}
            </div>

            <div style={{ padding: 12 }}>
                <div className="fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {FIELDS.map((f) => (
                        <label key={f.key} style={{ fontSize: 12, gridColumn: f.wide ? '1 / -1' : undefined }}>
                            {f.label}{f.required && <b style={{ color: 'var(--danger)' }}> *</b>}
                            {f.hint && <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>({f.hint})</span>}
                            <input value={form?.[f.key] || ''} disabled={!canWrite}
                                onChange={(e) => set(f.key, e.target.value)}
                                style={{ width: '100%', marginTop: 3 }} />
                        </label>
                    ))}
                </div>

                <h4 style={{ margin: '16px 0 6px', fontSize: 13 }}>견적서 안내문구</h4>
                <p style={{ margin: '0 0 5px', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                    모든 견적서 아래에 붙습니다. 건별로 다른 말은 견적서 작성 화면의 <b>비고</b>에 적으세요.
                </p>
                <textarea rows={5} value={form?.quote_terms || ''} disabled={!canWrite}
                    onChange={(e) => set('quote_terms', e.target.value)}
                    placeholder="예) · 본 견적은 발행일로부터 30일간 유효합니다."
                    style={{ width: '100%', resize: 'vertical' }} />

                <h4 style={{ margin: '16px 0 6px', fontSize: 13 }}>발주서 안내문구</h4>
                <textarea rows={4} value={form?.po_terms || ''} disabled={!canWrite}
                    onChange={(e) => set('po_terms', e.target.value)}
                    placeholder="예) · 납품 시 거래명세서를 반드시 동봉해 주십시오."
                    style={{ width: '100%', resize: 'vertical' }} />

                <p style={{ margin: '12px 0 0', fontSize: 11.5, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                    ※ 안내문구 칸이 안 보이면 <code>execution/sql/document_defaults.sql</code> 을 실행하세요.<br />
                    ※ 여기서 고친 값은 <b>다음에 만드는 문서부터</b> 반영됩니다. 이미 발행한 견적서는
                    그때 모습 그대로 남습니다 — 나중에 값이 바뀌었다고 예전 견적서가 달라지면 안 됩니다.
                </p>
            </div>
        </div>
    )
}

export default CompanyProfilePanel
