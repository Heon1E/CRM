import React, { useState, useMemo, useEffect } from 'react'
import { FileText, Printer, ArrowLeft, Search, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useData } from '../contexts/DataContext'
import { StatementSheet } from '../components/DocumentSheet'
import { printAs } from '../utils/printDoc'
import { showError } from '../utils/alert'

/**
 * 거래명세서
 *
 * **새 표를 만들지 않는다.** 이미 쌓여 있는 매출을 거래처·기간으로 잘라 문서로
 * 낸다. 따로 저장하면 매출과 명세서가 어긋나는 순간 어느 쪽이 맞는지 알 수 없다.
 *
 * 고객은 이걸 받아 자기 장부와 맞춰 보고 결제한다. 그래서 채권 자료가 있으면
 * 잔액·연체를 함께 붙인다 — 그게 결제를 재촉하는 실제 근거다.
 */
const won = (v) => Math.round(Number(v) || 0).toLocaleString('ko-KR')
const VAT_RATE = 0.1

/** 이번 달 1일 ~ 오늘 (로컬 기준). `toISOString()`은 UTC라 하루 밀린다. */
const monthRange = (offset = 0) => {
    const now = new Date()
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { from: fmt(first), to: fmt(last) }
}

const Statements = () => {
    const { clients, sales } = useData()
    const [q, setQ] = useState('')
    const [clientId, setClientId] = useState('')
    const [range, setRange] = useState(() => monthRange(-1))   // 기본은 지난달 — 보통 마감 후 보낸다
    const [notes, setNotes] = useState('')
    const [company, setCompany] = useState({})
    const [receivable, setReceivable] = useState(null)
    const [printing, setPrinting] = useState(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        supabase.from('company_profile').select('*').eq('id', 1).maybeSingle()
            .then(({ data }) => setCompany(data || {}))
    }, [])

    const shownClients = useMemo(() => {
        const term = q.trim().toLowerCase()
        const list = (clients || []).filter((c) => !term || String(c.company || '').toLowerCase().includes(term))
        return list.slice(0, 100)
    }, [clients, q])

    const client = useMemo(() => (clients || []).find((c) => c.id === clientId), [clients, clientId])

    /** 고른 거래처의 그 기간 매출. 날짜순으로 세운다 — 고객이 장부와 맞춰 본다. */
    const rows = useMemo(() => {
        if (!clientId) return []
        return (sales || [])
            .filter((s) => {
                if (s.client_id !== clientId) return false
                const d = String(s.sale_date || s.date || '').slice(0, 10)
                return d >= range.from && d <= range.to
            })
            .sort((a, b) => String(a.sale_date).localeCompare(String(b.sale_date)))
    }, [sales, clientId, range])

    const totals = useMemo(() => {
        const subtotal = rows.reduce((a, r) => a + (Number(r.total_amount ?? r.totalAmount) || 0), 0)
        const vat = Math.round(subtotal * VAT_RATE)
        return { subtotal, vat, total: subtotal + vat }
    }, [rows])

    /** 채권 스냅샷이 있으면 붙인다. 없어도 명세만으로 문서는 성립한다. */
    const openPrint = async () => {
        if (!client) { await showError('거래처를 고르세요.'); return }
        if (rows.length === 0) { await showError('그 기간에 거래가 없습니다.'); return }
        setLoading(true)
        let rec = null
        try {
            const baseMonth = range.to.slice(0, 7)
            const { data } = await supabase.from('receivables')
                .select('base_month,balance,overdue_amount,aging_months')
                .eq('client_id', clientId).eq('base_month', baseMonth).maybeSingle()
            rec = data || null
        } catch { /* 채권 표가 없어도 명세서는 나가야 한다 */ }
        setReceivable(rec)
        setPrinting({
            client_name: client.company,
            contact_name: client.contact_person,
            contact_phone: client.phone,
            from: range.from, to: range.to,
            notes,
            receivable: rec,
            ...totals,
        })
        setLoading(false)
    }

    const fileName = printing
        ? ['거래명세서', printing.client_name, `${printing.from}~${printing.to}`].join('_')
        : ''

    useEffect(() => {
        if (!printing) return
        const t = setTimeout(() => printAs(fileName), 400)
        return () => clearTimeout(t)
    }, [printing, fileName])

    if (printing) {
        return (
            <div style={{ background: '#e9ecef', minHeight: '100vh', padding: 16 }}>
                <div className="toolbar doc-no-print" style={{ maxWidth: '210mm', margin: '0 auto 12px' }}>
                    <button className="tb-btn" onClick={() => setPrinting(null)}><ArrowLeft size={14} /> 돌아가기</button>
                    <button className="tb-btn primary" onClick={() => printAs(fileName)}>
                        <Printer size={14} /> PDF로 저장
                    </button>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                        인쇄창에서 '대상'을 <b>PDF로 저장</b>으로 고르세요.
                    </span>
                </div>
                <StatementSheet statement={printing} items={rows} company={company} />
            </div>
        )
    }

    return (
        <div className="win" style={{ margin: 12 }}>
            <div className="win-title">
                <span>거래명세서</span>
                <span className="meta">매출 자료로 만듭니다</span>
            </div>

            <div className="toolbar" style={{ flexWrap: 'wrap', gap: 6 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Search size={14} style={{ color: 'var(--text-muted)' }} />
                    <input value={q} onChange={(e) => setQ(e.target.value)}
                        placeholder="거래처 찾기" style={{ width: 160 }} />
                </span>
                <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ minWidth: 220 }}>
                    <option value="">거래처를 고르세요</option>
                    {shownClients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
                </select>

                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
                    <span style={{ color: 'var(--text-muted)' }}>~</span>
                    <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
                </span>
                <button className="tb-btn" onClick={() => setRange(monthRange(-1))}>지난달</button>
                <button className="tb-btn" onClick={() => setRange(monthRange(0))}>이번달</button>

                <button className="tb-btn primary" onClick={openPrint} disabled={loading || !clientId}>
                    {loading ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} 명세서 만들기
                </button>
            </div>

            {clientId ? (
                <>
                    <div className="statusbar">
                        <span>{client?.company}</span>
                        <span>{range.from} ~ {range.to}</span>
                        <span>{rows.length}건</span>
                        <span style={{ fontWeight: 700 }}>합계 {won(totals.total)}원 (부가세 포함)</span>
                    </div>

                    <div style={{ overflowX: 'auto', maxHeight: 380, overflowY: 'auto' }}>
                        <table className="dgrid">
                            <thead>
                                <tr>
                                    <th style={{ minWidth: 96 }}>일자</th>
                                    <th style={{ minWidth: 180 }}>품목</th>
                                    <th style={{ minWidth: 70, textAlign: 'right' }}>수량</th>
                                    <th style={{ minWidth: 90, textAlign: 'right' }}>단가</th>
                                    <th style={{ minWidth: 110, textAlign: 'right' }}>금액</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.id}>
                                        <td className="dt">{String(r.sale_date).slice(0, 10)}</td>
                                        <td>{r.item_name || '-'}</td>
                                        <td className="num">{won(r.quantity)}</td>
                                        <td className="num">{won(r.unit_price)}</td>
                                        <td className="num">{won(r.total_amount)}</td>
                                    </tr>
                                ))}
                                {rows.length === 0 && (
                                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>
                                        그 기간에 거래가 없습니다. 기간을 바꿔 보세요.
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ padding: 12 }}>
                        <label style={{ fontSize: 12 }}>비고 (이 명세서에만 들어갑니다)
                            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                                placeholder="예) 6월분 잔액은 7/10 입금 예정으로 확인했습니다."
                                style={{ width: '100%', resize: 'vertical', marginTop: 3 }} />
                        </label>
                    </div>
                </>
            ) : (
                <p style={{ padding: 20, margin: 0, textAlign: 'center', fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                    거래처와 기간을 고르면 그 기간의 거래 내역으로 명세서를 만듭니다.<br />
                    <b>새로 입력할 것이 없습니다</b> — 이미 등록된 매출을 그대로 씁니다.
                </p>
            )}
        </div>
    )
}

export default Statements
