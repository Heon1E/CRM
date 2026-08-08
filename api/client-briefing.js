/**
 * 거래처 브리핑 — 쌓인 영업활동 기록을 읽어 정리한다
 *
 * 활동 메모에는 실제로 쓸 만한 정보가 다 들어 있다. 경쟁사, 월 사용량, 상대 단가,
 * 걸림돌, 다음에 하기로 한 것까지. 다만 여러 달에 걸쳐 흩어져 있어서 사람이
 * 매번 스무 건을 다시 읽을 수는 없다. 그걸 대신 읽고 한 장으로 접어 준다.
 *
 * **숫자는 여기서 만들지 않는다.** 매출·접촉 횟수 같은 수치는 앱이 계산해서
 * 화면에 따로 보여준다. 모델은 글로 적힌 것만 읽는다 — 숫자를 지어내면
 * 영업 판단이 틀어지기 때문이다.
 *
 * 요청: POST { company, activities: [{date, type, description}], salesSummary }
 * 응답: { stage, headline, summary, keyFacts[], competitors[], opportunity[],
 *         blockers[], nextActions[], risk }
 */

export const config = { maxDuration: 60 }

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY

/** 영업 단계. 뒤로 갈수록 진행이 많이 된 것이다 (코치 정렬에 쓴다). */
export const STAGES = [
    '중단', '보류', '초기 접촉', '정보 파악', '견적 제출', '샘플 진행', '단가 협의', '발주 임박', '거래 중'
]

const PROMPT = (company, salesSummary) => `
너는 한국 B2B 영업사원(드럼·IBC·제리캔 등 산업용 용기 유통)의 참모다.
아래는 거래처 「${company}」에 대해 영업사원이 남긴 활동 기록 전문이다.
이것을 읽고 **아래 JSON 하나만** 출력한다. 설명 문장은 쓰지 않는다.

참고 (앱이 계산한 실제 수치. 네가 다시 계산하거나 바꾸지 마라):
${salesSummary}

{
  "stage": ${JSON.stringify(STAGES)} 중 하나,
  "headline": "지금 상황을 한 줄로 (30자 이내)",
  "summary": "무슨 일이 있었고 지금 어디까지 왔는지 2~4문장",
  "keyFacts": ["기억해야 할 사실. 담당자 이름/직급, 사용 품목과 월 물량, 상대 단가, 결제조건 등"],
  "competitors": ["현재 쓰고 있거나 경쟁 중인 회사"],
  "opportunity": ["따낼 수 있는 물량이나 품목. 기록에 적힌 것만"],
  "blockers": ["막고 있는 것. 기술 스펙, 일정, 가격, 내부 사정 등"],
  "nextActions": ["다음에 할 일. 기록에서 하기로 한 것 + 정황상 필요한 것"],
  "risk": "낮음" | "보통" | "높음"
}

규칙:
- **기록에 적힌 것만 쓴다.** 없는 숫자나 이름을 지어내지 마라. 근거가 없으면 빈 배열 []로 둔다.
- 각 항목은 짧게. 한 줄에 하나씩, 20~40자.
- keyFacts는 다음에 만나기 전에 다시 읽을 내용이다. 물량·단가·규격처럼 구체적인 것을 우선한다.
- stage는 가장 최근 기록을 기준으로 판단한다. 예전에 견적을 냈어도 지금 샘플 중이면 "샘플 진행".
- 이미 정기적으로 매출이 나오고 있으면 "거래 중".
- 오래 진척이 없거나 상대가 미루고 있으면 "보류", 명시적으로 접었으면 "중단".
- risk는 이 건을 놓칠 위험이다. 경쟁사가 지키고 있거나 걸림돌이 크면 "높음".
`

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') return res.status(200).end()
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    if (!GEMINI_KEY) {
        return res.status(500).json({ error: 'API_KEY_MISSING', message: 'GEMINI_API_KEY가 설정되지 않았습니다.' })
    }

    try {
        let body = req.body
        if (typeof body === 'string') body = JSON.parse(body)

        const company = String(body?.company || '').trim()
        const activities = Array.isArray(body?.activities) ? body.activities : []
        const salesSummary = String(body?.salesSummary || '(매출 정보 없음)')

        if (!company) return res.status(400).json({ error: 'NO_COMPANY', message: '거래처명이 없습니다.' })
        if (activities.length === 0) {
            return res.status(400).json({ error: 'NO_ACTIVITY', message: '활동 기록이 없어 정리할 내용이 없습니다.' })
        }

        // 오래된 것부터 읽어야 진행 순서가 보인다. 너무 길면 최근 40건만.
        const notes = activities
            .slice(-40)
            .map((a) => `[${a.date}] ${a.type || ''}\n${String(a.description || '').trim()}`)
            .join('\n\n')

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        role: 'user',
                        parts: [{ text: PROMPT(company, salesSummary) }, { text: `\n활동 기록:\n${notes}` }]
                    }],
                    generationConfig: {
                        // 사실을 옮기는 일이다. 창의성이 끼면 없는 숫자가 생긴다.
                        temperature: 0.1,
                        maxOutputTokens: 4096,
                        responseMimeType: 'application/json'
                    }
                })
            }
        )

        if (!response.ok) {
            const detail = await response.json().catch(() => ({}))
            console.error('[client-briefing] Gemini error', response.status, detail)
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
            const m = cleaned.match(/\{[\s\S]*\}/)
            parsed = JSON.parse(m ? m[0] : cleaned)
        } catch {
            console.error('[client-briefing] non-JSON:', text.slice(0, 300))
            return res.status(502).json({ error: 'BAD_RESPONSE', message: '정리 결과를 이해하지 못했습니다.' })
        }

        const arr = (v) => (Array.isArray(v) ? v.filter(Boolean).map(String) : [])
        return res.status(200).json({
            stage: STAGES.includes(parsed.stage) ? parsed.stage : '정보 파악',
            headline: String(parsed.headline || ''),
            summary: String(parsed.summary || ''),
            keyFacts: arr(parsed.keyFacts),
            competitors: arr(parsed.competitors),
            opportunity: arr(parsed.opportunity),
            blockers: arr(parsed.blockers),
            nextActions: arr(parsed.nextActions),
            risk: ['낮음', '보통', '높음'].includes(parsed.risk) ? parsed.risk : '보통',
            model: MODEL,
            activityCount: activities.length
        })
    } catch (error) {
        console.error('[client-briefing] error', error)
        return res.status(500).json({ error: 'SERVER_ERROR', message: error.message })
    }
}
