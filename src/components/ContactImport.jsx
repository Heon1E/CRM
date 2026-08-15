import React, { useState, useMemo } from 'react'
import { Upload, Loader2, Check, X, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useData } from '../contexts/DataContext'
import { parseContacts, matchWithSuggestions, refineContact, phoneKey, dedupeByPhone } from '../utils/contactImport'
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
    const [picks, setPicks] = useState({})     // 사람이 고른 거래처 (키: 목록 내 위치)
    const [fileName, setFileName] = useState('')
    const [clientQ, setClientQ] = useState('')  // 거래처 고르기 검색
    const [showRest, setShowRest] = useState(false)

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
            setRows(matchWithSuggestions(parsed, clients))
            setPicks({})
        } catch (e) {
            await showError(e.message || '파일을 읽지 못했습니다.')
        } finally {
            setBusy(false)
        }
    }

    /**
     * 실제로 넣을 것 = 회사명이 정확히 맞은 것 + 사람이 고른 것.
     * **후보는 자동으로 들어가지 않는다.** 고른 것만 들어간다.
     */
    const nameOf = useMemo(() => {
        const m = new Map((clients || []).map((c) => [c.id, c.company]))
        return (id) => m.get(id) || ''
    }, [clients])

    const toSave = useMemo(() => {
        if (!rows) return []
        const pick = (list, prefix) => list
            .map((c, i) => (picks[`${prefix}${i}`] ? { ...c, clientId: picks[`${prefix}${i}`] } : null))
            .filter(Boolean)
        // 거래처가 정해져야 이름을 다듬을 수 있다 — 그 거래처와 겹치는 앞부분만 지운다
        return [...rows.matched, ...pick(rows.suggested, 's'), ...pick(rows.rest, 'r')]
            .map((c) => ({ ...c, ...refineContact(c, c.clientName || nameOf(c.clientId)) }))
    }, [rows, picks, nameOf])

    /** 거래처 고르기 — 1,150곳을 다 띄우면 못 찾는다 */
    const clientOptions = useMemo(() => {
        const t = clientQ.trim().toLowerCase()
        const list = t
            ? (clients || []).filter((c) => String(c.company || '').toLowerCase().includes(t))
            : (clients || [])
        return list.slice(0, 200)
    }, [clients, clientQ])

    const ClientPicker = ({ k }) => (
        <select value={picks[k] || ''} onChange={(e) => setPicks((p) => ({ ...p, [k]: e.target.value }))}>
            <option value="">넣지 않음</option>
            {clientOptions.map((cl) => <option key={cl.id} value={cl.id}>{cl.company}</option>)}
        </select>
    )

    const apply = async () => {
        if (toSave.length === 0) { await showError('넣을 연락처가 없습니다.'); return }
        setBusy(true)
        try {
            // 이미 있는 사람은 건드리지 않는다 (손으로 넣은 것이 더 정확하다)
            const ids = [...new Set(toSave.map((c) => c.clientId))]
            const { data: existing } = await supabase
                .from('client_contacts').select('client_id,name,phone').is('deleted_at', null).in('client_id', ids)
            const has = new Set((existing || []).map((e) => `${e.client_id}|${String(e.name).trim()}`))
            // **번호가 사람의 기준이다.** 이름이 달라도 번호가 같으면 이미 있는 사람이다.
            const hasPhone = new Set((existing || [])
                .filter((e) => phoneKey(e.phone)).map((e) => `${e.client_id}|${phoneKey(e.phone)}`))

            // 올린 파일 안에서도 번호가 같으면 한 사람으로 접는다
            const byClient = new Map()
            for (const c of toSave) {
                if (!byClient.has(c.clientId)) byClient.set(c.clientId, [])
                byClient.get(c.clientId).push(c)
            }
            const folded = [...byClient.values()].flatMap((l) => dedupeByPhone(l, l[0].clientName))

            const fresh = folded.filter((c) => {
                const pk = phoneKey(c.phone)
                if (pk && hasPhone.has(`${c.clientId}|${pk}`)) return false
                return !has.has(`${c.clientId}|${String(c.name).trim()}`)
            })
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
                        ※ 이미 같은 이름이 있는 거래처는 건너뜁니다.<br />
                        ※ 이름에 회사·직급이 붙어 있으면(<b>범우화학공업 강병국 팀장</b>)
                        거래처에 넣을 때 <b>사람 이름과 직급으로 나눠</b> 담습니다.<br />
                        ※ <b>같은 번호는 같은 사람으로 봅니다.</b> 이름이 달라도(처음엔 <b>발주담당</b>,
                        명함 받고 <b>임인순 과장</b>) 한 건으로 합치고, 더 자세한 쪽을 남깁니다.
                    </p>
                </div>
            ) : (
                <div style={{ padding: 12 }}>
                    <div className="statusbar" style={{ marginBottom: 8 }}>
                        <span>읽은 연락처 {rows.matched.length + rows.suggested.length + rows.rest.length}명</span>
                        <span style={{ color: 'var(--success)', fontWeight: 700 }}>회사명 일치 {rows.matched.length}명</span>
                        <span style={{ color: 'var(--warning)', fontWeight: 700 }}>후보 {rows.suggested.length}명</span>
                        <span>단서 없음 {rows.rest.length}명</span>
                    </div>

                    <div className="toolbar" style={{ gap: 6, border: '1px solid var(--border-light)' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>거래처 찾기</span>
                        <input value={clientQ} onChange={(e) => setClientQ(e.target.value)}
                            placeholder="회사명 일부" style={{ width: 180 }} />
                        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                            아래 고르는 칸의 목록이 좁혀집니다
                        </span>
                    </div>

                    {rows.matched.length > 0 && (
                        <>
                            <h4 style={{ margin: '12px 0 5px', fontSize: 12.5 }}>
                                회사명이 정확히 맞은 연락처 — 바로 들어갑니다
                            </h4>
                            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
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
                                        {rows.matched.map((c, i) => {
                                            const f = refineContact(c, c.clientName)
                                            return (
                                            <tr key={i}>
                                                <td>{f.name}</td>
                                                <td>{f.title || '-'}</td>
                                                <td className="num">{c.phone || '-'}</td>
                                                <td>{c.clientName}</td>
                                            </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {rows.suggested.length > 0 && (
                        <>
                            <h4 style={{ margin: '14px 0 5px', fontSize: 12.5 }}>
                                이름에 거래처가 들어 있는 연락처 — <b style={{ color: 'var(--warning)' }}>확인하고 고르세요</b>
                            </h4>
                            <p style={{ margin: '0 0 5px', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                                자동으로 넣지 않습니다. `와이파인텍`이 `파인텍`으로 잡히는 것처럼 다른 회사일 수 있습니다.
                            </p>
                            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                                <table className="dgrid">
                                    <thead>
                                        <tr>
                                            <th style={{ minWidth: 150 }}>이름</th>
                                            <th style={{ minWidth: 120 }}>전화</th>
                                            <th style={{ minWidth: 130 }}>짐작한 거래처</th>
                                            <th style={{ minWidth: 180 }}>거래처 고르기</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.suggested.map((c, i) => (
                                            <tr key={i}>
                                                <td>{c.name}</td>
                                                <td className="num">{c.phone || '-'}</td>
                                                <td style={{ color: 'var(--warning)' }}>{c.clientName}</td>
                                                <td>
                                                    <ClientPicker k={`s${i}`} />
                                                    {!picks[`s${i}`] && (
                                                        <button className="rowbtn" style={{ marginLeft: 4 }}
                                                            onClick={() => setPicks((p) => ({ ...p, [`s${i}`]: c.clientId }))}>
                                                            맞음
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    <h4 style={{ margin: '14px 0 5px', fontSize: 12.5 }}>
                        단서 없는 연락처 {rows.rest.length}명
                        <button className="rowbtn" style={{ marginLeft: 6 }} onClick={() => setShowRest((v) => !v)}>
                            {showRest ? '접기' : '펼쳐서 고르기'}
                        </button>
                    </h4>
                    {showRest && (
                        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                            <table className="dgrid">
                                <thead>
                                    <tr>
                                        <th style={{ minWidth: 130 }}>이름</th>
                                        <th style={{ minWidth: 120 }}>전화</th>
                                        <th style={{ minWidth: 120 }}>휴대폰의 회사명</th>
                                        <th style={{ minWidth: 180 }}>거래처 고르기</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.rest.slice(0, 400).map((c, i) => (
                                        <tr key={i}>
                                            <td>{c.name}</td>
                                            <td className="num">{c.phone || '-'}</td>
                                            <td style={{ color: 'var(--text-secondary)' }}>{c.org || '—'}</td>
                                            <td><ClientPicker k={`r${i}`} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
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
