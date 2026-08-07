/**
 * ERP 화면 스크린샷 판독 (서버리스)
 *
 * 스크린샷을 Gemini Vision에 넘겨 표를 구조화된 JSON으로 되돌린다.
 * 매출 / 채권 / 활동(일정) 세 가지를 알아본다.
 *
 * **키는 서버에만 둔다.** 프론트에서 직접 Gemini를 부르면 VITE_ 접두어 때문에
 * 배포 번들에 키가 그대로 박힌다. 이 경로로만 부를 것.
 *
 * 요청 : POST { images: [dataURL...], docType?: 'auto'|'sales'|'receivables'|'activity', defaultYear?: number }
 * 응답 : { docType, rows: [...], summary, warnings: [], model }
 *
 * 판독 결과는 **그대로 저장하지 않는다.** 화면에서 사람이 확인·수정한 뒤
 * 매출은 대사(useSalesImport)를 거쳐 반영된다.
 */

export const config = { maxDuration: 60 }

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

// Vercel 요청 본문 한도(약 4.5MB)를 넘으면 함수까지 오지도 못한다.
// 프론트에서 리사이즈하지만 서버에서도 한 번 막는다.
const MAX_TOTAL_BYTES = 4 * 1024 * 1024
const MAX_IMAGES = 6

const SCHEMA_HINT = `
반환 형식(JSON only):
{
  "docType": "sales" | "receivables" | "activity" | "unknown",
  "rows": [ ... ],
  "summary": "한 줄 요약(한국어)",
  "warnings": ["판독이 불확실한 부분(한국어)"]
}

docType 별 rows 형식:

1) sales  — 매출/판매/출고/거래명세 표
   { "clientName": "거래처명", "sale_date": "YYYY-MM-DD", "item_name": "품목명",
     "quantity": 숫자, "unitPrice": 숫자, "notes": "비고" }
   - unitPrice는 부가세 제외 단가. 표에 공급가액/합계만 있으면 합계÷수량으로 계산한다.
   - 합계·소계·총계 행은 제외한다.

2) receivables — 미수금/채권/외상매출금 현황
   { "clientName": "거래처명", "amount": 숫자(원), "overdueDays": 숫자 또는 null,
     "dueDate": "YYYY-MM-DD" 또는 null }
   - 연체(기일 초과) 건만이 아니라 표에 보이는 행을 모두 담는다.

3) activity — 일정/방문/미팅/메모
   { "clientName": "거래처명 또는 빈 문자열", "activity_date": "YYYY-MM-DD",
     "type": "방문"|"미팅"|"전화"|"이메일"|"기타", "description": "내용",
     "next_action_date": "YYYY-MM-DD" 또는 null, "next_action_detail": "" }

규칙:
- 화면에 보이는 값만 쓴다. 추측해서 채우지 않는다. 모르면 null 또는 "".
- 금액·수량에서 콤마와 '원'을 제거하고 숫자만 넣는다. 괄호로 감싼 음수는 음수로.
- 날짜에 연도가 없으면 DEFAULT_YEAR를 쓴다. 2자리 연도는 20xx로 본다.
- 흐릿하거나 잘려서 확신이 없는 행은 rows에 넣되 warnings에 어떤 행인지 적는다.
- 표가 없거나 알아볼 수 없으면 docType은 "unknown", rows는 [].
- 설명 문장 없이 JSON만 출력한다.
`

const TYPE_HINT = {
    sales: '이 이미지는 매출/판매 자료다. docType은 "sales"로 한다.',
    receivables: '이 이미지는 미수금/채권 자료다. docType은 "receivables"로 한다.',
    activity: '이 이미지는 일정/활동 자료다. docType은 "activity"로 한다.',
    auto: '이미지를 보고 매출(sales) / 채권(receivables) / 일정(activity) 중 무엇인지 스스로 판단한다.'
}

const parseDataUrl = (dataUrl) => {
    const parts = String(dataUrl).split(',')
    const data = parts[1] || parts[0]
    const mimeType = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg'
    return { data, mimeType }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') return res.status(200).end()
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY
    if (!API_KEY) {
        return res.status(500).json({
            error: 'API_KEY_MISSING',
            message: 'Vercel 환경변수에 GEMINI_API_KEY를 설정해 주세요.'
        })
    }

    try {
        let body = req.body
        if (typeof body === 'string') body = JSON.parse(body)

        const images = Array.isArray(body?.images) ? body.images : (body?.imageBase64 ? [body.imageBase64] : [])
        const docType = TYPE_HINT[body?.docType] ? body.docType : 'auto'
        const defaultYear = Number(body?.defaultYear) || new Date().getFullYear()

        if (images.length === 0) {
            return res.status(400).json({ error: 'NO_IMAGE', message: '이미지가 없습니다.' })
        }
        if (images.length > MAX_IMAGES) {
            return res.status(400).json({
                error: 'TOO_MANY_IMAGES',
                message: `한 번에 최대 ${MAX_IMAGES}장까지 처리합니다.`
            })
        }

        const totalBytes = images.reduce((a, s) => a + String(s).length * 0.75, 0)
        if (totalBytes > MAX_TOTAL_BYTES) {
            return res.status(413).json({
                error: 'PAYLOAD_TOO_LARGE',
                message: '이미지 용량이 너무 큽니다. 장수를 줄이거나 화면을 나눠 찍어 주세요.'
            })
        }

        const prompt =
            `너는 한국 중소기업 ERP 화면을 읽어 데이터로 옮기는 도구다.\n` +
            `${TYPE_HINT[docType]}\n` +
            `DEFAULT_YEAR = ${defaultYear}\n` +
            SCHEMA_HINT

        const parts = [{ text: prompt }]
        images.forEach((img) => {
            const { data, mimeType } = parseDataUrl(img)
            parts.push({ inlineData: { data, mimeType } })
        })

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts }],
                    generationConfig: {
                        // 표 판독은 창의성이 필요 없다. 낮을수록 숫자를 지어내지 않는다.
                        temperature: 0,
                        maxOutputTokens: 8192,
                        responseMimeType: 'application/json'
                    }
                })
            }
        )

        if (!response.ok) {
            const detail = await response.json().catch(() => ({}))
            console.error('[analyze-erp] Gemini error', response.status, detail)
            return res.status(response.status).json({
                error: 'GEMINI_FAILED',
                message: detail?.error?.message || `Gemini 호출 실패 (${response.status})`
            })
        }

        const data = await response.json()
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''

        let parsed
        try {
            const cleaned = text.replace(/```json|```/g, '').trim()
            const match = cleaned.match(/\{[\s\S]*\}/)
            parsed = JSON.parse(match ? match[0] : cleaned)
        } catch {
            console.error('[analyze-erp] non-JSON response:', text.slice(0, 400))
            return res.status(502).json({
                error: 'BAD_RESPONSE',
                message: '판독 결과를 이해하지 못했습니다. 화면을 더 크게 찍어 다시 시도해 주세요.'
            })
        }

        return res.status(200).json({
            docType: parsed.docType || 'unknown',
            rows: Array.isArray(parsed.rows) ? parsed.rows : [],
            summary: parsed.summary || '',
            warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
            model: MODEL
        })
    } catch (error) {
        console.error('[analyze-erp] error', error)
        return res.status(500).json({ error: 'SERVER_ERROR', message: error.message })
    }
}
