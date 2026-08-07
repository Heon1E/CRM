/**
 * 텔레그램 봇 수신 (서버리스)
 *
 * 휴대폰에서 봇에게 스크린샷이나 메시지를 보내면 Gemini가 읽어 구조화한 뒤
 * telegram_inbox 테이블에 '대기' 상태로 담는다.
 *
 * **봇은 매출을 직접 저장하지 않는다.**
 * 매출은 대사(reconcileSales)를 거쳐야 중복이 생기지 않고, 그 로직은 앱에 있다.
 * 봇이 바로 넣으면 2026-08-05 중복 사고가 재현된다. 반영은 앱에서 사람이 확인한 뒤 한다.
 *
 * 필요한 환경변수 (Vercel, 모두 VITE_ 접두어 없이):
 *   TELEGRAM_BOT_TOKEN        BotFather가 준 토큰
 *   TELEGRAM_WEBHOOK_SECRET   임의의 긴 문자열. 이 주소로 오는 가짜 요청을 막는다.
 *   TELEGRAM_ALLOWED_CHAT_IDS 쉼표로 구분한 허용 chat id. **반드시 설정할 것.**
 *   GEMINI_API_KEY            판독용
 *   SUPABASE_URL              프로젝트 URL
 *   SUPABASE_SERVICE_ROLE_KEY 서버 전용 키. 절대 VITE_를 붙이지 말 것.
 */

export const config = { maxDuration: 60 }

const TG = (method) =>
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

const PROMPT = (today) => `
너는 한국 B2B 영업사원의 CRM 비서다. 사용자가 보낸 메시지나 ERP 화면 사진을 읽고
아래 JSON 하나만 출력한다. 설명 문장은 쓰지 않는다.

오늘 날짜: ${today}

{
  "docType": "sales" | "receivables" | "activity" | "memo" | "unknown",
  "rows": [ ... ],
  "summary": "사용자에게 보여줄 한국어 한 줄 요약",
  "warnings": ["불확실한 부분"]
}

docType 판단:
- 거래처·품목·수량·금액이 있는 표      -> sales
- 미수금/채권/외상 잔액 표             -> receivables
- 방문·미팅·전화 기록, 일정, 약속      -> activity
- 위 어디에도 안 맞는 메모             -> memo

rows 형식:
- sales:       { "clientName", "sale_date": "YYYY-MM-DD", "item_name", "quantity": 숫자, "unitPrice": 숫자, "notes" }
- receivables: { "clientName", "amount": 숫자, "overdueDays": 숫자|null, "dueDate": "YYYY-MM-DD"|null }
- activity:    { "clientName", "activity_date": "YYYY-MM-DD", "type": "방문"|"미팅"|"전화"|"이메일"|"기타",
                 "description", "next_action_date": "YYYY-MM-DD"|null, "next_action_detail" }
- memo:        { "text" }

규칙:
- 보이는 값만 쓴다. 모르면 null 또는 "". 추측해서 채우지 않는다.
- 금액·수량은 콤마와 '원'을 빼고 숫자만.
- '내일', '다음주 화요일' 같은 표현은 오늘 날짜를 기준으로 실제 날짜로 바꾼다.
- 합계·소계 행은 제외한다.
`

const json = (res, code, body) => res.status(code).json(body)

async function tgSend(chatId, text) {
    if (!process.env.TELEGRAM_BOT_TOKEN) return
    try {
        await fetch(TG('sendMessage'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
        })
    } catch (e) {
        console.error('[telegram] sendMessage 실패', e.message)
    }
}

/** 텔레그램에 올라온 사진을 base64로 가져온다 */
async function fetchPhotoBase64(photoSizes) {
    // 가장 큰 것을 쓴다. 표 글씨는 작아서 축소본으로는 못 읽는다.
    const best = photoSizes[photoSizes.length - 1]
    const infoRes = await fetch(TG(`getFile?file_id=${best.file_id}`))
    const info = await infoRes.json()
    if (!info.ok) throw new Error('사진을 가져오지 못했습니다.')

    const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${info.result.file_path}`
    const fileRes = await fetch(url)
    const buf = Buffer.from(await fileRes.arrayBuffer())
    return { data: buf.toString('base64'), mimeType: 'image/jpeg' }
}

async function callGemini(parts) {
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts }],
                generationConfig: { temperature: 0, maxOutputTokens: 8192, responseMimeType: 'application/json' }
            })
        }
    )
    if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error?.message || `Gemini 호출 실패 (${res.status})`)
    }
    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const cleaned = text.replace(/```json|```/g, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)
    return JSON.parse(match ? match[0] : cleaned)
}

async function saveToInbox(row) {
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/telegram_inbox`, {
        method: 'POST',
        headers: {
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
        },
        body: JSON.stringify(row)
    })
    if (!res.ok) throw new Error(`자료함 저장 실패 (${res.status}): ${await res.text()}`)
}

