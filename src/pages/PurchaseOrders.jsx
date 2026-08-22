import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, Printer, Trash2, Loader2, Save, X, FileText, ArrowLeft, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { saveWithFreshNo, todayLocal } from '../utils/docNumber'
import { printAs, poFileName } from '../utils/printDoc'
import { showError, showConfirm, showSuccess } from '../utils/alert'
import { ProductPicker } from '../components/ItemPicker'
import { PurchaseOrderSheet } from '../components/DocumentSheet'

/**
 * 발주서 — 우리가 협력업체에 보내는 문서
 *
 * 견적서와 달리 **사진이 필요 없다.** 받는 쪽이 이미 뭘 만드는지 아는 업체라
 * 품목명·규격·수량·단가만 정확하면 된다. 일반적인 발주서 양식 그대로 낸다.
 *
 * PDF는 견적서와 같이 브라우저 인쇄로 만든다.
 */

const VAT_RATE = 0.1
const won = (v) => Math.round(Number(v) || 0).toLocaleString('ko-KR')
const num = (v) => { const n = Number(String(v).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0 }

const STATUS = ['작성중', '발송', '입고', '취소']
/* 견적서와 같은 단계 색: 회색(아직) -> 겨자(공을 넘겼다) -> 초록(들어왔다) */
const STATUS_COLOR = { 작성중: '#6B7280', 발송: '#8a6b00', 입고: '#007538', 취소: '#9fa0a0' }

const emptyLine = () => ({
    key: Math.random().toString(36).slice(2),
    product_id: null, name: '', spec: '', quantity: 1, unit: 'EA', unit_price: 0, note: '',
})

const PurchaseOrders = () => {
    const [list, setList] = useState([])
    const [products, setProducts] = useState([])
    const [company, setCompany] = useState({})
    const [loading, setLoading] = useState(true)
    const [tableMissing, setTableMissing] = useState(false)

    const [editing, setEditing] = useState(null)
    const [saving, setSaving] = useState(false)
    const [pickFor, setPickFor] = useState(null)
    const [printing, setPrinting] = useState(null)
    const [q, setQ] = useState('')                 // 번호·업체 검색
    const [statusFilter, setStatusFilter] = useState('전체')

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('purchase_orders').select('*').order('po_date', { ascending: false }).limit(300)
            if (error) {
                if (error.code === '42P01' || error.code === 'PGRST205' ||
                    /does not exist|could not find the table/i.test(error.message || '')) {
                    setTableMissing(true); return
                }
                throw error
            }
            setTableMissing(false)
            setList(data || [])

            const [p, c] = await Promise.all([
                supabase.from('products').select('id,name,standard').order('name').limit(2000),
                supabase.from('company_profile').select('*').eq('id', 1).maybeSingle(),
            ])
            setProducts(p.data || [])
            setCompany(c.data || {})
        } catch (e) {
            console.error('발주서 조회 실패:', e)
            await showError(e.message || '발주서를 불러오지 못했습니다.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const totals = useMemo(() => {
        const lines = editing?.lines || []
        const subtotal = lines.reduce((a, l) => a + num(l.quantity) * num(l.unit_price), 0)
        const vat = Math.round(subtotal * VAT_RATE)
        return { subtotal, vat, total: subtotal + vat }
    }, [editing])

    // 번호는 여기서 짓지 않는다. 저장할 때 DB를 보고 붙인다 (utils/docNumber.js).
    // 미리 지어 두면 창을 열어 둔 사이에 남이 같은 번호를 써 버린다.
    // 목록은 300건까지 쌓인다. 찾을 수단이 없으면 목록이 아니라 더미다.
    const shown = useMemo(() => {
        const term = q.trim().toLowerCase()
        return list.filter((r) => {
            if (statusFilter !== '전체' && r.status !== statusFilter) return false
            if (!term) return true
            return String(r.po_no || '').toLowerCase().includes(term)
                || String(r.vendor_name || '').toLowerCase().includes(term)
        })
    }, [list, q, statusFilter])

    const shownTotal = useMemo(() => shown.reduce((a, r) => a + num(r.total), 0), [shown])

    const newOrder = () => {
        setEditing({
            head: {
                po_no: '',
                po_date: todayLocal(), vendor_name: '', vendor_contact: '', vendor_phone: '', vendor_email: '',
                delivery_date: '', delivery_to: '', status: '작성중', notes: '',
            },
            lines: [emptyLine()],
        })
    }

    const openOrder = async (o) => {
        const { data, error } = await supabase.from('po_items').select('*').eq('po_id', o.id).order('line_no')
        if (error) { await showError(error.message); return }
        setEditing({ head: { ...o }, lines: (data || []).map((r) => ({ ...r, key: r.id })) })
    }

    const setHead = (patch) => setEditing((e) => ({ ...e, head: { ...e.head, ...patch } }))
    const setLine = (key, patch) =>
        setEditing((e) => ({ ...e, lines: e.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }))

    const save = async () => {
        const h = editing.head
        if (!h.vendor_name?.trim()) { await showError('공급업체를 넣어 주세요.'); return }
        const lines = editing.lines.filter((l) => l.name?.trim())
        if (lines.length === 0) { await showError('품목을 하나 이상 넣어 주세요.'); return }

        setSaving(true)
        try {
            const payload = {
                po_no: h.po_no, po_date: h.po_date,
                vendor_name: h.vendor_name.trim(), vendor_contact: h.vendor_contact || null,
                vendor_phone: h.vendor_phone || null, vendor_email: h.vendor_email || null,
                delivery_date: h.delivery_date || null, delivery_to: h.delivery_to || null,
                subtotal: totals.subtotal, vat: totals.vat, total: totals.total,
                status: h.status, notes: h.notes || null, updated_at: new Date().toISOString(),
            }

            let poId = h.id
            let poNo = h.po_no
            if (poId) {
                const { error } = await supabase.from('purchase_orders').update(payload).eq('id', poId)
                if (error) throw error
                await supabase.from('po_items').delete().eq('po_id', poId)
            } else {
                // 번호는 저장 직전에 DB를 보고 짓는다. 겹치면 다시 지어 재시도한다.
                const { no, result } = await saveWithFreshNo(
                    supabase,
                    { table: 'purchase_orders', column: 'po_no', prefix: 'PO', date: payload.po_date },
                    async (candidate) => {
                        const { data, error } = await supabase
                            .from('purchase_orders').insert([{ ...payload, po_no: candidate }]).select().single()
                        if (error) throw error
                        return data
                    },
                )
                poId = result.id
                poNo = no
            }

            const rows = lines.map((l, i) => ({
                po_id: poId, line_no: i + 1, product_id: l.product_id,
                name: l.name.trim(), spec: l.spec || null,
                quantity: num(l.quantity), unit: l.unit || 'EA',
                unit_price: num(l.unit_price), amount: num(l.quantity) * num(l.unit_price),
                note: l.note || null,
            }))
            const { error: itemErr } = await supabase.from('po_items').insert(rows)
            if (itemErr) throw itemErr

            await showSuccess(`발주서 ${poNo} 저장했습니다.`)
            setEditing(null)
            await load()
        } catch (e) {
            await showError(e.message || '저장하지 못했습니다.')
        } finally {
            setSaving(false)
        }
    }

    const removeOrder = async (o) => {
        if (!(await showConfirm(`발주서 ${o.po_no}를 지웁니다.`, '삭제'))) return
        const { error } = await supabase.from('purchase_orders').delete().eq('id', o.id)
        if (error) { await showError(error.message); return }
        await load()
    }

    const print = async (o) => {
        const { data } = await supabase.from('po_items').select('*').eq('po_id', o.id).order('line_no')
        setPrinting({ head: o, lines: data || [] })
    }

    /*
     * **인쇄창을 자동으로 열지 않는다.** 미리보기로 넘어가자마자 인쇄창이
     * 떠 버리면, 화면을 확인할 새도 없이 '대상'을 고르라는 창이 튀어나와
     * 놀라게 된다. 문서를 먼저 보고 사람이 누를 때 연다.
     */

    if (tableMissing) {
        return (
            <div className="win" style={{ margin: 12 }}>
                <div className="win-title"><span>발주서</span></div>
                <p style={{ padding: 16, margin: 0, fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                    아직 준비되지 않았습니다. Supabase SQL Editor에서{' '}
                    <code>execution/sql/quotes_and_orders.sql</code> 을 실행하면 나타납니다.
                </p>
            </div>
        )
    }

    if (printing) {
        return (
            <div className="doc-preview" style={{ background: '#e9ecef', minHeight: '100vh', padding: 16 }}>
                <div className="toolbar doc-no-print" style={{ maxWidth: '210mm', margin: '0 auto 12px' }}>
                    <button className="tb-btn" onClick={() => setPrinting(null)}><ArrowLeft size={14} /> 돌아가기</button>
                    <button className="tb-btn primary" onClick={() => printAs(poFileName(printing.head))}><Printer size={14} /> PDF로 저장</button>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                        인쇄창에서 '대상'을 <b>PDF로 저장</b>으로 고르면 파일로 나옵니다.
                    </span>
                </div>
                <PurchaseOrderSheet order={printing.head} items={printing.lines} company={company} />
            </div>
        )
    }

    if (editing) {
        const h = editing.head
        return (
            <div className="win" style={{ margin: 12 }}>
                <div className="win-title">
                    <span>{h.id ? '발주서 수정' : '새 발주서'}</span>
                    <span className="meta">{h.po_no || '저장하면 번호가 매겨집니다'}</span>
                </div>

                <div className="toolbar">
                    <button className="tb-btn primary" onClick={save} disabled={saving}>
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 저장
                    </button>
                    <button className="tb-btn" onClick={() => setEditing(null)}><X size={14} /> 취소</button>
                </div>

                <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                    <label style={{ fontSize: 12 }}>공급업체
                        <input value={h.vendor_name} onChange={(e) => setHead({ vendor_name: e.target.value })} style={{ width: '100%' }} />
                    </label>
                    <label style={{ fontSize: 12 }}>담당자
                        <input value={h.vendor_contact || ''} onChange={(e) => setHead({ vendor_contact: e.target.value })} style={{ width: '100%' }} />
                    </label>
                    <label style={{ fontSize: 12 }}>연락처
                        <input value={h.vendor_phone || ''} onChange={(e) => setHead({ vendor_phone: e.target.value })} style={{ width: '100%' }} />
                    </label>
                    <label style={{ fontSize: 12 }}>이메일
                        <input value={h.vendor_email || ''} onChange={(e) => setHead({ vendor_email: e.target.value })} style={{ width: '100%' }} />
                    </label>
                    <label style={{ fontSize: 12 }}>발주일자
                        <input type="date" value={h.po_date} onChange={(e) => setHead({ po_date: e.target.value })} style={{ width: '100%' }} />
                    </label>
                    <label style={{ fontSize: 12 }}>납기일
                        <input type="date" value={h.delivery_date || ''} onChange={(e) => setHead({ delivery_date: e.target.value })} style={{ width: '100%' }} />
                    </label>
                    <label style={{ fontSize: 12 }}>납품장소
                        <input value={h.delivery_to || ''} placeholder={company.address || ''}
                            onChange={(e) => setHead({ delivery_to: e.target.value })} style={{ width: '100%' }} />
                    </label>
                    <label style={{ fontSize: 12 }}>상태
                        <select value={h.status} onChange={(e) => setHead({ status: e.target.value })} style={{ width: '100%' }}>
                            {STATUS.map((s) => <option key={s}>{s}</option>)}
                        </select>
                    </label>
                </div>

                <div className="filterbar"><b style={{ fontSize: 12 }}>품목</b>
                    <button className="tb-btn" style={{ marginLeft: 'auto' }}
                        onClick={() => setEditing((e) => ({ ...e, lines: [...e.lines, emptyLine()] }))}>
                        <Plus size={13} /> 줄 추가
                    </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table className="dgrid">
                        <thead>
                            <tr>
                                <th className="seq" style={{ width: 34 }}>#</th>
                                <th style={{ minWidth: 180 }}>품목</th>
                                <th style={{ minWidth: 120 }}>규격</th>
                                <th style={{ minWidth: 80 }}>수량</th>
                                <th style={{ minWidth: 100 }}>단가</th>
                                <th style={{ minWidth: 110, textAlign: 'right' }}>금액</th>
                                <th style={{ width: 40 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {editing.lines.map((l, i) => (
                                <tr key={l.key}>
                                    <td className="seq">{i + 1}</td>
                                    <td style={{ display: 'flex', gap: 4 }}>
                                        <input value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })} style={{ flex: 1 }} />
                                        <button className="rowbtn" onClick={() => setPickFor(l.key)} title="품목 고르기">…</button>
                                    </td>
                                    <td><input value={l.spec || ''} onChange={(e) => setLine(l.key, { spec: e.target.value })} /></td>
                                    <td><input value={l.quantity} style={{ textAlign: 'right' }} onChange={(e) => setLine(l.key, { quantity: e.target.value })} /></td>
                                    <td><input value={l.unit_price} style={{ textAlign: 'right' }} onChange={(e) => setLine(l.key, { unit_price: e.target.value })} /></td>
                                    <td className="num">{won(num(l.quantity) * num(l.unit_price))}</td>
                                    <td>
                                        <button className="rowbtn" onClick={() => setEditing((e) => ({ ...e, lines: e.lines.filter((x) => x.key !== l.key) }))}>
                                            <Trash2 size={12} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div style={{ padding: 12 }}>
                    <label style={{ fontSize: 12, display: 'block' }}>비고
                        <textarea value={h.notes || ''} rows={3} onChange={(e) => setHead({ notes: e.target.value })}
                            style={{ width: '100%', resize: 'vertical' }} />
                    </label>
                </div>

                <div className="statusbar">
                    <span>공급가액 {won(totals.subtotal)}원</span>
                    <span>부가세 {won(totals.vat)}원</span>
                    <span style={{ fontWeight: 700 }}>합계 {won(totals.total)}원</span>
                </div>

                {pickFor && (
                    <ProductPicker products={products}
                        onPick={(p) => setLine(pickFor, { product_id: p.id, name: p.name, spec: p.standard || '' })}
                        onClose={() => setPickFor(null)} />
                )}
            </div>
        )
    }

    return (
        <div className="win" style={{ margin: 12 }}>
            <div className="win-title">
                <span>발주서</span>
                <span className="meta">{list.length}건</span>
            </div>

            <div className="toolbar">
                <button className="tb-btn primary" onClick={newOrder}><Plus size={14} /> 새 발주서</button>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 6 }}>
                    <Search size={14} style={{ color: 'var(--text-muted)' }} />
                    <input value={q} onChange={(e) => setQ(e.target.value)}
                        placeholder="발주번호 · 공급업체" style={{ width: 180 }} />
                </span>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option>전체</option>
                    {STATUS.map((x) => <option key={x}>{x}</option>)}
                </select>
                {loading && <Loader2 size={14} className="animate-spin" />}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>
                    {shown.length}건 · 합계 <b style={{ color: 'var(--text-primary)' }}>{won(shownTotal)}</b>
                </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table className="dgrid">
                    <thead>
                        <tr>
                            <th style={{ minWidth: 130 }}>발주번호</th>
                            <th style={{ minWidth: 96 }}>일자</th>
                            <th style={{ minWidth: 160 }}>공급업체</th>
                            <th style={{ minWidth: 96 }}>납기</th>
                            <th style={{ minWidth: 120, textAlign: 'right' }}>합계</th>
                            <th style={{ minWidth: 70 }}>상태</th>
                            <th style={{ width: 96 }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((o) => (
                            <tr key={o.id}>
                                <td><button className="rowbtn doc-no-btn" onClick={() => openOrder(o)}>{o.po_no}</button></td>
                                <td className="dt">{String(o.po_date).slice(0, 10)}</td>
                                <td>{o.vendor_name}</td>
                                <td className="dt">{o.delivery_date ? String(o.delivery_date).slice(0, 10) : '-'}</td>
                                <td className="num">{won(o.total)}</td>
                                <td><span style={{ fontSize: 11.5, fontWeight: 700, color: STATUS_COLOR[o.status] || '#6B7280' }}>{o.status}</span></td>
                                <td>
                                    <button className="rowbtn" onClick={() => print(o)} title="인쇄 / PDF"><Printer size={13} /></button>
                                    <button className="rowbtn" onClick={() => removeOrder(o)} title="삭제"><Trash2 size={13} /></button>
                                </td>
                            </tr>
                        ))}
                        {shown.length === 0 && !loading && (
                            <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>
                                <FileText size={20} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.5 }} />
                                {list.length === 0 ? (
                                    <>
                                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                                            아직 작성한 발주서가 없습니다
                                        </div>
                                        <div style={{ fontSize: 12.5, lineHeight: 1.8 }}>
                                            협력업체에 보내는 문서입니다. 견적서와 달리 사진 없이 나갑니다.<br />
                                            인쇄에서 <b>PDF로 저장</b>을 고르면 업체명이 붙은 파일로 받습니다.
                                        </div>
                                        <button className="tb-btn primary" style={{ marginTop: 12 }} onClick={newOrder}>
                                            <Plus size={13} /> 첫 발주서 만들기
                                        </button>
                                    </>
                                ) : '조건에 맞는 발주서가 없습니다.'}
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default PurchaseOrders
