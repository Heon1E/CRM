import React from 'react'

/**
 * 견적서 / 발주서 인쇄용 A4 문서
 *
 * PDF 라이브러리를 쓰지 않는다. 브라우저 인쇄(Ctrl+P → 'PDF로 저장')가
 * 한글도 표도 깨끗하게 나오고, 의존성도 늘지 않는다.
 * jsPDF+html2canvas는 한글 폰트를 따로 심어야 하고 표가 이미지로 나가 뭉갠다.
 *
 * **회사 e카탈로그의 디자인을 그대로 따른다.** 전문 디자이너가 만든 것이라
 * 눈대중으로 흉내내지 않고 PDF에서 값을 뽑아 맞췄다 —
 * 초록 #007538, 먹색 #3e3a39, 헤어라인 #dcdddd, 나눔스퀘어 네오 + Montserrat.
 * 실제 규칙은 `src/index.css`의 `.doc-*`에 있다.
 *
 * 카탈로그에서 가져온 것:
 *   - 레터헤드 = 로고 왼쪽 + 초록 윗말/큰 제목 오른쪽 (표지의 'IBC / BF-SERIES')
 *   - 섹션 제목 = 초록 글씨 + 아래 헤어라인
 *   - 표 = 초록 머리에 흰 글씨, 줄무늬, 헤어라인 (p3 적재용량 비교표)
 *   - 바닥글 = 로고 + 주소·연락처 (뒷표지)
 *
 * 견적서에는 품목 사진과 악세서리(상부캡·밸브) 사진이 들어간다.
 * 고객이 "그래서 뭘 주는 건데"를 한눈에 알 수 있어야 하기 때문이다.
 * 발주서는 우리가 쓰는 문서라 사진 없이 일반 양식으로 낸다.
 */

const won = (v) => Math.round(Number(v) || 0).toLocaleString('ko-KR')
const dateK = (d) => {
    if (!d) return ''
    const [y, m, dd] = String(d).slice(0, 10).split('-')
    return `${y}. ${m}. ${dd}`
}

/** 레터헤드 — 로고가 없으면 글자로 대신한다 (문서가 비어 보이면 안 된다) */
const Head = ({ company, eyebrow, name }) => (
    <div className="doc-head">
        {company.logo_url
            ? <img src={company.logo_url} alt={company.name} />
            : <span className="fallback">IND</span>}
        <span className="doc-title">
            <span className="eyebrow">{eyebrow}</span>
            <span className="name">{name}</span>
        </span>
    </div>
)

const IdLine = ({ noLabel, no, dateLabel, date }) => (
    <div className="doc-idline">
        <span>{noLabel} <b className="doc-no">{no}</b></span>
        <span>{dateLabel} <b className="num">{date}</b></span>
    </div>
)

/** 받는 곳 / 보내는 곳 — 카드 두 장으로 나란히 */
const Parties = ({ toTitle, to, company }) => (
    <div className="doc-parties">
        <section className="doc-party">
            <h3>{toTitle}</h3>
            <dl>
                <dt>상호</dt><dd className="big">{to.name || ''}</dd>
                {to.contact && <><dt>담당자</dt><dd>{to.contact}</dd></>}
                {to.phone && <><dt>연락처</dt><dd className="num">{to.phone}</dd></>}
                {to.extra?.map((e) => (
                    <React.Fragment key={e.label}><dt>{e.label}</dt><dd>{e.value}</dd></React.Fragment>
                ))}
            </dl>
        </section>
        <section className="doc-party is-us">
            <h3>공급자</h3>
            <dl>
                <dt>상호</dt><dd className="big">{company.name}</dd>
                {company.ceo && <><dt>대표자</dt><dd>{company.ceo}</dd></>}
                {company.biz_no && <><dt>사업자번호</dt><dd className="num">{company.biz_no}</dd></>}
                {company.address && <><dt>주소</dt><dd>{company.address}</dd></>}
                {company.phone && <><dt>전화</dt><dd className="num">{company.phone}</dd></>}
                {company.fax && <><dt>팩스</dt><dd className="num">{company.fax}</dd></>}
                {company.email && <><dt>이메일</dt><dd>{company.email}</dd></>}
            </dl>
        </section>
    </div>
)

