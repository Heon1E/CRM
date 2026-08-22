import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, Building2, Package, CornerDownLeft } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { buildClientKeys } from '../hooks/useSalesImport'
import { nameCandidates } from '../utils/clientAliases'

/**
 * 전역 검색 — 거래처를 이름으로 바로 찾는다.
 *
 * 예전에는 상단 검색창이 **장식이었다.** input에 핸들러가 없어 아무 일도 하지 않았다.
 * 거래처가 1,149곳이라 목록을 훑어 찾는 건 불가능하다.
 *
 * 찾는 방식은 앱의 다른 곳과 같은 기준을 쓴다(`buildClientKeys`, `nameCandidates`).
 * '윌슨플로켐'으로 쳐도 '주식회사 윌슨플로켐'이 나와야 하고,
 * 'KCC 전주공장'으로 쳐도 'KCC'가 나와야 한다.
 */

const MAN = 10_000
const fmtMan = (v) => `${Math.round(v / MAN).toLocaleString('ko-KR')}만원`

const GlobalSearch = ({ open, onClose }) => {
    const navigate = useNavigate()
    const { clients, sales, activities } = useData()
    const [q, setQ] = useState('')
    const [cursor, setCursor] = useState(0)
    const inputRef = useRef(null)

    useEffect(() => {
        if (open) {
            setQ('')
            setCursor(0)
            setTimeout(() => inputRef.current?.focus(), 30)
        }
    }, [open])

    /** 거래처별 매출·활동 요약 (검색 결과에 같이 보여줘야 어느 곳인지 안다) */
    const index = useMemo(() => {
        const rev = new Map()
        ;(sales || []).forEach((s) => {
            if (!s.client_id) return
            rev.set(s.client_id, (rev.get(s.client_id) || 0) + (Number(s.total_amount ?? s.totalAmount ?? 0) || 0))
        })
        const acts = new Map()
        ;(activities || []).forEach((a) => {
            const id = a.client_id || a.clientId
            if (id) acts.set(id, (acts.get(id) || 0) + 1)
        })
        return (clients || []).map((c) => ({
            id: c.id,
            company: c.company || '',
            rep: c.sales_rep || '',
            revenue: rev.get(c.id) || 0,
            actCount: acts.get(c.id) || 0,
            keys: buildClientKeys(c.company),
        }))
    }, [clients, sales, activities])

    const results = useMemo(() => {
        const term = q.trim()
        if (term.length < 1) return []

        // 검색어도 같은 방식으로 정규화한다 ('(주)'·공백·대소문자 무시)
        const termKeys = nameCandidates(term).flatMap((t) => buildClientKeys(t))
        const lower = term.toLowerCase()

        const scored = []
        index.forEach((c) => {
            const name = c.company.toLowerCase()
            let score = 0
            if (name === lower) score = 1000
            else if (name.startsWith(lower)) score = 700
            else if (name.includes(lower)) score = 500
            else if (termKeys.some((tk) => c.keys.some((ck) => ck.includes(tk) || tk.includes(ck)))) score = 300

            if (score === 0) return
            // 같은 점수면 매출이 큰 곳을 위로 (찾을 가능성이 높다)
            scored.push({ ...c, score: score + Math.min(200, c.revenue / 1e7) })
        })
        return scored.sort((a, b) => b.score - a.score).slice(0, 12)
    }, [q, index])

    useEffect(() => { setCursor(0) }, [q])

    const go = (c) => {
        onClose()
        navigate(`/clients/${c.id}`)
    }

    const onKeyDown = (e) => {
        if (e.key === 'Escape') { onClose(); return }
        if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((v) => Math.min(v + 1, results.length - 1)) }
        if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((v) => Math.max(v - 1, 0)) }
        if (e.key === 'Enter' && results[cursor]) { e.preventDefault(); go(results[cursor]) }
    }

    if (!open) return null

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.4)',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 12px',
            }}
        >
            <div className="win" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                    <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <input
                        ref={inputRef}
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="거래처 이름으로 찾기"
                        style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 16 }}
                    />
                    <button className="rowbtn" onClick={onClose}><X size={14} /></button>
                </div>

                {q.trim() === '' ? (
                    <p style={{ padding: 16, margin: 0, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                        거래처 {(clients || []).length.toLocaleString('ko-KR')}곳에서 찾습니다.<br />
                        <b>(주)</b>·띄어쓰기는 무시합니다. ↑↓ 로 고르고 Enter 로 엽니다.
                    </p>
                ) : results.length === 0 ? (
                    <p style={{ padding: 16, margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                        ‘{q}’ 에 맞는 거래처가 없습니다.
                    </p>
                ) : (
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', maxHeight: '52vh', overflowY: 'auto' }}>
                        {results.map((c, i) => (
                            <li key={c.id}>
                                <button
                                    onClick={() => go(c)}
                                    onMouseEnter={() => setCursor(i)}
                                    style={{
                                        width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                                        padding: '8px 12px', border: 'none', textAlign: 'left', cursor: 'pointer',
                                        // 고른 줄에만 진짜 노랑. 먹색 글씨와 9.29:1이라 또렷하다
                                        background: i === cursor ? 'var(--sel)' : 'transparent',
                                        color: i === cursor ? 'var(--text-primary)' : undefined,
                                        borderBottom: '1px solid var(--border)',
                                    }}
                                >
                                    <Building2 size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{
                                            display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {c.company}
                                        </span>
                                        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)' }}>
                                            {c.revenue > 0 ? `누적 ${fmtMan(c.revenue)}` : '매출 없음'}
                                            {c.actCount > 0 && ` · 활동 ${c.actCount}회`}
                                            {c.rep && ` · ${c.rep}`}
                                        </span>
                                    </span>
                                    {i === cursor && <CornerDownLeft size={12} style={{ opacity: 0.5, flexShrink: 0 }} />}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}

export default GlobalSearch
