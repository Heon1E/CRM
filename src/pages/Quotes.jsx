import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, Printer, Trash2, Loader2, Save, X, FileText, ArrowLeft, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { resolveSalesRep } from '../utils/salesRep'
import { saveWithFreshNo, todayLocal } from '../utils/docNumber'
import { printAs, quoteFileName } from '../utils/printDoc'
import { syncQuoteToDeal } from '../services/dealSync'
import { showError, showConfirm, showSuccess } from '../utils/alert'
import { ProductPicker, AccessoryPicker, Thumb } from '../components/ItemPicker'
import { QuoteSheet } from '../components/DocumentSheet'

/**
 * 견적서 — 작성하고 PDF로 뽑는다
 *
 * 견적서는 고객이 보는 문서라 품목 사진과 악세서리(상부캡·밸브) 사진이 들어간다.
 * PDF는 브라우저 인쇄로 만든다 — 라이브러리를 쓰면 한글 폰트를 따로 심어야 하고
 * 표가 이미지로 나가 뭉갠다.
 *
 * 발행 시점의 품목명·규격·사진·단가를 라인에 통째로 복사해 둔다.
 * 나중에 카탈로그가 바뀌어도 **그때 낸 견적서는 그대로여야 하기 때문이다.**
 */

const VAT_RATE = 0.1
const won = (v) => Math.round(Number(v) || 0).toLocaleString('ko-KR')
const num = (v) => { const n = Number(String(v).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0 }

const STATUS = ['작성중', '발송', '수주', '실패', '취소']
const STATUS_COLOR = { 작성중: '#6B7280', 발송: '#1D4ED8', 수주: '#1C6B3C', 실패: '#B91C1C', 취소: '#6B7280' }

const emptyLine = () => ({
    key: Math.random().toString(36).slice(2),
    product_id: null, name: '', spec: '', image_url: null,
    accessories: [], quantity: 1, unit: 'EA', unit_price: 0, note: '',
})

const Quotes = () => {
    const { clients } = useData()
    const { user, salesRep: authSalesRep } = useAuth()
    const myRep = useMemo(() => authSalesRep || resolveSalesRep(user), [user, authSalesRep])

    const [list, setList] = useState([])
    const [products, setProducts] = useState([])
    const [accessories, setAccessories] = useState([])
    const [company, setCompany] = useState({})
    const [loading, setLoading] = useState(true)
    const [tableMissing, setTableMissing] = useState(false)

    const [editing, setEditing] = useState(null)   // { head, lines }
    const [saving, setSaving] = useState(false)
    const [pickFor, setPickFor] = useState(null)   // 품목 고르기 대상 줄
    const [accFor, setAccFor] = useState(null)     // 악세서리 고르기 대상 줄
    const [printing, setPrinting] = useState(null) // { head, lines }
    const [q, setQ] = useState('')                 // 번호·거래처 검색
    const [statusFilter, setStatusFilter] = useState('전체')

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('quotes').select('*').order('quote_date', { ascending: false }).limit(300)
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
                supabase.from('products').select('id,name,type,standard,image_url').order('name').limit(2000),
                supabase.from('company_profile').select('*').eq('id', 1).maybeSingle(),
            ])
            setProducts(p.data || [])
            // 악세서리도 품목이다. 따로 표를 두면 사진을 두 번 올려야 한다.
            setAccessories((p.data || []).filter((x) => ['캡', '밸브'].includes(x.type)))
            setCompany(c.data || {})
        } catch (e) {
            console.error('견적서 조회 실패:', e)
            await showError(e.message || '견적서를 불러오지 못했습니다.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    // ---- 합계 ----
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
            return String(r.quote_no || '').toLowerCase().includes(term)
                || String(r.client_name || '').toLowerCase().includes(term)
        })
    }, [list, q, statusFilter])

    const shownTotal = useMemo(() => shown.reduce((a, r) => a + num(r.total), 0), [shown])

    const newQuote = () => {
        setEditing({
            head: {
                quote_no: '',
                quote_date: todayLocal(), valid_days: 30,
                client_id: null, client_name: '', contact_name: '', contact_phone: '',
                status: '작성중', notes: '', sales_rep: myRep || '',
            },
            lines: [emptyLine()],
        })
    }

    const openQuote = async (q) => {
        const { data, error } = await supabase.from('quote_items').select('*').eq('quote_id', q.id).order('line_no')
        if (error) { await showError(error.message); return }
        setEditing({
            head: { ...q },
            lines: (data || []).map((r) => ({ ...r, key: r.id, accessories: r.accessories || [] })),
        })
    }

    const setHead = (patch) => setEditing((e) => ({ ...e, head: { ...e.head, ...patch } }))
    const setLine = (key, patch) =>
        setEditing((e) => ({ ...e, lines: e.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }))
    const removeLine = (key) =>
        setEditing((e) => ({ ...e, lines: e.lines.filter((l) => l.key !== key) }))

    const pickProduct = (p) => {
        // 발행 시점의 이름·규격·사진을 그대로 복사해 둔다
        setLine(pickFor, { product_id: p.id, name: p.name, spec: p.standard || '', image_url: p.image_url || null })
    }

    const toggleAccessory = (a) => {
        setEditing((e) => ({
            ...e,
            lines: e.lines.map((l) => {
                if (l.key !== accFor) return l
                const on = (l.accessories || []).some((s) => s.kind === a.type && s.name === a.name)
                const next = on
                    ? l.accessories.filter((s) => !(s.kind === a.type && s.name === a.name))
                    : [...(l.accessories || []), { kind: a.type, name: a.name, image_url: a.image_url || null }]
                return { ...l, accessories: next }
            }),
        }))
    }

    const save = async () => {
        const h = editing.head
        if (!h.client_name?.trim()) { await showError('거래처를 넣어 주세요.'); return }
        const lines = editing.lines.filter((l) => l.name?.trim())
        if (lines.length === 0) { await showError('품목을 하나 이상 넣어 주세요.'); return }

        setSaving(true)
        try {
            const payload = {
                quote_no: h.quote_no, quote_date: h.quote_date, valid_days: num(h.valid_days) || 30,
                client_id: h.client_id, client_name: h.client_name.trim(),
                contact_name: h.contact_name || null, contact_phone: h.contact_phone || null,
                subtotal: totals.subtotal, vat: totals.vat, total: totals.total,
                status: h.status, notes: h.notes || null, sales_rep: h.sales_rep || null,
                updated_at: new Date().toISOString(),
            }

            let quoteId = h.id
            let quoteNo = h.quote_no
            if (quoteId) {
                const { error } = await supabase.from('quotes').update(payload).eq('id', quoteId)
                if (error) throw error
                await supabase.from('quote_items').delete().eq('quote_id', quoteId)
            } else {
                // 번호는 저장 직전에 DB를 보고 짓는다. 겹치면 다시 지어 재시도한다.
                const { no, result } = await saveWithFreshNo(
                    supabase,
                    { table: 'quotes', column: 'quote_no', prefix: 'Q', date: payload.quote_date },
                    async (candidate) => {
                        const { data, error } = await supabase
                            .from('quotes').insert([{ ...payload, quote_no: candidate }]).select().single()
                        if (error) throw error
                        return data
                    },
                )
                quoteId = result.id
                quoteNo = no
            }

            const rows = lines.map((l, i) => ({
                quote_id: quoteId, line_no: i + 1,
                product_id: l.product_id, name: l.name.trim(), spec: l.spec || null, image_url: l.image_url || null,
                accessories: l.accessories || [],
                quantity: num(l.quantity), unit: l.unit || 'EA',
                unit_price: num(l.unit_price), amount: num(l.quantity) * num(l.unit_price),
                note: l.note || null,
            }))
            const { error: itemErr } = await supabase.from('quote_items').insert(rows)
            if (itemErr) throw itemErr

            // 견적을 냈다 = 파이프라인의 '제안' 단계다. 손으로 또 넣게 하면
            // 아무도 안 넣고 보드가 비어 버린다.
            const sync = await syncQuoteToDeal({ ...payload, id: quoteId, quote_no: quoteNo })
            await showSuccess(
                sync.created ? `견적서 ${quoteNo} 저장했습니다. 파이프라인에 '${sync.stage}' 기회로 올렸습니다.`
                    : sync.updated ? `견적서 ${quoteNo} 저장했습니다. 파이프라인 기회도 갱신했습니다.`
                        : `견적서 ${quoteNo} 저장했습니다.`)
            setEditing(null)
            await load()
        } catch (e) {
            await showError(e.message || '저장하지 못했습니다.')
        } finally {
            setSaving(false)
        }
    }

    const removeQuote = async (q) => {
        if (!(await showConfirm(`견적서 ${q.quote_no}를 지웁니다.`, '삭제'))) return
        const { error } = await supabase.from('quotes').delete().eq('id', q.id)
        if (error) { await showError(error.message); return }
        await load()
    }

    const print = async (q) => {
        const { data } = await supabase.from('quote_items').select('*').eq('quote_id', q.id).order('line_no')
        setPrinting({ head: q, lines: data || [] })
    }

    // 인쇄 화면이 붙은 뒤에 인쇄창을 연다.
    // 파일 이름을 '견적서_번호_거래처'로 바꿔 두므로 저장하면 그대로 나온다.
    useEffect(() => {
        if (!printing) return
        const t = setTimeout(() => printAs(quoteFileName(printing.head)), 400)
        return () => clearTimeout(t)
    }, [printing])

    // ---------------------------------------------------------------- 안내
    if (tableMissing) {
        return (
            <div className="win" style={{ margin: 12 }}>
                <div className="win-title"><span>견적서</span></div>
                <p style={{ padding: 16, margin: 0, fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                    아직 준비되지 않았습니다. Supabase SQL Editor에서{' '}
                    <code>execution/sql/quotes_and_orders.sql</code> 을 실행하면 나타납니다.
                </p>
            </div>
        )
    }

    // ---------------------------------------------------------------- 인쇄
    if (printing) {
        return (
            <div style={{ background: '#e9ecef', minHeight: '100vh', padding: 16 }}>
                <div className="toolbar doc-no-print" style={{ maxWidth: '210mm', margin: '0 auto 12px' }}>
                    <button className="tb-btn" onClick={() => setPrinting(null)}><ArrowLeft size={14} /> 돌아가기</button>
                    <button className="tb-btn primary" onClick={() => printAs(quoteFileName(printing.head))}>
                        <Printer size={14} /> PDF로 저장
                    </button>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                        인쇄창에서 '대상'을 <b>PDF로 저장</b>으로 고르세요. 파일 이름은{' '}
                        <b>{quoteFileName(printing.head)}</b> 으로 나옵니다.
                    </span>
                </div>
                <QuoteSheet quote={printing.head} items={printing.lines} company={company} />
            </div>
        )
    }

    // ---------------------------------------------------------------- 작성
    if (editing) {
        const h = editing.head
        return (
            <div className="win" style={{ margin: 12 }}>
                <div className="win-title">
                    <span>{h.id ? '견적서 수정' : '새 견적서'}</span>
                    <span className="meta">{h.quote_no || '저장하면 번호가 매겨집니다'}</span>
                </div>

                <div className="toolbar">
                    <button className="tb-btn primary" onClick={save} disabled={saving}>
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 저장
                    </button>
                    <button className="tb-btn" onClick={() => setEditing(null)}><X size={14} /> 취소</button>
                </div>

                {/* 머리 정보 */}
                <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                    <label style={{ fontSize: 12 }}>거래처
                        <input list="quote-clients" value={h.client_name}
                            onChange={(e) => {
                                const v = e.target.value
                                const c = clients.find((x) => x.company === v)
                                setHead({
                                    client_name: v, client_id: c?.id || null,
                                    contact_name: c?.contact_person || h.contact_name,
                                    contact_phone: c?.phone || h.contact_phone,
                                })
                            }} style={{ width: '100%' }} />
                        <datalist id="quote-clients">
                            {clients.slice(0, 1200).map((c) => <option key={c.id} value={c.company} />)}
                        </datalist>
                    </label>
                    <label style={{ fontSize: 12 }}>담당자
                        <input value={h.contact_name || ''} onChange={(e) => setHead({ contact_name: e.target.value })} style={{ width: '100%' }} />
                    </label>
                    <label style={{ fontSize: 12 }}>연락처
                        <input value={h.contact_phone || ''} onChange={(e) => setHead({ contact_phone: e.target.value })} style={{ width: '100%' }} />
                    </label>
                    <label style={{ fontSize: 12 }}>견적일자
                        <input type="date" value={h.quote_date} onChange={(e) => setHead({ quote_date: e.target.value })} style={{ width: '100%' }} />
                    </label>
                    <label style={{ fontSize: 12 }}>유효기간(일)
                        <input type="number" value={h.valid_days} onChange={(e) => setHead({ valid_days: e.target.value })} style={{ width: '100%' }} />
                    </label>
                    <label style={{ fontSize: 12 }}>상태
                        <select value={h.status} onChange={(e) => setHead({ status: e.target.value })} style={{ width: '100%' }}>
                            {STATUS.map((s) => <option key={s}>{s}</option>)}
                        </select>
                    </label>
                </div>

                {/* 품목 줄 */}
                <div className="filterbar"><b style={{ fontSize: 12 }}>품목</b>
                    <button className="tb-btn" style={{ marginLeft: 'auto' }}
                        onClick={() => setEditing((e) => ({ ...e, lines: [...e.lines, emptyLine()] }))}>
                        <Plus size={13} /> 줄 추가
                    </button>
                </div>

                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {editing.lines.map((l, i) => (
                        <div key={l.key} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 10 }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                <Thumb url={l.image_url} alt={l.name} size={64} />

                                <div style={{ flex: 1, minWidth: 200, display: 'grid', gap: 6 }}>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <input value={l.name} placeholder="품목명"
                                            onChange={(e) => setLine(l.key, { name: e.target.value })} style={{ flex: 1 }} />
                                        <button className="tb-btn" onClick={() => setPickFor(l.key)}>고르기</button>
                                    </div>
                                    <input value={l.spec || ''} placeholder="규격"
                                        onChange={(e) => setLine(l.key, { spec: e.target.value })} />
                                </div>

                                <div style={{ display: 'grid', gap: 6, width: 120 }}>
                                    <input value={l.quantity} placeholder="수량" style={{ textAlign: 'right' }}
                                        onChange={(e) => setLine(l.key, { quantity: e.target.value })} />
                                    <input value={l.unit_price} placeholder="단가" style={{ textAlign: 'right' }}
                                        onChange={(e) => setLine(l.key, { unit_price: e.target.value })} />
                                    <div style={{ textAlign: 'right', fontSize: 12.5, fontWeight: 700 }}>
                                        {won(num(l.quantity) * num(l.unit_price))}원
                                    </div>
                                </div>

                                <button className="rowbtn" onClick={() => removeLine(l.key)} title="이 줄 빼기">
                                    <Trash2 size={13} />
                                </button>
                            </div>

                            {/* 악세서리 — 고르면 사진이 붙는다 */}
                            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <button className="tb-btn" onClick={() => setAccFor(l.key)}>
                                    상부캡 · 밸브 고르기
                                </button>
                                {(l.accessories || []).map((a, k) => (
                                    <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5 }}>
                                        <Thumb url={a.image_url} alt={a.name} size={32} />
                                        <span style={{ color: 'var(--text-secondary)' }}>{a.kind}</span> {a.name}
                                    </span>
                                ))}
                                {(l.accessories || []).length === 0 && (
                                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>선택 없음</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ padding: '0 12px 12px' }}>
                    <label style={{ fontSize: 12, display: 'block' }}>비고 (납기·결제조건 등)
                        <textarea value={h.notes || ''} rows={3} onChange={(e) => setHead({ notes: e.target.value })}
                            style={{ width: '100%', resize: 'vertical' }} />
                    </label>
                </div>

                <div className="statusbar">
                    <span>공급가액 {won(totals.subtotal)}원</span>
                    <span>부가세 {won(totals.vat)}원</span>
                    <span style={{ fontWeight: 700 }}>합계 {won(totals.total)}원</span>
                </div>

                {pickFor && <ProductPicker products={products} onPick={pickProduct} onClose={() => setPickFor(null)} />}
                {accFor && (
                    <AccessoryPicker
                        accessories={accessories}
                        selected={editing.lines.find((l) => l.key === accFor)?.accessories || []}
                        onToggle={toggleAccessory}
                        onClose={() => setAccFor(null)}
                    />
                )}
            </div>
        )
    }

    // ---------------------------------------------------------------- 목록
    return (
        <div className="win" style={{ margin: 12 }}>
            <div className="win-title">
                <span>견적서</span>
                <span className="meta">{list.length}건</span>
            </div>

            <div className="toolbar">
                <button className="tb-btn primary" onClick={newQuote}><Plus size={14} /> 새 견적서</button>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 6 }}>
                    <Search size={14} style={{ color: 'var(--text-muted)' }} />
                    <input value={q} onChange={(e) => setQ(e.target.value)}
                        placeholder="견적번호 · 거래처" style={{ width: 180 }} />
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
                            <th style={{ minWidth: 120 }}>견적번호</th>
                            <th style={{ minWidth: 96 }}>일자</th>
                            <th style={{ minWidth: 160 }}>거래처</th>
                            <th style={{ minWidth: 120, textAlign: 'right' }}>합계</th>
                            <th style={{ minWidth: 70 }}>상태</th>
                            <th style={{ width: 96 }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((r) => (
                            <tr key={r.id}>
                                <td><button className="rowbtn doc-no-btn" onClick={() => openQuote(r)}>{r.quote_no}</button></td>
                                <td className="dt">{String(r.quote_date).slice(0, 10)}</td>
                                <td>{r.client_name}</td>
                                <td className="num">{won(r.total)}</td>
                                <td>
                                    <span style={{ fontSize: 11.5, fontWeight: 700, color: STATUS_COLOR[r.status] || '#6B7280' }}>
                                        {r.status}
                                    </span>
                                </td>
                                <td onClick={(e) => e.stopPropagation()}>
                                    <button className="rowbtn" onClick={() => print(r)} title="인쇄 / PDF"><Printer size={13} /></button>
                                    <button className="rowbtn" onClick={() => removeQuote(r)} title="삭제"><Trash2 size={13} /></button>
                                </td>
                            </tr>
                        ))}
                        {shown.length === 0 && !loading && (
                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>
                                {/*
                                  빈 화면이 '없습니다' 한 줄로 끝나면 무엇을 해야 할지
                                  알 수 없다. 기능을 다 만들어 놓고도 안 쓰이는 이유다.
                                  여기서 바로 시작할 수 있게 한다.
                                */}
                                <FileText size={20} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.5 }} />
                                {list.length === 0 ? (
                                    <>
                                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                                            아직 작성한 견적서가 없습니다
                                        </div>
                                        <div style={{ fontSize: 12.5, lineHeight: 1.8 }}>
                                            품목·수량을 고르면 사진이 들어간 견적서가 만들어집니다.<br />
                                            인쇄에서 <b>PDF로 저장</b>을 고르면 거래처명이 붙은 파일로 받습니다.<br />
                                            저장하면 <b>영업기회</b>에도 자동으로 올라갑니다 — 따로 적을 필요가 없습니다.
                                        </div>
                                        <button className="tb-btn primary" style={{ marginTop: 12 }} onClick={newQuote}>
                                            <Plus size={13} /> 첫 견적서 만들기
                                        </button>
                                    </>
                                ) : '조건에 맞는 견적서가 없습니다.'}
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default Quotes