/** 합계 — 마지막 줄만 초록으로 눌러 준다 */
const Totals = ({ subtotal, vat, total }) => (
    <table className="doc-totals">
        <tbody>
            <tr><td>공급가액</td><td className="num">{won(subtotal)}</td></tr>
            <tr><td>부가세 (10%)</td><td className="num">{won(vat)}</td></tr>
            <tr className="sum"><td>합계 금액</td><td className="num">{won(total)}</td></tr>
        </tbody>
    </table>
)

const Sign = ({ company }) => (
    <div className="doc-sign">
        <span className="co">{company.name}</span>
        <span className="ceo">{company.ceo}</span>
        <span className="seal">(인)</span>
        {company.stamp_url && <img src={company.stamp_url} alt="직인" />}
    </div>
)

/** 바닥글 — 카탈로그 뒷표지와 같은 형태 */
const Foot = ({ company }) => (
    <div className="doc-foot">
        {company.logo_url && <img src={company.logo_url} alt="" />}
        <span className="lines">
            <b>{company.name}</b>{company.address ? ` · ${company.address}` : ''}<br />
            {company.phone && <>Tel {company.phone}　</>}
            {company.fax && <>Fax {company.fax}　</>}
            {company.email && <>E-mail {company.email}</>}
        </span>
    </div>
)

const Empty = ({ cols }) => (
    <tr><td colSpan={cols} className="ctr" style={{ padding: '12mm', color: 'var(--ind-ink-faint)' }}>
        품목이 없습니다
    </td></tr>
)

/* ========================================================================= */

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
            <Head company={company} eyebrow="Quotation" name="견 적 서" />
            <IdLine noLabel="견적번호" no={quote.quote_no} dateLabel="견적일자" date={dateK(quote.quote_date)} />

            <Parties
                toTitle="수신"
                to={{ name: quote.client_name, contact: quote.contact_name, phone: quote.contact_phone }}
                company={company}
            />

            <h2 className="doc-h2">견적 품목</h2>
            <table className="doc-grid">
                <thead>
                    <tr>
                        <th style={{ width: '8%' }}>번호</th>
                        <th style={{ width: '30mm' }}>사진</th>
                        <th>품목 / 규격</th>
                        <th style={{ width: '12%' }}>수량</th>
                        <th style={{ width: '16%' }}>단가</th>
                        <th style={{ width: '18%' }}>금액</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((it, i) => (
                        <tr key={it.id || i}>
                            <td className="ctr num">{i + 1}</td>
                            <td className="ctr">
                                {it.image_url
                                    ? <img className="doc-photo" src={it.image_url} alt={it.name} />
                                    : <span style={{ fontSize: '7.5pt', color: 'var(--ind-ink-faint)' }}>사진 없음</span>}
                            </td>
                            <td>
                                <div className="item-name">{it.name}</div>
                                {it.spec && <div className="item-spec">{it.spec}</div>}

                                {/* 악세서리 — 이름과 사진을 함께. 고객이 형태를 바로 알 수 있어야 한다. */}
                                {(it.accessories || []).length > 0 && (
                                    <div className="doc-acc">
                                        {it.accessories.map((a, k) => (
                                            <figure key={k}>
                                                {a.image_url
                                                    ? <img src={a.image_url} alt={a.name} />
                                                    : <div style={{ height: '15mm', background: '#fff', borderRadius: 3 }} />}
                                                <figcaption><span>{a.kind}</span>{a.name}</figcaption>
                                            </figure>
                                        ))}
                                    </div>
                                )}
                                {it.note && <div className="item-spec" style={{ marginTop: '1mm' }}>{it.note}</div>}
                            </td>
                            <td className="num">{won(it.quantity)} {it.unit || 'EA'}</td>
                            <td className="num">{won(it.unit_price)}</td>
                            <td className="num">{won(it.amount)}</td>
                        </tr>
                    ))}
                    {items.length === 0 && <Empty cols={6} />}
                </tbody>
            </table>

            <Totals subtotal={quote.subtotal} vat={quote.vat} total={quote.total} />

            <h2 className="doc-h2" style={{ marginTop: '6mm' }}>거래 조건</h2>
            <table className="doc-terms">
                <tbody>
                    <tr>
                        <th>유효기간</th>
                        <td>{validUntil ? `${validUntil}까지` : `견적일로부터 ${quote.valid_days || 30}일`}</td>
                    </tr>
                    {company.bank_account && <tr><th>입금계좌</th><td>{company.bank_account}</td></tr>}
                    <tr>
                        <th>비고</th>
                        <td style={{ whiteSpace: 'pre-wrap', height: '14mm', verticalAlign: 'top' }}>{quote.notes || ''}</td>
                    </tr>
                </tbody>
            </table>

            {/* 회사 정보에 적어 둔 안내문구. 건별로 다른 말은 위 '비고'에 들어간다. */}
            {company.quote_terms && (
                <p className="doc-terms-note">{company.quote_terms}</p>
            )}

            <Sign company={company} />
            <Foot company={company} />
        </div>
    )
}