const LABEL = {
    sales: '매출',
    receivables: '채권(미수금)',
    activity: '일정·활동',
    memo: '메모',
    unknown: '분류 불명'
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })

    // ---- 1. 이 주소로 오는 가짜 요청 차단 ----
    // 웹훅 주소는 공개 URL이다. 비밀 토큰이 없으면 누구나 CRM에 데이터를 넣을 수 있다.
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    if (!secret || req.headers['x-telegram-bot-api-secret-token'] !== secret) {
        console.warn('[telegram] secret token 불일치 — 요청 거부')
        return json(res, 401, { ok: false })
    }

    // 텔레그램은 200이 아니면 계속 재전송한다. 처리 실패도 200으로 답하고 로그로 남긴다.
    const ok = () => json(res, 200, { ok: true })

    let update = req.body
    if (typeof update === 'string') {
        try { update = JSON.parse(update) } catch { return ok() }
    }

    const msg = update?.message || update?.edited_message
    if (!msg) return ok()

    const chatId = String(msg.chat?.id || '')
    const fromName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || msg.from?.username || ''

    // ---- 2. 허용된 사람만 ----
    const allowed = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
        .split(',').map((s) => s.trim()).filter(Boolean)

    if (allowed.length === 0) {
        // 설정 전에는 아무 것도 받지 않는다. 대신 본인 chat id를 알려준다.
        await tgSend(chatId, `설정이 끝나지 않았습니다.\n이 대화의 chat id는 <b>${chatId}</b> 입니다.\nVercel 환경변수 TELEGRAM_ALLOWED_CHAT_IDS 에 넣어 주세요.`)
        return ok()
    }
    if (!allowed.includes(chatId)) {
        await tgSend(chatId, '이 봇은 등록된 사용자만 쓸 수 있습니다.')
        console.warn('[telegram] 허용되지 않은 chat_id:', chatId)
        return ok()
    }

    // ---- 3. 명령어 ----
    const text = (msg.text || msg.caption || '').trim()
    if (text === '/start' || text === '/help') {
        await tgSend(chatId,
            '<b>CRM 비서</b>\n\n' +
            'ERP 화면을 캡처해서 보내거나, 그냥 적어서 보내세요.\n' +
            '읽어서 CRM 자료함에 담아둡니다.\n\n' +
            '• 매출/거래명세 화면 → 매출로 분류\n' +
            '• 미수금 화면 → 채권으로 분류\n' +
            '• "내일 오후 2시 한국화학 방문" → 일정으로 분류\n\n' +
            '담아둔 내용은 CRM <b>설정 &gt; 받은 항목</b>에서 확인하고 반영합니다.\n' +
            '(매출은 중복 검사를 거쳐야 해서 바로 저장하지 않습니다)\n\n' +
            `이 대화의 chat id: <code>${chatId}</code>`
        )
        return ok()
    }

    const photos = msg.photo
    if (!text && !photos) {
        await tgSend(chatId, '사진이나 글로 보내주세요. 사용법은 /help')
        return ok()
    }

    // ---- 4. 판독 ----
    try {
        const today = new Date().toISOString().slice(0, 10)
        const parts = [{ text: PROMPT(today) }]
        if (text) parts.push({ text: `\n사용자 메시지:\n${text}` })
        if (photos?.length) {
            const img = await fetchPhotoBase64(photos)
            parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } })
        }

        const parsed = await callGemini(parts)
        const docType = LABEL[parsed.docType] ? parsed.docType : 'unknown'
        const rows = Array.isArray(parsed.rows) ? parsed.rows : []

        await saveToInbox({
            chat_id: chatId,
            from_name: fromName,
            raw_text: text || null,
            has_image: Boolean(photos?.length),
            doc_type: docType,
            payload: { rows, summary: parsed.summary || '', warnings: parsed.warnings || [] },
            status: 'pending'
        })

        let reply = `✅ <b>${LABEL[docType]}</b>으로 읽었습니다. (${rows.length}건)\n`
        if (parsed.summary) reply += `${parsed.summary}\n`
        if (parsed.warnings?.length) reply += `\n⚠️ ${parsed.warnings.slice(0, 3).join('\n⚠️ ')}\n`
        reply += `\nCRM <b>설정 &gt; 받은 항목</b>에서 확인 후 반영해 주세요.`

        await tgSend(chatId, reply)
    } catch (e) {
        console.error('[telegram] 처리 실패', e)
        await tgSend(chatId, `읽지 못했습니다: ${e.message}\n화면을 더 크게 찍어 다시 보내주세요.`)
    }

    return ok()
}
