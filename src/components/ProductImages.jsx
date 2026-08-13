import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Upload, Loader2, Search, Plus, Trash2, ImageOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { showError } from '../utils/alert'

/**
 * 품목 · 악세서리 사진 등록
 *
 * 견적서에 사진이 나가려면 여기서 먼저 올려야 한다.
 *
 * **캡·밸브도 품목이다.** 따로 표를 두면 사진을 두 번 올려야 하고 이름이 갈린다.
 * `products.type`으로만 갈래를 나눈다:
 *   IBC / 드럼 / 제리캔 = 완제품,  캡 / 밸브 = 악세서리,  부품 = 그 밖
 *
 * **밸브 쪽에는 '무밸브'가 있다.** 밸브가 없는 형태이고, 그 부위 사진을 따로 올린다.
 *
 * 사진은 Supabase Storage의 공개 버킷(product-images)에 올린다.
 * 견적서는 그 URL을 그대로 쓰므로 인쇄에도 그대로 나온다.
 */

const BUCKET = 'product-images'
const MAX_EDGE = 900          // 견적서에 26mm로 들어간다. 이 이상은 낭비다.
const JPEG_QUALITY = 0.85

/** 큰 사진을 그대로 올리면 견적서가 무거워진다. 줄여서 올린다. */
const shrink = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'))
    reader.onload = () => {
        const img = new Image()
        img.onerror = () => reject(new Error('이미지 형식을 알아보지 못했습니다.'))
        img.onload = () => {
            const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
            const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
            const c = document.createElement('canvas')
            c.width = w; c.height = h
            const ctx = c.getContext('2d')
            ctx.fillStyle = '#ffffff'   // 투명 PNG가 인쇄에서 검게 나오는 것을 막는다
            ctx.fillRect(0, 0, w, h)
            ctx.drawImage(img, 0, 0, w, h)
            c.toBlob((b) => (b ? resolve(b) : reject(new Error('변환 실패'))), 'image/jpeg', JPEG_QUALITY)
        }
        img.src = reader.result
    }
    reader.readAsDataURL(file)
})

const upload = async (file, prefix) => {
    const blob = await shrink(file)
    const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: 'image/jpeg', upsert: false,
    })
    if (error) throw error
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

const Tile = ({ url, name, sub, onUpload, onDelete, busy }) => (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 8, textAlign: 'center' }}>
        {url
            ? <img src={url} alt={name} style={{ width: '100%', height: 92, objectFit: 'contain', background: '#fff' }} />
            : <div style={{ height: 92, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)' }}>
                <ImageOff size={22} />
            </div>}
        <div style={{ fontSize: 12, fontWeight: 600, marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
        </div>
        {sub && <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>{sub}</div>}
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 5 }}>
            <label className="tb-btn" style={{ cursor: busy ? 'wait' : 'pointer', fontSize: 11 }}>
                {busy ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />} 사진
                <input type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
            </label>
            {onDelete && <button className="rowbtn" onClick={onDelete}><Trash2 size={12} /></button>}
        </div>
    </div>
)