/** 발주서 — 우리가 협력업체에 보내는 문서라 사진 없이 일반 양식으로 낸다 */
export const PurchaseOrderSheet = ({ order, items = [], company = {} }) => (
    <div className="doc-sheet">
        <Head company={company} eyebrow="Purchase Order" name="발 주 서" />
        <IdLine noLabel="발주번호" no={order.po_no} dateLabel="발주일자" date={dateK(order.po_date)} />

        <Parties
            toTitle="수신 (공급업체)"
            to={{
                name: order.vendor_name, contact: order.vendor_contact, phone: order.vendor_phone,
                extra: order.vendor_email ? [{ label: '이메일', value: order.vendor_email }] : [],
            }}
            company={company}
        />

        <h2 className="doc-h2">발주 품목</h2>
        <table className="doc-grid">
            <thead>
                <tr>
                    <th style={{ width: '8%' }}>번호</th>
                    <th>품목</th>
                    <th style={{ width: '22%' }}>규격</th>
                    <th style={{ width: '12%' }}>수량</th>
                    <th style={{ width: '16%' }}>단가</th>
                    <th style={{ width: '18%' }}>금액</th>
                </tr>
            </thead>
            <tbody>
                {items.map((it, i) => (
                    <tr key={it.id || i}>
                        <td className="ctr num">{i + 1}</td>
                        <td>
                            <div className="item-name">{it.name}</div>
                            {it.note && <div className="item-spec">{it.note}</div>}
                        </td>
                        <td>{it.spec || ''}</td>
                        <td className="num">{won(it.quantity)} {it.unit || 'EA'}</td>
                        <td className="num">{won(it.unit_price)}</td>
                        <td className="num">{won(it.amount)}</td>
                    </tr>
                ))}
                {items.length === 0 && <Empty cols={6} />}
            </tbody>
        </table>

        <Totals subtotal={order.subtotal} vat={order.vat} total={order.total} />

        <h2 className="doc-h2" style={{ marginTop: '6mm' }}>납품 조건</h2>
        <table className="doc-terms">
            <tbody>
                <tr>
                    <th>납기일</th><td>{dateK(order.delivery_date) || '협의'}</td>
                </tr>
                <tr>
                    <th>납품장소</th><td>{order.delivery_to || company.address || ''}</td>
                </tr>
                <tr>
                    <th>비고</th>
                    <td style={{ whiteSpace: 'pre-wrap', height: '14mm', verticalAlign: 'top' }}>{order.notes || ''}</td>
                </tr>
            </tbody>
        </table>

        {company.po_terms && (
            <p className="doc-terms-note">{company.po_terms}</p>
        )}

        <Sign company={company} />
        <Foot company={company} />
    </div>
)

