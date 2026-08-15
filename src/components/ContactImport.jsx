import React, { useState, useMemo } from 'react'
import { Upload, Loader2, Check, X, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useData } from '../contexts/DataContext'
import { parseContacts, matchContacts } from '../utils/contactImport'
import { showError, showSuccess } from '../utils/alert'

/**
 * 휴대폰 연락처 가져오기 (설정 화면)
 *
 * 거래처 1,150곳 중 연락처가 있는 곳이 71곳뿐인데, 정작 휴대폰에는 다 있다.
 * 활동 메모에서 뽑은 이름·직급은 있어도 **전화번호는 한 건도 없다** —
 * 메모에 안 적기 때문이다. 번호는 휴대폰에서만 온다.
 *
 * **회사명이 정확히 맞는 것만 자동으로 붙인다.** 비슷한 이름을 알아서 이어
 * 붙이면 엉뚱한 거래처에 남의 연락처가 들어가고, 되돌리기 어렵다.
 * 못 맞춘 것은 목록으로 보여주고 사람이 거래처를 고르게 한다.
 */
const ContactImport = () => {
    const { clients, refreshData } = useData()
    const [rows, setRows] = useState(null)
    const [busy, setBusy] = useState(false)
    const [picks, setPicks] = useState({})     // 못 맞춘 것에 사람이 고른 거래처
    const [fileName, setFileName] = useState('')

    const read = async (file) => {
        if (!file) return
        setBusy(true)
        try {
            const text = await file.text()
            const parsed = parseContacts(text)
            if (parsed.length === 0) {
                await showError('연락처를 하나도 읽지 못했습니다. .vcf 또는 구글 주소록 CSV인지 확인해 주세요.')
                return
            }
            setFileName(file.name)
            setRows(matchContacts(parsed, clients))
            setPicks({})
        } catch (e) {
            await showError(e.message || '파일을 읽지 못했습니다.')
        } finally {
            setBusy(false)
        }
    }

    /** 실제로 넣을 것 = 자동으로 맞은 것 + 사람이 고른 것 */
    const toSave = useMemo(() => {
        if (!rows) return []
        const picked = rows.unmatched
            .map((c, i) => (picks[i] ? { ...c, clientId: picks[i] } : null))
            .filter(Boolean)
        return [...rows.matched, ...picked]
    }, [rows, picks])

    const apply = async () => {
        if (toSave.length === 0) { await showError('넣을 연락처가 없습니다.'); return }
        setBusy(true)
        try {
            // 이미 있는 사람은 건드리지 않는다 (손으로 넣은 것이 더 정확하다)
            const ids = [...new Set(toSave.map((c) => c.clientId))]
            const { data: existing } = await supabase
                .from('client_contacts').select('client_id,name').in('client_id', ids)
            const has = new Set((existing || []).map((e) => `${e.client_id}|${String(e.name).trim()}`))

            const fresh = toSave.filter((c) => !has.has(`${c.clientId}|${String(c.name).trim()}`))
            if (fresh.length === 0) {
                await showSuccess('이미 다 들어 있습니다. 새로 넣을 연락처가 없습니다.')
                return
            }

            // 거래처마다 첫 사람을 대표로 — 대표가 없으면 화면에 전화번호가 안 뜬다
            const seen = new Set((existing || []).map((e) => e.client_id))
            const payload = fresh.map((c) => {
                const first = !seen.has(c.clientId)
                seen.add(c.clientId)
                return {
                    client_id: c.clientId,
                    name: c.name || '(이름 없음)',
                    department_role: c.title || null,   // 표의 컬럼 이름이 role이 아니다
                    phone: c.phone || null,
                    email: c.email || null,
                    is_primary: first,
                }
            })

            const { error } = await supabase.from('client_contacts').insert(payload)
            if (error) throw error
            await showSuccess(`연락처 ${payload.length}명을 넣었습니다.`)
            setRows(null); setPicks({}); setFileName('')
            await refreshData()
        } catch (e) {
            await showError(e.message || '저장하지 못했습니다.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="win">
            <div className="win-title">
                <span><Users size={13} style={{ verticalAlign: -2, marginRight: 4 }} />휴대폰 연락처 가져오기</span>
                <span className="meta">.vcf · 구글 주소록 CSV</span>
            </div>

            <div className="toolbar" style={{ flexWrap: 'wrap', gap: 6 }}>
                <label className="tb-btn primary" style={{ cursor: busy ? 'wait' : 'pointer' }}>
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} 파일 고르기
                    <input type="file" accept=".vcf,.csv,text/vcard,text/csv" style={{ display: 'none' }}
                        onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
                </label>
                {fileName && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fileName}</span>}
                {rows && (
                    <button className="tb-btn primary" onClick={apply} disabled={busy || toSave.length === 0}
                        style={{ marginLeft: 'auto' }}>
                        <Check size={13} /> {toSave.length}명 넣기
                    </button>
                )}
            </div>

            {!rows ? (
                <div style={{ padding: 14, fontSize: 12.5, lineHeight: 1.85, color: 'var(--text-secondary)' }}>
                    <b style={{ color: 'var(--text-primary)' }}>안드로이드에서 연락처 내보내기</b>
                    <ol style={{ margin: '6px 0 10px', paddingLeft: 18 }}>
                        <li>PC 브라우저에서 <b>contacts.google.com</b> 접속 (휴대폰과 같은 계정)</li>
                        <li>왼쪽 아래 <b>내보내기</b> → <b>Google CSV</b> 또는 <b>vCard</b> 선택</li>
                        <li>받은 파일을 여기서 고르면 됩니다</li>
                    </ol>
                    휴대폰에서 바로 하려면 <b>연락처 앱 → 설정 → 내보내기 → .vcf 파일</b>로 저장한 뒤
                    그 파일을 올려도 됩니다.
                    <p style={{ margin: '10px 0 0' }}>
                        ※ <b>회사명이 거래처와 정확히 맞는 것만</b> 자동으로 붙습니다. 비슷한 이름을
                        알아서 이어 붙이면 엉뚱한 거래처에 남의 연락처가 들어갑니다.<br />
                        ※ 못 맞춘 연락처는 아래 목록에서 거래처를 직접 고를 수 있습니다.<br />
                        ※ 이미 같은 이름이 있는 거래처는 건너뜁니다.
                    </p>
                </div>
            ) : (
                <div style={{ padding: 12 }}>
                    <div className="statusbar" style={{ marginBottom: 8 }}>
                        <span>읽은 연락처 {rows.matched.length + rows.unmatched.length}명</span>
                        <span style={{ color: 'var(--success)', fontWeight: 700 }}>거래처 확인 {rows.matched.length}명</span>
                        <span>확인 필요 {rows.unmatched.length}명</span>
                    </div>

                    {rows.matched.length > 0 && (
                        <>
                            <h4 style={{ margin: '10px 0 5px', fontSize: 12.5 }}>거래처를 찾은 연락처</h4>
                            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                                <table className="dgrid">
                                    <thead>
                                        <tr>
                                            <th style={{ minWidth: 100 }}>이름</th>
                                            <th style={{ minWidth: 70 }}>직급</th>
                                            <th style={{ minWidth: 120 }}>전화</th>
                                            <th style={{ minWidth: 160 }}>거래처</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.matched.slice(0, 200).map((c, i) => (
                                            <tr key={i}>
                                                <td>{c.name}</td>
                                                <td>{c.title || '-'}</td>
                                                <td className="num">{c.phone || '-'}</td>
                                                <td>{c.clientName}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {rows.unmatched.length > 0 && (
                        <>
                            <h4 style={{ margin: '14px 0 5px', fontSize: 12.5 }}>
                                거래처를 못 찾은 연락처 — 고르면 함께 들어갑니다
                            </h4>
                            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                                <table className="dgrid">
                                    <thead>
                                        <tr>
                                            <th style={{ minWidth: 100 }}>이름</th>
                                            <th style={{ minWidth: 120 }}>전화</th>
                                            <th style={{ minWidth: 130 }}>휴대폰의 회사명</th>
                                            <th style={{ minWidth: 180 }}>거래처 고르기</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.unmatched.slice(0, 300).map((c, i) => (
                                            <tr key={i}>
                                                <td>{c.name}</td>
                                                <td className="num">{c.phone || '-'}</td>
                                                <td style={{ color: 'var(--text-secondary)' }}>{c.org || '—'}</td>
                                                <td>
                                                    <select value={picks[i] || ''}
                                                        onChange={(e) => setPicks((p) => ({ ...p, [i]: e.target.value }))}>
                                                        <option value="">넣지 않음</option>
                                                        {(clients || []).slice(0, 400).map((cl) => (
                                                            <option key={cl.id} value={cl.id}>{cl.company}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {rows.unmatched.length > 300 && (
                                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                                    300명까지 보여줍니다. 휴대폰 연락처에는 거래처가 아닌 사람도 많으니
                                    자동으로 맞은 것부터 넣고 나머지는 필요할 때 넣으세요.
                                </p>
                            )}
                        </>
                    )}

                    <div style={{ marginTop: 10 }}>
                        <button className="tb-btn" onClick={() => { setRows(null); setPicks({}); setFileName('') }}>
                            <X size={13} /> 취소
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default ContactImport
