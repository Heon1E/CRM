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
    const { clients, sales, ensureSalesDetail, salesDetailReady } = useData()

    // 명세서는 날짜·품목·수량·단가를 한 줄씩 보여준다 — 상세가 있어야 한다
    useEffect(() => { ensureSalesDetail() }, [ensureSalesDetail])
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

    /*
     * 고를 거래처 목록 — **최근 거래순으로 세운다.**
     *
     * 1,167곳을 `<select>`에 다 넣으면 느려서 100개로 자르는데, 예전에는
     * **가나다순 앞 100곳**을 잘랐다. 그래서 정작 명세서를 보낼 큰 거래처
     * (바커케미칼·현대드럼산업)가 목록에 아예 없었다 — 검색을 해야만 나온다.
     *
     * 거래명세서는 **거래한 곳에 보내는 문서**다. 최근에 산 곳이 위에 와야 한다.
     * 매출이 없는 곳은 뒤로 밀되 빼지는 않는다 (첫 거래 명세서도 있을 수 있다).
     */
    const lastSaleByClient = useMemo(() => {
        const m = new Map()
        ;(sales || []).forEach((x) => {
            const id = x.client_id || x.clientId
            if (!id) return
            const d = String(x.sale_date || x.date || '').slice(0, 10)
            if (d && d > (m.get(id) || '')) m.set(id, d)
        })
        return m
    }, [sales])

    const shownClients = useMemo(() => {
        const term = q.trim().toLowerCase()
        const list = (clients || []).filter((c) => !term || String(c.company || '').toLowerCase().includes(term))
        list.sort((a, b) => {
            const x = lastSaleByClient.get(a.id) || '', y = lastSaleByClient.get(b.id) || ''
            if (x !== y) return y.localeCompare(x)          // 최근 거래순
            return String(a.company || '').localeCompare(String(b.company || ''), 'ko')
        })
        return { rows: list.slice(0, 100), total: list.length }
    }, [clients, q, lastSaleByClient])

    const client = useMemo(() => (clients || []).find((c) => c.id === clientId), [clients, clientId])

    /**
     * 고른 거래처의 그 기간 매출. 날짜순으로 세운다 — 고객이 장부와 맞춰 본다.
     *
     * **`sales`는 주문 단위로 묶여 있다.** 한 주문에 품목이 여럿이면 `items[]`에
     * 들어 있고, 묶음 자체에는 `item_name`·`quantity`·`unit_price`가 없다.
     * 예전에는 묶음을 그대로 표에 넣어서 **품목이 `-`, 수량·단가가 `0`으로**
     * 나갔다(금액만 맞았다). 고객이 자기 장부와 맞춰 보는 문서라 치명적이다.
     * 품목 한 줄씩 펼친다.
     */
    const rows = useMemo(() => {
        if (!clientId) return []
        const groups = (sales || []).filter((s) => {
            if (s.client_id !== clientId) return false
            const d = String(s.sale_date || s.date || '').slice(0, 10)
            return d >= range.from && d <= range.to
        })
        /*
         * **줄마다 키를 만들어 둔다.**
         * 여기서 만드는 줄은 매출 묶음을 품목 단위로 편 것이라 `id`가 없다.
         * 그런데 화면에서 `key={r.id}`로 그리고 있어서 모든 줄의 키가
         * `undefined`였다 — React가 "unique key" 경고를 내고, 거래처나 기간을
         * 바꿀 때 줄을 짝지어 재사용하지 못해 매번 전부 다시 그린다.
         * 묶음 id가 있으면 그것을 쓰고, 없으면 날짜와 순번으로 만든다.
         */
        const lines = groups.flatMap((g, gi) => {
            const date = String(g.sale_date || g.date || '').slice(0, 10)
            const items = Array.isArray(g.items) ? g.items.filter(Boolean) : []
            const base = g.id || `${date}#${gi}`
            // 품목이 아직 안 왔으면(상세 로드 전) 묶음 한 줄로라도 금액은 맞춘다
            if (items.length === 0) {
                return [{
                    key: `${base}:0`,
                    sale_date: date, item_name: g.displayItemName || '',
                    quantity: 0, unit_price: 0,
                    total_amount: Number(g.total_amount ?? g.totalAmount) || 0,
                }]
            }
            return items.map((it, ii) => ({
                key: `${base}:${ii}`,
                sale_date: date,
                item_name: it.item_name || it.itemName || '',
                quantity: Number(it.quantity) || 0,
                unit_price: Number(it.unit_price) || 0,
                total_amount: Number(it.total_amount) || (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
            }))
        })
        return lines.sort((a, b) => String(a.sale_date).localeCompare(String(b.sale_date)))
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

    /*
     * **인쇄창을 자동으로 열지 않는다.** 미리보기로 넘어가자마자 인쇄창이
     * 떠 버리면, 화면을 확인할 새도 없이 '대상'을 고르라는 창이 튀어나와
     * 놀라게 된다. 문서를 먼저 보고 사람이 누를 때 연다.
     */

    if (printing) {
        return (
            <div className="doc-preview" style={{ background: '#e9ecef', minHeight: '100vh', padding: 16 }}>
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
                    {shownClients.rows.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.company}{lastSaleByClient.get(c.id) ? ` · ${lastSaleByClient.get(c.id)}` : ''}
                        </option>
                    ))}
                    {shownClients.total > shownClients.rows.length && (
                        <option disabled>― 최근 거래순 100곳만 보입니다. 나머지는 왼쪽 '거래처 찾기'로 ―</option>
                    )}
                </select>

                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
                    <span style={{ color: 'var(--text-muted)' }}>~</span>
                    <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
                </span>
                <button className="tb-btn" onClick={() => setRange(monthRange(-1))}>지난달</button>
                <button className="tb-btn" onClick={() => setRange(monthRange(0))}>이번달</button>

                {/* 품목이 오기 전에는 만들지 못하게 막는다 — 품목 없는 명세서는
                    고객이 장부와 맞춰 볼 수 없다 (DataContext의 ensureSalesDetail) */}
                <button className="tb-btn primary" onClick={openPrint} disabled={loading || !clientId || !salesDetailReady}>
                    {(loading || !salesDetailReady) ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                    {salesDetailReady ? ' 명세서 만들기' : ' 품목 불러오는 중…'}
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
                                {/*
                                  * **0원 줄에 표시를 단다.**
                                  *
                                  * 수량은 있는데 금액이 0인 줄이 매출 15,530행 중 1,285행이다.
                                  * 실측으로 두 무리로 갈린다 — 월말(마지막 3일) 331행은 71%가
                                  * 다음 달에 값이 붙어 다시 나오고(결제 이월), 월중 954행은 3%만
                                  * 재등장하며 품목이 전부 부속품이다(제리캔상부캡 211·가로대 186…)
                                  * — 샘플 무상공급·불량 교환이다.
                                  *
                                  * **어느 쪽인지 줄마다 단정하지 않는다.** 문서에 틀린 이유를
                                  * 적느니 '0원이 실수가 아니다'만 알린다. 고객은 자기 장부와
                                  * 맞춰 보다 0원을 보면 우리 실수로 여기고 전화한다.
                                  */}
                                {rows.map((r) => {
                                    const free = Number(r.total_amount) === 0 && Number(r.quantity) > 0
                                    return (
                                        <tr key={r.key} style={free ? { color: 'var(--text-secondary)' } : undefined}>
                                            <td className="dt">{String(r.sale_date).slice(0, 10)}</td>
                                            <td>
                                                {r.item_name || '-'}
                                                {free && <span style={{ marginLeft: 6, fontSize: 11 }}>(무상·이월)</span>}
                                            </td>
                                            <td className="num">{won(r.quantity)}</td>
                                            <td className="num">{won(r.unit_price)}</td>
                                            <td className="num">{won(r.total_amount)}</td>
                                        </tr>
                                    )
                                })}
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