/**
 * 거래명세서 — 한 거래처에 그 기간 동안 나간 것을 적어 보낸다
 *
 * **새 표를 만들지 않는다.** 이미 쌓여 있는 매출 자료를 기간·거래처로 잘라
 * 보여주는 문서다. 따로 저장하면 매출과 명세서가 어긋나는 순간 어느 쪽이
 * 맞는지 알 수 없게 된다.
 *
 * 고객은 이걸 받아 자기 장부와 맞춰 보고 결제한다. 그래서 **날짜·품목·수량·
 * 단가가 한 줄씩** 보여야 하고, 견적서와 달리 사진은 넣지 않는다.
 */
export const StatementSheet = ({ statement, items = [], company = {} }) => (
    <div className="doc-sheet">
        <Head company={company} eyebrow="Statement" name="거래명세서" />
        <IdLine
            noLabel="거래처" no={statement.client_name}
            dateLabel="기간" date={`${dateK(statement.from)} ~ ${dateK(statement.to)}`}
        />

        <Parties
            toTitle="수신"
            to={{ name: statement.client_name, contact: statement.contact_name, phone: statement.contact_phone }}
            company={company}
        />

        <h2 className="doc-h2">거래 내역</h2>
        <table className="doc-grid">
            <thead>
                <tr>
                    <th style={{ width: '9%' }}>번호</th>
                    <th style={{ width: '16%' }}>일자</th>
                    <th>품목</th>
                    <th style={{ width: '12%' }}>수량</th>
                    <th style={{ width: '16%' }}>단가</th>
                    <th style={{ width: '18%' }}>금액</th>
                </tr>
            </thead>
            <tbody>
                {items.map((it, i) => (
                    <tr key={it.id || i}>
                        <td className="ctr num">{i + 1}</td>
                        <td className="ctr num">{dateK(it.sale_date)}</td>
                        <td>
                            <div className="item-name">{it.item_name || '-'}</div>
                            {it.notes && <div className="item-spec">{it.notes}</div>}
                        </td>
                        <td className="num">{won(it.quantity)}</td>
                        <td className="num">{won(it.unit_price)}</td>
                        <td className="num">{won(it.total_amount)}</td>
                    </tr>
                ))}
                {items.length === 0 && <Empty cols={6} />}
            </tbody>
        </table>

        <Totals subtotal={statement.subtotal} vat={statement.vat} total={statement.total} />

        {/* 채권 자료가 있을 때만 붙인다. 없으면 명세만 나가도 문서로 성립한다. */}
        {statement.receivable && (
            <>
                <h2 className="doc-h2" style={{ marginTop: '6mm' }}>미수 현황</h2>
                <table className="doc-terms">
                    <tbody>
                        <tr>
                            <th>기준월</th><td className="num">{statement.receivable.base_month}</td>
                        </tr>
                        <tr>
                            <th>잔액</th><td className="num">{won(statement.receivable.balance)}</td>
                        </tr>
                        {Number(statement.receivable.overdue_amount) > 0 && (
                            <tr>
                                <th>연체 금액</th>
                                <td className="num">
                                    {won(statement.receivable.overdue_amount)}
                                    {statement.receivable.aging_months > 0 &&
                                        ` (${statement.receivable.aging_months}개월 경과)`}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </>
        )}

        {statement.notes && (
            <>
                <h2 className="doc-h2" style={{ marginTop: '6mm' }}>비고</h2>
                <p style={{ margin: 0, fontSize: '9pt', whiteSpace: 'pre-wrap' }}>{statement.notes}</p>
            </>
        )}

        {company.quote_terms && <p className="doc-terms-note">{company.quote_terms}</p>}

        <Sign company={company} />
        <Foot company={company} />
    </div>
)

export default QuoteSheet
