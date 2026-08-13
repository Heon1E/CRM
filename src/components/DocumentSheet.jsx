import React from 'react'

/**
 * 견적서 / 발주서 인쇄용 A4 문서
 *
 * PDF 라이브러리를 쓰지 않는다. 브라우저 인쇄(Ctrl+P → 'PDF로 저장')가
 * 한글도 표도 깨끗하게 나오고, 의존성도 늘지 않는다.
 * jsPDF+html2canvas는 한글 폰트를 따로 심어야 하고 표가 이미지로 나가 뭉갠다.
 *
 * 견적서에는 품목 사진과 악세서리(상부캡·밸브) 사진이 들어간다.
 * 고객이 "그래서 뭘 주는 건데"를 한눈에 알 수 있어야 하기 때문이다.
 * 발주서는 우리가 쓰는 문서라 사진 없이 일반 양식으로 낸다.
 */

const won = (v) => Math.round(Number(v) || 0).toLocaleString('ko-KR')
const dateK = (d) => {
    if (!d) return ''
    const [y, m, dd] = String(d).slice(0, 10).split('-')
    return `${y}년 ${Number(m)}월 ${Number(dd)}일`
}

/** 받는 곳 / 보내는 곳 (좌우) */
const Parties = ({ toTitle, to, company }) => (
    <table style={{ marginBottom: '6mm' }}>
        <tbody>
            <tr>
                <td style={{ width: '48%', verticalAlign: 'top', paddingRight: '4mm' }}>
                    <table className="doc-meta">
                        <tbody>
                            <tr><td colSpan={2} style={{ fontWeight: 700, paddingBottom: 4 }}>{toTitle}</td></tr>
                            <tr><td style={{ width: 62, color: '#555' }}>상호</td><td><b>{to.name || ''}</b> 귀중</td></tr>
                            {to.contact && <tr><td style={{ color: '#555' }}>담당자</td><td>{to.contact}</td></tr>}
                            {to.phone && <tr><td style={{ color: '#555' }}>연락처</td><td>{to.phone}</td></tr>}
                            {to.extra?.map((e) => (
                                <tr key={e.label}><td style={{ color: '#555' }}>{e.label}</td><td>{e.value}</td></tr>
                            ))}
                        </tbody>
                    </table>
                </td>
                <td style={{ width: '52%', verticalAlign: 'top', borderLeft: '1px solid #ccc', paddingLeft: '4mm' }}>
                    <table className="doc-meta">
                        <tbody>
                            <tr><td colSpan={2} style={{ fontWeight: 700, paddingBottom: 4 }}>공급자</td></tr>
                            <tr><td style={{ width: 74, color: '#555' }}>상호</td><td><b>{company.name}</b></td></tr>
                            {company.ceo && <tr><td style={{ color: '#555' }}>대표자</td><td>{company.ceo}</td></tr>}
                            {company.biz_no && <tr><td style={{ color: '#555' }}>사업자번호</td><td>{company.biz_no}</td></tr>}
                            {company.address && <tr><td style={{ color: '#555' }}>주소</td><td>{company.address}</td></tr>}
                            {company.phone && <tr><td style={{ color: '#555' }}>전화</td><td>{company.phone}</td></tr>}
                            {company.fax && <tr><td style={{ color: '#555' }}>팩스</td><td>{company.fax}</td></tr>}
                            {company.email && <tr><td style={{ color: '#555' }}>이메일</td><td>{company.email}</td></tr>}
                        </tbody>
                    </table>
                </td>
            </tr>
        </tbody>
    </table>
)

const Totals = ({ subtotal, vat, total }) => (
    <table className="doc-grid" style={{ marginTop: '4mm', width: '62%', marginLeft: 'auto' }}>
        <tbody>
            <tr><th style={{ width: '46%' }}>공급가액</th><td className="num">{won(subtotal)}</td></tr>
            <tr><th>부가세 (10%)</th><td className="num">{won(vat)}</td></tr>
            <tr><th style={{ background: '#dde3ea' }}>합계 금액</th>
                <td className="num" style={{ fontWeight: 700, fontSize: '12pt' }}>{won(total)}</td></tr>
        </tbody>
    </table>
)