const ProductImages = () => {
    const [products, setProducts] = useState([])
    const [accessories, setAccessories] = useState([])
    const [loading, setLoading] = useState(true)
    const [tableMissing, setTableMissing] = useState(false)
    const [busy, setBusy] = useState(null)
    const [q, setQ] = useState('')
    const [tab, setTab] = useState('accessory')   // 악세서리가 몇 개 안 되니 먼저 보여준다
    const [newAcc, setNewAcc] = useState({ kind: '밸브', name: '' })

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const [p, a] = await Promise.all([
                supabase.from('products').select('id,name,type,standard,image_url').order('name').limit(2000),
                supabase.from('company_profile').select('id').limit(1),
            ])
            if (a.error && (a.error.code === 'PGRST205' || /does not exist|could not find the table/i.test(a.error.message || ''))) {
                setTableMissing(true); return
            }
            setTableMissing(false)
            const all = p.data || []
            setProducts(all.filter((x) => ['IBC', '드럼', '제리캔', '부품'].includes(x.type) || !x.type))
            // 캡·밸브도 품목이다. 갈래만 다르게 본다.
            setAccessories(all.filter((x) => ['캡', '밸브'].includes(x.type)))
        } catch (e) {
            await showError(e.message)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const uploadFor = async (kind, row, file) => {
        setBusy(row.id)
        try {
            const url = await upload(file, kind)
            // 캡·밸브도 products 행이다. 갈 곳은 한 곳뿐이다.
            const { error } = await supabase.from('products').update({ image_url: url }).eq('id', row.id)
            if (error) throw error
            await load()
        } catch (e) {
            await showError(e.message || '사진을 올리지 못했습니다.')
        } finally {
            setBusy(null)
        }
    }

    /** 없는 캡·밸브를 새로 만든다 — 품목으로 들어간다 */
    const addAccessory = async () => {
        const name = newAcc.name.trim()
        if (!name) { await showError('이름을 넣어 주세요.'); return }
        const { error } = await supabase.from('products').insert([{ name, type: newAcc.kind }])
        if (error) { await showError(error.message); return }
        setNewAcc({ ...newAcc, name: '' })
        await load()
    }

    const shownProducts = useMemo(() => {
        const term = q.trim().toLowerCase()
        const base = term
            ? products.filter((p) => String(p.name).toLowerCase().includes(term) || String(p.standard || '').toLowerCase().includes(term))
            : products
        // 사진 없는 것을 먼저 보여준다 — 채워야 할 것이 눈에 띄어야 한다
        return [...base].sort((a, b) => (a.image_url ? 1 : 0) - (b.image_url ? 1 : 0)).slice(0, 60)
    }, [products, q])

    const byKind = useMemo(() => {
        const m = {}
        accessories.forEach((a) => { (m[a.type] = m[a.type] || []).push(a) })
        return m
    }, [accessories])

    if (tableMissing) {
        return (
            <div className="win">
                <div className="win-title"><span>품목 사진</span></div>
                <p style={{ padding: 16, margin: 0, fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                    아직 준비되지 않았습니다. Supabase SQL Editor에서{' '}
                    <code>execution/sql/quotes_and_orders.sql</code> 을 실행하면 나타납니다.
                </p>
            </div>
        )
    }

    const withPhoto = products.filter((p) => p.image_url).length

    return (
        <div className="win">
            <div className="win-title">
                <span>품목 · 악세서리 사진</span>
                <span className="meta">견적서에 나갑니다</span>
            </div>

            <div className="toolbar">
                <button className={`tb-btn${tab === 'accessory' ? ' primary' : ''}`} onClick={() => setTab('accessory')}>
                    악세서리 ({accessories.length})
                </button>
                <button className={`tb-btn${tab === 'product' ? ' primary' : ''}`} onClick={() => setTab('product')}>
                    품목 ({withPhoto}/{products.length})
                </button>
                {loading && <Loader2 size={14} className="animate-spin" />}
            </div>

            {tab === 'accessory' ? (
                <div style={{ padding: 12 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                        <select value={newAcc.kind} onChange={(e) => setNewAcc({ ...newAcc, kind: e.target.value })}>
                            <option>밸브</option>
                            <option>캡</option>
                        </select>
                        <input value={newAcc.name} placeholder="이름 (예: 50V3밸브)"
                            onChange={(e) => setNewAcc({ ...newAcc, name: e.target.value })} style={{ flex: 1, minWidth: 160 }} />
                        <button className="tb-btn primary" onClick={addAccessory}><Plus size={13} /> 추가</button>
                    </div>

                    {Object.entries(byKind).map(([kind, list]) => (
                        <div key={kind} style={{ marginBottom: 16 }}>
                            <b style={{ fontSize: 13 }}>{kind}</b>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))', gap: 8, marginTop: 6 }}>
                                {list.map((a) => (
                                    <Tile key={a.id} url={a.image_url} name={a.name} sub={a.standard || ''}
                                        busy={busy === a.id}
                                        onUpload={(f) => uploadFor('accessory', a, f)} />
                                ))}
                            </div>
                        </div>
                    ))}

                    <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                        ※ 캡·밸브도 <b>품목 목록에 있는 것</b>을 그대로 씁니다. 여기서 올린 사진이
                        견적서에 그대로 나갑니다.<br />
                        ※ <b>무밸브</b>도 하나의 선택지입니다. 밸브가 없는 부위 사진을 올려 두세요.
                    </p>
                </div>
            ) : (
                <div style={{ padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                        <Search size={14} style={{ color: 'var(--text-muted)' }} />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="품목 찾기" style={{ flex: 1 }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))', gap: 8 }}>
                        {shownProducts.map((p) => (
                            <Tile key={p.id} url={p.image_url} name={p.name} sub={p.standard || ''}
                                busy={busy === p.id}
                                onUpload={(f) => uploadFor('product', p, f)} />
                        ))}
                    </div>
                    {products.length > 60 && (
                        <p style={{ marginTop: 10, fontSize: 11.5, color: 'var(--text-secondary)' }}>
                            사진 없는 품목부터 60개까지 보여줍니다. 나머지는 검색해서 찾으세요.
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}

export default ProductImages
