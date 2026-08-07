/**
 * ERP 화면 스크린샷 판독 (클라이언트 측)
 *
 * 실제 판독은 서버(`/api/analyze-erp`)에서 한다. 여기서는
 *   1) 이미지 축소 — Vercel 요청 본문 한도(약 4.5MB)를 넘지 않게
 *   2) 결과 정규화 — 날짜/숫자를 앱이 쓰는 형태로 통일
 * 두 가지만 한다.
 *
 * 판독 결과는 사람이 확인하기 전에는 저장하지 않는다.
 */

const ENDPOINT = '/api/analyze-erp'

/** 판독 정확도와 용량의 절충. 표 글씨가 뭉개지지 않을 만큼은 남긴다. */
const MAX_EDGE = 2000
const JPEG_QUALITY = 0.85

/**
 * File/Blob을 축소된 JPEG data URL로 바꾼다.
 * 원본이 작으면 그대로 둔다.
 */
export const fileToScaledDataUrl = (file) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'))
        reader.onload = () => {
            const img = new Image()
            img.onerror = () => reject(new Error('이미지 형식을 알아보지 못했습니다.'))
            img.onload = () => {
                const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
                const w = Math.round(img.width * scale)
                const h = Math.round(img.height * scale)

                const canvas = document.createElement('canvas')
                canvas.width = w
                canvas.height = h
                const ctx = canvas.getContext('2d')
                // 스크린샷은 대개 흰 배경이다. 투명 PNG가 검게 깔리는 것을 막는다.
                ctx.fillStyle = '#ffffff'
                ctx.fillRect(0, 0, w, h)
                ctx.drawImage(img, 0, 0, w, h)

                resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
            }
            img.src = reader.result
        }
        reader.readAsDataURL(file)
    })

/** '1,234,000원' / '(1,200)' / '₩3,000' -> 숫자 */
export const toNumber = (v) => {
    if (v === null || v === undefined || v === '') return 0
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0
    const text = String(v).trim()
    const negative = /^\(.*\)$/.test(text) || text.startsWith('-')
    const digits = text.replace(/[^0-9.]/g, '')
    if (!digits) return 0
    const n = Number(digits)
    if (!Number.isFinite(n)) return 0
    return negative ? -n : n
}

/**
 * 날짜를 YYYY-MM-DD로 통일한다.
 *
 * 대사(reconcileSales)는 날짜 문자열이 정확히 같아야 기존 매출을 찾아낸다.
 * 형식이 어긋나면 전부 신규로 잡혀 중복 등록된다(2026-08-05 사고).
 * 그래서 입력 경로마다 반드시 여기를 거친다.
 */
export const normalizeDate = (v, defaultYear = new Date().getFullYear()) => {
    if (v === null || v === undefined || v === '') return ''
    const text = String(v).trim()

    const ymd8 = text.match(/^(\d{4})(\d{2})(\d{2})$/)
    if (ymd8) return `${ymd8[1]}-${ymd8[2]}-${ymd8[3]}`

    const full = text.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
    if (full) return `${full[1]}-${full[2].padStart(2, '0')}-${full[3].padStart(2, '0')}`

    // 2자리 연도 (25.03.19)
    const short = text.match(/^(\d{2})\D+(\d{1,2})\D+(\d{1,2})/)
    if (short) return `20${short[1]}-${short[2].padStart(2, '0')}-${short[3].padStart(2, '0')}`

    // 연도 없음 (03/19, 3월 19일)
    const md = text.match(/^(\d{1,2})\D+(\d{1,2})$/)
    if (md) return `${defaultYear}-${md[1].padStart(2, '0')}-${md[2].padStart(2, '0')}`

    return text
}

const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))

/**
 * 스크린샷을 판독한다.
 * @param {File[]} files
 * @param {Object} opts
 * @param {'auto'|'sales'|'receivables'|'activity'} opts.docType
 * @param {number} opts.defaultYear - 화면에 연도가 없을 때 쓸 연도
 * @returns {Promise<{ docType: string, rows: Array, summary: string, warnings: string[] }>}
 */
export async function analyzeErpScreenshots(files, { docType = 'auto', defaultYear = new Date().getFullYear() } = {}) {
    if (!files || files.length === 0) throw new Error('이미지를 선택해 주세요.')

    const images = []
    for (const f of files) images.push(await fileToScaledDataUrl(f))

    const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images, docType, defaultYear })
    })

    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
        throw new Error(payload?.message || `판독 서버 오류 (${res.status})`)
    }

    const warnings = [...(payload.warnings || [])]
    const rows = normalizeRows(payload.docType, payload.rows || [], defaultYear, warnings)

    return { docType: payload.docType || 'unknown', rows, summary: payload.summary || '', warnings }
}

/** 판독 결과를 앱이 쓰는 형태로 맞춘다. 이상한 행은 warnings에 남긴다. */
function normalizeRows(docType, rows, defaultYear, warnings) {
    if (docType === 'sales') {
        return rows.map((r, i) => {
            const quantity = toNumber(r.quantity)
            let unitPrice = toNumber(r.unitPrice)
            const total = toNumber(r.totalAmount ?? r.total_amount ?? r.amount)

            // 단가가 비었는데 합계가 있으면 되돌려 계산한다
            if (!unitPrice && total && quantity) unitPrice = Math.round(total / quantity)

            const sale_date = normalizeDate(r.sale_date ?? r.date, defaultYear)
            if (!isValidDate(sale_date)) {
                warnings.push(`${i + 1}행: 날짜를 알아보지 못했습니다 (${r.sale_date ?? r.date ?? '빈칸'})`)
            }

            return {
                clientName: String(r.clientName ?? r.client_name ?? '').trim(),
                sale_date,
                item_name: String(r.item_name ?? r.itemName ?? '').trim(),
                quantity,
                unitPrice,
                notes: String(r.notes ?? '').trim()
            }
        })
    }

    if (docType === 'receivables') {
        return rows.map((r) => ({
            clientName: String(r.clientName ?? r.client_name ?? '').trim(),
            amount: toNumber(r.amount),
            overdueDays: r.overdueDays == null ? null : toNumber(r.overdueDays),
            dueDate: r.dueDate ? normalizeDate(r.dueDate, defaultYear) : null
        }))
    }

    if (docType === 'activity') {
        return rows.map((r) => ({
            clientName: String(r.clientName ?? r.client_name ?? '').trim(),
            activity_date: normalizeDate(r.activity_date ?? r.date, defaultYear),
            type: String(r.type ?? '기타').trim(),
            description: String(r.description ?? r.notes ?? '').trim(),
            next_action_date: r.next_action_date ? normalizeDate(r.next_action_date, defaultYear) : null,
            next_action_detail: String(r.next_action_detail ?? '').trim()
        }))
    }

    return rows
}