/** 견적서 */
export const QuoteSheet = ({ quote, items = [], company = {} }) => {
    const validUntil = (() => {
        if (!quote.quote_date) return ''
        const d = new Date(`${String(quote.quote_date).slice(0, 10)}T00:00:00`)
        d.setDate(d.getDate() + (Number(quote.valid_days) || 30))
        return dateK(d.toISOString().slice(0, 10))
    })()

    return (
        <div className="doc-sheet">
            <h1>견 적 서</h1>

            <table className="doc-meta" style={{ marginBottom: '4mm' }}>
                <tbody>
                    <tr>
                        <td style={{ width: 60, color: '#555' }}>견적번호</td><td><b>{quote.quote_no}</b></td>
                        <td style={{ width: 60, color: '#555', textAlign: 'right' }}>견적일자</td>
                        <td style={{ width: 120, textAlign: 'right' }}>{dateK(quote.quote_date)}</td>
                    </tr>
                </tbody>
            </table>

            <Parties
                toTitle="수신"
                to={{ name: quote.client_name, contact: quote.contact_name, phone: quote.contact_phone }}
                company={company}
            />

            <p style={{ margin: '0 0 4mm', fontSize: '10.5pt' }}>
                아래와 같이 견적서를 제출합니다.
            </p>

            <table className="doc-grid">
                <thead>
                    <tr>
                        <th style={{ width: '7%' }}>번호</th>
                        <th style={{ width: '30mm' }}>사진</th>
                        <th>품목 / 규격</th>
                        <th style={{ width: '12%' }}>수량</th>
                        <th style={{ width: '17%' }}>단가</th>
                        <th style={{ width: '19%' }}>금액</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((it, i) => (
                        <tr key={it.id || i}>
                            <td className="ctr">{i + 1}</td>
                            <td className="ctr">
                                {it.image_url
                                    ? <img className="doc-photo" src={it.image_url} alt={it.name} />
                                    : <span style={{ fontSize: '8pt', color: '#999' }}>사진 없음</span>}
                            </td>
                            <td>
                                <b>{it.name}</b>
                                {it.spec && <div style={{ fontSize: '9pt', color: '#555' }}>{it.spec}</div>}

                                {/* 악세서리 — 이름과 사진을 함께. 고객이 형태를 바로 알 수 있어야 한다. */}
                                {(it.accessories || []).length > 0 && (
                                    <div style={{ display: 'flex', gap: '4mm', marginTop: '2mm', flexWrap: 'wrap' }}>
                                        {it.accessories.map((a, k) => (
                                            <div key={k} style={{ textAlign: 'center' }}>
                                                {a.image_url
                                                    ? <img src={a.image_url} alt={a.name}
                                                        style={{ width: '18mm', height: '18mm', objectFit: 'contain', border: '1px solid #ddd', background: '#fafafa', display: 'block' }} />
                                                    : <div style={{ width: '18mm', height: '18mm', border: '1px dashed #ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7pt', color: '#aaa' }}>사진 없음</div>}
                                                <div style={{ fontSize: '8pt', marginTop: 2 }}>
                                                    <span style={{ color: '#777' }}>{a.kind}</span> {a.name}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {it.note && <div style={{ fontSize: '9pt', color: '#555', marginTop: '1mm' }}>{it.note}</div>}
                            </td>
                            <td className="num">{won(it.quantity)} {it.unit || 'EA'}</td>
                            <td className="num">{won(it.unit_price)}</td>
                            <td className="num">{won(it.amount)}</td>
                        </tr>
                    ))}
                    {items.length === 0 && (
                        <tr><td colSpan={6} className="ctr" style={{ padding: '10mm', color: '#999' }}>품목이 없습니다</td></tr>
                    )}
                </tbody>
            </table>

            <Totals subtotal={quote.subtotal} vat={quote.vat} total={quote.total} />

            <table className="doc-grid" style={{ marginTop: '5mm' }}>
                <tbody>
                    <tr>
                        <th style={{ width: '18%' }}>유효기간</th>
                        <td colSpan={3}>{validUntil ? `${validUntil}까지` : `견적일로부터 ${quote.valid_days || 30}일`}</td>
                    </tr>
                    <tr>
                        <th>비고</th>
                        <td colSpan={3} style={{ whiteSpace: 'pre-wrap', minHeight: '14mm' }}>{quote.notes || ''}</td>
                    </tr>
                    {company.bank_account && (
                        <tr><th>입금계좌</th><td colSpan={3}>{company.bank_account}</td></tr>
                    )}
                </tbody>
            </table>

            <div style={{ textAlign: 'right', marginTop: '8mm', position: 'relative' }}>
                <span style={{ fontSize: '11pt' }}>{company.name} </span>
                <span style={{ fontSize: '11pt', fontWeight: 700 }}>{company.ceo}</span>
                <span style={{ fontSize: '10pt', marginLeft: 4 }}>(인)</span>
                {company.stamp_url && (
                    <img src={company.stamp_url} alt="직인"
                        style={{ width: '18mm', height: '18mm', objectFit: 'contain', position: 'absolute', right: -4, top: -6, opacity: 0.9 }} />
                )}
            </div>
        </div>
    )
}

/** 발주서 — 사진 없이 일반 양식 */
export const PurchaseOrderSheet = ({ order, items = [], company = {} }) => (
    <div className="doc-sheet">
        <h1>발 주 서</h1>

        <table className="doc-meta" style={{ marginBottom: '4mm' }}>
            <tbody>
                <tr>
                    <td style={{ width: 60, color: '#555' }}>발주번호</td><td><b>{order.po_no}</b></td>
                    <td style={{ width: 60, color: '#555', textAlign: 'right' }}>발주일자</td>
                    <td style={{ width: 120, textAlign: 'right' }}>{dateK(order.po_date)}</td>
                </tr>
            </tbody>
        </table>

        <Parties
            toTitle="수신 (공급업체)"
            to={{
                name: order.vendor_name, contact: order.vendor_contact, phone: order.vendor_phone,
                extra: order.vendor_email ? [{ label: '이메일', value: order.vendor_email }] : [],
            }}
            company={company}
        />

        <p style={{ margin: '0 0 4mm', fontSize: '10.5pt' }}>아래와 같이 발주합니다.</p>

        <table className="doc-grid">
            <thead>
                <tr>
                    <th style={{ width: '8%' }}>번호</th>
                    <th>품목</th>
                    <th style={{ width: '20%' }}>규격</th>
                    <th style={{ width: '12%' }}>수량</th>
                    <th style={{ width: '16%' }}>단가</th>
                    <th style={{ width: '18%' }}>금액</th>
                </tr>
            </thead>
            <tbody>
                {items.map((it, i) => (
                    <tr key={it.id || i}>
                        <td className="ctr">{i + 1}</td>
                        <td>{it.name}{it.note && <div style={{ fontSize: '9pt', color: '#555' }}>{it.note}</div>}</td>
                        <td>{it.spec || ''}</td>
                        <td className="num">{won(it.quantity)} {it.unit || 'EA'}</td>
                        <td className="num">{won(it.unit_price)}</td>
                        <td className="num">{won(it.amount)}</td>
                    </tr>
                ))}
                {items.length === 0 && (
                    <tr><td colSpan={6} className="ctr" style={{ padding: '10mm', color: '#999' }}>품목이 없습니다</td></tr>
                )}
            </tbody>
        </table>

        <Totals subtotal={order.subtotal} vat={order.vat} total={order.total} />

        <table className="doc-grid" style={{ marginTop: '5mm' }}>
            <tbody>
                <tr>
                    <th style={{ width: '18%' }}>납기일</th><td style={{ width: '32%' }}>{dateK(order.delivery_date) || '협의'}</td>
                    <th style={{ width: '18%' }}>납품장소</th><td>{order.delivery_to || company.address || ''}</td>
                </tr>
                <tr>
                    <th>비고</th>
                    <td colSpan={3} style={{ whiteSpace: 'pre-wrap', minHeight: '14mm' }}>{order.notes || ''}</td>
                </tr>
            </tbody>
        </table>

        <div style={{ textAlign: 'right', marginTop: '8mm', position: 'relative' }}>
            <span style={{ fontSize: '11pt' }}>{company.name} </span>
            <span style={{ fontSize: '11pt', fontWeight: 700 }}>{company.ceo}</span>
            <span style={{ fontSize: '10pt', marginLeft: 4 }}>(인)</span>
            {company.stamp_url && (
                <img src={company.stamp_url} alt="직인"
                    style={{ width: '18mm', height: '18mm', objectFit: 'contain', position: 'absolute', right: -4, top: -6, opacity: 0.9 }} />
            )}
        </div>
    </div>
)

export default QuoteSheet
