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
  "docType": "sales" | "receivables" | "collection_report" | "daily_report" | "activity" | "unknown",
  "rows": [ ... ],
  "baseMonth": "YYYY-MM"   // 화면에 기준 시점이 적혀 있을 때만. 없으면 넣지 마라
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
     "dueDate": "YYYY-MM-DD" 또는 null,
     "carriedOver": 숫자 또는 null, "monthSales": 숫자 또는 null,
     "collected": 숫자 또는 null, "agingMonths": 숫자 또는 null, "note": "" }
   - 연체(기일 초과) 건만이 아니라 표에 보이는 행을 모두 담는다.
   - **amount 는 남은 잔액(미수금)이다.** 표에 '잔액'·'미수금'·'미수잔액' 칸이
     있으면 그 값을 쓴다.
   - 화면에 있으면 함께 담는다. **없으면 null로 두고 지어내지 않는다:**
     carriedOver 전월이월/이월잔액 · monthSales 당월매출 ·
     collected 당월수금/입금액 · agingMonths 경과월(개월 수) ·
     note 비고·메모 칸의 글자 그대로.
   - 표 위·아래에 기준 시점이 적혀 있으면(예: '2026년 8월', '26.08 현재',
     '2026-08-31 기준') 최상위에 "baseMonth": "YYYY-MM" 으로 담는다.
     **화면에 없으면 넣지 않는다** — 오늘 날짜로 짐작하지 마라.
   - 목록이 잘려 있거나 다음 쪽이 있어 보이면(스크롤 막대, '1/3', '다음' 등)
     warnings에 그렇게 적는다. **몇 곳이 전부인지가 중요하다.**

3) daily_report — 일일업무보고서 양식 (한 장이 하루)
   { "clientName": "거래처명", "activity_date": "YYYY-MM-DD", "person": "만난 담당자",
     "purpose": "관리"|"신규"|"기타", "time": "9:30" 또는 "유선",
     "description": "방문 및 미팅 내용 전문" }
   - 표는 [거래처명 | 담당자 | 방문목적(관리/신규/기타) | 방문 및 미팅 내용] 구조다.
     거래처명 아래 칸에 방문시간(9:30 등)이나 '유선'이 적혀 있다.
   - 방문목적은 관리/신규/기타 칸 중 O 표시가 된 것을 쓴다.
   - activity_date는 상단 '일자 :' 값을 모든 행에 그대로 넣는다.
   - **'■ 금일 영업 계획' 아래 표는 절대 넣지 마라.** 아직 다녀오지 않은 계획이고,
     실제로 다녀오면 다음 날 일지에 방문기록으로 다시 나온다. 넣으면 이중 계상된다.
   - 방문 및 미팅 내용은 요약하지 말고 보이는 대로 옮긴다.

4) collection_report — 「영업사원 거래처별 매출/수금 실적표」
   거래처 하나가 **네 줄**(이월 / 매출 / 수금 / 잔액)이고, 열은 1월~12월 + 합계다.
   { "clientName": "거래처명", "code": "거래처코드", "phone": "전화번호",
     "months": { "1": { "carried": 숫자, "sales": 숫자, "collected": 숫자, "balance": 숫자 },
                 "2": { ... }, ... "12": { ... } } }
   - 최상위에 "year": 숫자(표 머리의 '년 도'), "salesRep": "사원명", "page": "5/6" 을 담는다.
   - **'사원별 합계' · '잔액 합계' 행은 rows 에 넣지 마라.** 최상위 "repTotal" 에
     { "carried": 숫자, "sales": 숫자, "collected": 숫자, "balance": 숫자 } 로 담는다.
     그 값은 **기준월(거래가 있는 마지막 달) 칸**의 값을 쓴다.
   - **합계 열은 months 에 넣지 마라.** 1~12월만 담는다.
   - 빈칸은 0으로 둔다. 괄호나 앞의 '-'가 붙은 값은 음수다(실제로 나온다).
   - 거래처명은 왼쪽 칸 전체를 그대로 옮긴다. 두 줄로 접혀 있으면 이어 붙인다
     (예: '주식회사 수산 / 머티리얼즈' -> '주식회사 수산머티리얼즈').
     **비슷한 회사 이름으로 고쳐 쓰지 마라.** 보이는 그대로가 중요하다.
   - 한 쪽에 열 곳 남짓 있다. **한 곳도 빠뜨리지 마라** — 빠지면 잔액 합계가 안 맞는다.

5) activity — 일정/방문/미팅/메모
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
    collection_report: '이 이미지는 「영업사원 거래처별 매출/수금 실적표」다. docType은 "collection_report"로 한다. 거래처마다 이월/매출/수금/잔액 네 줄이 있고 열이 1~12월이다.',
    activity: '이 이미지는 일정/활동 자료다. docType은 "activity"로 한다.',
    daily_report: '이 이미지는 일일업무보고서다. docType은 "daily_report"로 한다.',
    auto: '이미지를 보고 매출(sales) / 채권(receivables) / 매출수금실적표(collection_report) / 일일업무보고서(daily_report) / 일정(activity) 중 무엇인지 스스로 판단한다. 상단에 "일일 업무 보고서"라고 적혀 있거나 [거래처명/담당자/방문목적/방문 및 미팅 내용] 표가 보이면 daily_report다. 상단에 "영업사원 거래처별 매출/수금 실적표"라고 적혀 있거나 거래처마다 [이월/매출/수금/잔액] 네 줄이 1~12월 열에 걸쳐 있으면 collection_report다.'
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
