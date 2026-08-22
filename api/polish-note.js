/**
 * 활동 메모 다듬기 — **서버에서 부른다.**
 *
 * 예전에는 활동 추가·수정 모달이 브라우저에서 직접 Gemini를 불렀다
 * (`import.meta.env.VITE_GEMINI_API_KEY`). 두 가지가 잘못됐다:
 *
 * 1. **배포본에서 동작하지 않는다.** `VITE_` 값은 빌드 시점에 번들에 박히는데
 *    Vercel에 그 변수가 없어서 `undefined`가 됐다. 단추를 누르면
 *    'API Key가 설정되지 않았습니다'만 뜬다 — 아무도 못 쓰는 기능이었다.
 * 2. **넣었으면 더 나빴다.** `VITE_` 접두어가 붙은 값은 배포된 JS에서 문자열로
 *    그대로 추출된다. 주소를 아는 누구나 우리 Gemini 할당량을 쓸 수 있다.
 *    (CLAUDE.md가 "근본 해결은 서버에서 호출하고 키를 VITE_ 없이 두는 것"이라고
 *    적어 둔 그 자리다.)
 *
 * 그래서 `analyze-erp` · `client-briefing`과 같은 방식으로 옮겼다.
 * 키는 `GEMINI_API_KEY`(VITE_ 없음)를 쓴다.
 */
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY

/*
 * **모델은 숫자를 시각으로 바꾼다.** 실제로 겪었다 —
 *   입력 "IBC 단가 얘기했고 15만원대 원함. 우리는 16만원."
 *   출력 "IBC 미팅을 **15시에** 진행. **익일 16시에** 추가 미팅 예정."
 * 금액이 시각이 되고, 거래처명·사람·단가 협상은 통째로 사라졌다.
 *
 * 활동 기록은 영업 코치·KPI·거래처 브리핑의 근거다. 지어낸 문장은
 * 다듬지 않은 원문보다 나쁘다. 그래서 규칙을 예시와 함께 못박는다.
 * 그래도 완전하지는 않으므로 **화면에서 사람이 보고 받아들인다**
 * (원문을 조용히 덮어쓰지 않는다).
 */
const PROMPT = (raw) => `너는 B2B 영업사원의 활동 기록을 다듬는 조수다.
말투만 정리하고, **내용은 하나도 바꾸지 않는다.**

절대 규칙:
1. 원문에 없는 사실을 만들지 마라. 특히 **시각·날짜·약속을 지어내지 마라.**
2. 숫자는 **단위째로 그대로** 옮겨라. '15만원'은 금액이지 시각이 아니다.
   '16만원'을 '16시'로 바꾸는 것은 심각한 오류다.
3. 거래처명·사람 이름·직급은 **반드시 남겨라.** 빼면 누구 이야기인지 알 수 없다.
4. 원문에 있는 내용을 요약하며 버리지 마라. 문장을 다듬되 사실은 모두 남긴다.
5. 결과만 출력한다. 설명·머리말·따옴표를 붙이지 마라.

예시:
  원문: 오늘 한솔 김부장 만남. IBC 단가 15만원대 원함. 우리는 16만원. 다음주 통화하기로.
  출력: 한솔 김부장과 미팅. IBC 단가에 대해 고객은 15만원대를 희망하며, 당사 제시가는 16만원임. 다음 주 유선 협의 예정.

[원문]
${raw}`

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') return res.status(200).end()
    if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD', message: 'POST만 받습니다.' })

    if (!GEMINI_KEY) {
        return res.status(500).json({
            error: 'API_KEY_MISSING',
            message: 'GEMINI_API_KEY가 설정되지 않았습니다. Vercel 환경변수를 확인하세요.',
        })
    }

    const raw = String(req.body?.text || '').trim()
    if (!raw) return res.status(400).json({ error: 'NO_TEXT', message: '다듬을 내용이 없습니다.' })
    // 활동 메모가 소설이 될 일은 없다. 지나치게 긴 입력은 자른다.
    if (raw.length > 4000) return res.status(400).json({ error: 'TOO_LONG', message: '내용이 너무 깁니다 (4000자 이하).' })

    try {
        const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT(raw) }] }] }),
            }
        )
        if (!r.ok) {
            const detail = await r.json().catch(() => ({}))
            console.error('[polish-note] Gemini 실패', r.status, detail?.error?.message)
            // 사용자에게는 다시 해 볼 수 있는 말로 돌려준다
            const message = r.status === 429
                ? '사용량이 많아 잠시 지연되고 있습니다. 1분 뒤 다시 시도해 주세요.'
                : r.status === 404
                    ? 'AI 모델을 찾을 수 없습니다. GEMINI_MODEL 설정을 확인하세요.'
                    : '글 다듬기에 실패했습니다. 원문은 그대로 남아 있습니다.'
            return res.status(r.status === 429 ? 429 : 502).json({ error: 'GEMINI', message })
        }
        const data = await r.json()
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        if (!text) return res.status(502).json({ error: 'EMPTY', message: '결과가 비어 있습니다. 원문은 그대로 남아 있습니다.' })
        return res.status(200).json({ text })
    } catch (e) {
        console.error('[polish-note]', e.message)
        return res.status(500).json({ error: 'UNEXPECTED', message: '글 다듬기에 실패했습니다. 원문은 그대로 남아 있습니다.' })
    }
}
