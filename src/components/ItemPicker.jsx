import React, { useState, useMemo } from 'react'
import { Search, X, ImageOff, Check } from 'lucide-react'

/**
 * 품목 / 악세서리 고르기 — 사진을 보고 고른다
 *
 * 견적서는 고객이 보는 문서다. 품목명만으로는 "그래서 뭘 주는 건데"가 안 잡힌다.
 * 고를 때부터 사진을 띄워야 영업사원도 고객도 같은 것을 본다.
 *
 * 악세서리에는 **무밸브**가 하나의 선택지로 들어간다 (밸브가 없는 형태이고
 * 그 부위 사진이 따로 있다). '없음'이 아니라 이름이 있는 선택지다.
 */

const Thumb = ({ url, alt, size = 56 }) => (
    url
        ? <img src={url} alt={alt}
            style={{ width: size, height: size, objectFit: 'contain', background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', flexShrink: 0 }} />
        : <div style={{
            width: size, height: size, border: '1px dashed var(--border)', borderRadius: 'var(--radius)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexShrink: 0,
        }}>
            <ImageOff size={Math.round(size / 3)} />
        </div>
)

export { Thumb }

/** 품목 고르기 */
export const ProductPicker = ({ products = [], onPick, onClose }) => {
    const [q, setQ] = useState('')

    const list = useMemo(() => {
        const term = q.trim().toLowerCase()
        const base = term
            ? products.filter((p) =>
                String(p.name || '').toLowerCase().includes(term) ||
                String(p.standard || '').toLowerCase().includes(term))
            : products
        // 사진이 있는 것을 먼저 (견적서에 바로 쓸 수 있는 것)
        return [...base].sort((a, b) => (b.image_url ? 1 : 0) - (a.image_url ? 1 : 0)).slice(0, 60)
    }, [products, q])

    return (
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 12px',
        }}>
            <div className="win" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 620 }}>
                <div className="win-title">
                    <span>품목 고르기</span>
                    <span className="meta">{products.length}개</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: '1px solid var(--border)' }}>
                    <Search size={15} style={{ color: 'var(--text-muted)' }} />
                    <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                        placeholder="품목명 또는 규격으로 찾기"
                        style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 16 }} />
                    <button className="rowbtn" onClick={onClose}><X size={14} /></button>
                </div>

                <div style={{ maxHeight: '58vh', overflowY: 'auto' }}>
                    {list.map((p) => (
                        <button key={p.id} onClick={() => { onPick(p); onClose() }}
                            style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent',
                                cursor: 'pointer', textAlign: 'left',
                            }}>
                            <Thumb url={p.image_url} alt={p.name} />
                            <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</span>
                                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                                    {p.standard || '규격 없음'}{!p.image_url && ' · 사진 없음'}
                                </span>
                            </span>
                        </button>
                    ))}
                    {list.length === 0 && (
                        <p style={{ padding: 20, margin: 0, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                            맞는 품목이 없습니다.
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}

/**
 * 악세서리 고르기 (상부캡 / 밸브)
 * 이미 고른 것은 체크로 표시하고, 다시 누르면 해제한다.
 */
export const AccessoryPicker = ({ accessories = [], selected = [], onToggle, onClose }) => {
    const kinds = useMemo(() => {
        const m = {}
        accessories.filter((a) => a.active !== false).forEach((a) => {
            (m[a.kind] = m[a.kind] || []).push(a)
        })
        Object.values(m).forEach((l) => l.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name, 'ko')))
        return m
    }, [accessories])

    const isOn = (a) => selected.some((s) => s.kind === a.kind && s.name === a.name)

    return (
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 12px', overflowY: 'auto',
        }}>
            <div className="win" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 620 }}>
                <div className="win-title">
                    <span>악세서리 고르기</span>
                    <span className="meta">상부캡 · 밸브</span>
                </div>

                <div style={{ padding: 12, maxHeight: '62vh', overflowY: 'auto' }}>
                    {Object.keys(kinds).length === 0 && (
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                            등록된 악세서리가 없습니다. 설정 &gt; 품목 사진에서 추가하세요.
                        </p>
                    )}
                    {Object.entries(kinds).map(([kind, list]) => (
                        <div key={kind} style={{ marginBottom: 14 }}>
                            <b style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>{kind}</b>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8, marginTop: 6 }}>
                                {list.map((a) => {
                                    const on = isOn(a)
                                    return (
                                        <button key={a.id} onClick={() => onToggle(a)}
                                            style={{
                                                border: on ? '2px solid var(--accent)' : '1px solid var(--border)',
                                                borderRadius: 'var(--radius)', padding: 6, background: 'transparent',
                                                cursor: 'pointer', position: 'relative',
                                            }}>
                                            <Thumb url={a.image_url} alt={a.name} size={72} />
                                            <div style={{ fontSize: 11.5, marginTop: 4, color: 'var(--text-primary)', textAlign: 'center' }}>
                                                {a.name}
                                            </div>
                                            {on && (
                                                <span style={{
                                                    position: 'absolute', top: 3, right: 3, background: 'var(--accent)', color: '#fff',
                                                    borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    <Check size={11} />
                                                </span>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="toolbar">
                    <button className="tb-btn primary" onClick={onClose} style={{ marginLeft: 'auto' }}>완료</button>
                </div>
            </div>
        </div>
    )
}
