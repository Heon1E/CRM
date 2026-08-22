/**
 * 텔레그램 봇 — 보낸 내용을 읽어 알맞은 곳에 넣는다
 *
 * 사진이든 글이든 하나의 창구로 받아서 종류를 판단하고 갈라 보낸다:
 *
 *   일정      -> schedules 에 바로 등록  (달력에 즉시 뜬다)
 *   업무기록  -> activities 에 바로 등록 (같은 거래처·같은 날은 중복 방지)
 *   매출      -> telegram_inbox 에 대기  ← 바로 넣지 않는다
 *   채권      -> telegram_inbox 에 대기  ← 바로 넣지 않는다
 *   질문      -> 오늘/이번주 일정을 답해 준다
 *   그 외     -> 메모로 담아둔다
 *
 * **매출을 바로 넣지 않는 이유.** 매출은 대사(reconcileSales)를 거쳐야 중복이
 * 안 생기는데 그 로직은 앱에 있다. 봇이 바로 INSERT하면 2026-08-05 중복 사고
 * (2,835건)가 그대로 재현된다. 일정·활동은 중복 위험이 낮고 지우기도 쉬워 바로 넣는다.
 *
 * **Vercel에 새로 넣을 것은 TELEGRAM_BOT_TOKEN 하나뿐이다.**
 * 설정할 게 많으면 아무도 끝까지 못 한다. 그래서 나머지는 전부 없앴다:
 *   - 비밀 토큰   : 봇 토큰에서 계산해 쓴다(deriveSecret). 사람이 정할 필요 없다.
 *   - 허용 목록   : bot_allowlist 테이블. 첫 /start가 스스로 등록한다.
 *   - Gemini/DB 키: 이미 있는 VITE_ 값을 그대로 쓴다.
 *
 * 선택 (없어도 동작):
 *   SUPABASE_SERVICE_ROLE_KEY  **필수.** RLS를 닫은 뒤로 anon 키로는 동작하지 않는다.
 *   TELEGRAM_ALLOWED_CHAT_IDS  DB 대신 환경변수로 허용 목록을 고정하고 싶을 때.
 */

import crypto from 'crypto'
import { nameCandidates, NON_CLIENT_PATTERN, looksLikeMultiCompany } from '../src/utils/clientAliases.js'

/**
 * 웹훅 비밀 토큰을 봇 토큰에서 만들어 낸다.
 *
 * 이 주소는 공개 URL이라 검증이 없으면 누구나 CRM에 데이터를 넣을 수 있다.
 * 그렇다고 사람에게 "긴 문자열을 하나 정해서 두 군데에 똑같이 넣으세요"라고 하면
 * 십중팔구 어긋난다. 봇 토큰만 알면 양쪽이 같은 값을 계산해 내도록 했다.
 */
export const deriveSecret = (botToken) =>
    crypto.createHash('sha256').update(`xavian-crm:${botToken}`).digest('hex')

export const config = { maxDuration: 60 }

const TG = (m) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${m}`
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY
const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
// service_role이 있으면 쓰고, 없으면 anon 키로 동작한다.
// schedules / telegram_inbox / activities 는 anon에도 쓰기가 열려 있다.
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
// RLS를 닫은 뒤로 anon 키로는 아무것도 못 읽고 못 쓴다 (execution/sql/auth_and_roles.sql).
// 서비스 롤 키가 없으면 조용히 실패하는 대신 눈에 띄게 알린다 — 봇이 말없이
// 죽어 있으면 며칠 뒤에야 알게 된다.
const HAS_SERVICE_KEY = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
if (!HAS_SERVICE_KEY) {
    console.error('[설정 필요] SUPABASE_SERVICE_ROLE_KEY 가 없습니다. '
        + 'RLS가 닫혀 있어 anon 키로는 동작하지 않습니다. '
        + 'Vercel 환경변수에 넣어 주세요 (VITE_ 접두어 없이).')
}
const KST_OFFSET = '+09:00'

// ---------------------------------------------------------------------------
// 시간 (서버는 UTC로 돈다. 한국 날짜를 기준으로 판단해야 '내일'이 맞는다)
// ---------------------------------------------------------------------------
const kstNow = () => new Date(Date.now() + 9 * 3600 * 1000)
const kstToday = () => kstNow().toISOString().slice(0, 10)
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

// ---------------------------------------------------------------------------
// 거래처 이름 정규화 (앱의 buildClientKeys와 같은 기준)
// ---------------------------------------------------------------------------
const normalizeKey = (name, { removeCorp = false, removePunct = false } = {}) => {
    if (!name) return ''
    let t = String(name).replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/㈜/g, '(주)').trim()
    if (removeCorp) t = t.replace(/주식회사|유한회사|합자회사|합명회사|유한|㈜|\(주\)|\(유\)/g, '')
    t = removePunct ? t.replace(/[\s()[\]{}\-_.·]/g, '') : t.replace(/\s+/g, '')
    return t.toLowerCase()
}
const keysOf = (n) => [...new Set([
    normalizeKey(n), normalizeKey(n, { removeCorp: true }),
    normalizeKey(n, { removePunct: true }), normalizeKey(n, { removeCorp: true, removePunct: true })
])].filter(Boolean)

// ---------------------------------------------------------------------------
// Supabase (REST). service_role 키는 RLS를 우회한다.
// ---------------------------------------------------------------------------
const sb = async (path, { method = 'GET', body, prefer } = {}) => {
    const key = SUPA_KEY
    const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
        method,
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            ...(prefer ? { Prefer: prefer } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    })
    const text = await res.text()
    if (!res.ok) {
        const err = new Error(`${path} ${res.status}: ${text.slice(0, 200)}`)
        // RLS 거부. 서비스 롤 키가 없으면 여기로 온다.
        err.denied = res.status === 401 || res.status === 403 || text.includes('42501')
        throw err
    }
    return text ? JSON.parse(text) : null
}

/**
 * 서비스 롤 키가 없으면 RLS에 막혀 아무것도 못 한다.
 * **조회는 오류가 아니라 빈 결과로 돌아오므로** 허용 목록이 비어 보이고,
 * 그 다음 등록에서야 권한 오류로 드러난다. 그때 이 안내를 보낸다.
 */
const SETUP_HINT =
    '⚠️ <b>봇이 데이터베이스에 접근하지 못합니다.</b>\n\n'
    + 'Vercel 환경변수에 <b>SUPABASE_SERVICE_ROLE_KEY</b>를 넣어 주세요.\n'
    + 'Supabase → Project Settings → API → service_role 값입니다.\n'
    + '(VITE_ 접두어 없이 넣고, 넣은 뒤 재배포해야 합니다.)'

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

async function fetchPhotoBase64(photoSizes) {
    // 가장 큰 것을 쓴다. 표 글씨는 작아서 축소본으로는 못 읽는다.
    const best = photoSizes[photoSizes.length - 1]
    const info = await fetch(TG(`getFile?file_id=${best.file_id}`)).then((r) => r.json())
    if (!info.ok) throw new Error('사진을 가져오지 못했습니다.')
    const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${info.result.file_path}`
    const buf = Buffer.from(await fetch(url).then((r) => r.arrayBuffer()))
    return { data: buf.toString('base64'), mimeType: 'image/jpeg' }
}

// ---------------------------------------------------------------------------
// 판독 프롬프트 — 무엇인지 고르고, 그에 맞는 칸만 채운다
// ---------------------------------------------------------------------------
const PROMPT = (today, dow) => `
너는 한국 B2B 영업사원(드럼·IBC 용기 유통)의 CRM 비서다.
사용자가 보낸 메시지나 사진을 읽고 **아래 JSON 하나만** 출력한다. 설명 문장은 쓰지 않는다.

오늘은 ${today} (${dow}요일) 이다. 한국 시간 기준.

{
  "intent": "schedule" | "activity" | "sales" | "receivables" | "question" | "memo",
  "items": [ ... ],
  "reply": "사용자에게 보여줄 한국어 한 줄 요약",
  "warnings": ["불확실한 부분"]
}

intent 고르는 법:
- 앞으로 할 일 / 약속 / 방문 예정 / "내일", "다음주", "몇시에"  -> schedule
- 이미 다녀온 방문·미팅·통화 기록, 일일업무보고서 사진          -> activity
- 거래처·품목·수량·금액이 있는 매출표 사진                     -> sales
- 미수금/채권/외상 잔액표 사진                                 -> receivables
- "오늘 일정 뭐야", "이번주 뭐 있어" 같은 물음                  -> question
- 위 어디에도 안 맞는 메모                                     -> memo

items 형식:

schedule:
  { "title": "무엇을 하는지", "clientName": "거래처명 또는 \\"\\"",
    "date": "YYYY-MM-DD", "time": "HH:MM" 또는 null,
    "durationMin": 숫자 또는 null, "location": "", "kind": "방문"|"미팅"|"전화"|"기타", "notes": "" }
  - '내일', '모레', '다음주 화요일'은 오늘 날짜를 기준으로 실제 날짜로 바꾼다.
  - 시간이 없으면 time은 null (종일 일정으로 본다).
  - "오후 2시"는 "14:00" 으로 쓴다.

activity:
  { "clientName": "거래처명", "date": "YYYY-MM-DD",
    "kind": "미팅"|"전화", "person": "만난 사람", "description": "내용",
    "nextDate": "YYYY-MM-DD" 또는 null, "nextDetail": "다음에 할 일" }
  - 유선/통화면 kind는 "전화", 직접 갔으면 "미팅".
  - "다음주에 견적 보내기로 함", "2주 뒤 재방문" 처럼 **다음에 할 일이 적혀 있으면**
    nextDate와 nextDetail을 채운다. 오늘 날짜를 기준으로 실제 날짜로 바꾼다.
    적혀 있지 않으면 null. 지어내지 마라.
  - 일일업무보고서 사진이면 **'금일 영업 계획' 표는 절대 넣지 마라.**
    아직 다녀오지 않은 계획이고, 다녀오면 다음 날 일지에 다시 나와 이중 계상된다.

sales:
  { "clientName": "", "date": "YYYY-MM-DD", "itemName": "", "quantity": 숫자, "unitPrice": 숫자 }
  - 단가는 부가세 제외. 합계만 있으면 합계÷수량.
  - 합계·소계 행은 제외한다.

receivables:
  { "clientName": "", "amount": 숫자, "overdueDays": 숫자 또는 null }

question:
  { "ask": "today" | "week" | "other" }

memo:
  { "text": "내용" }

규칙:
- 보이는 값만 쓴다. 모르면 null 또는 "". 지어내지 않는다.
- 금액·수량은 콤마와 '원'을 빼고 숫자만.
- 한 메시지에 여러 건이 있으면 items에 모두 담는다.
`

async function callGemini(parts) {
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
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
    const m = cleaned.match(/\{[\s\S]*\}/)
    return JSON.parse(m ? m[0] : cleaned)
}

// ---------------------------------------------------------------------------
// 갈라 보내기
// ---------------------------------------------------------------------------
/*
 * **요일이 하루씩 밀려 있었다.** `T00:00:00+09:00`은 한국 자정이고 그 순간은
 * UTC로 전날 15시다. 거기서 `getUTCDay()`를 읽으면 언제나 하루 전 요일이 나온다
 * (2026-08-22 토요일이 '금'으로 나갔다). `d`는 이미 한국 날짜 문자열이므로
 * 시각이 아니라 **달력상의 그 날짜**로 읽어야 한다 — UTC 자정이 그 역할을 한다.
 */
const fmtDate = (d) => {
    const dt = new Date(`${d}T00:00:00Z`)
    return `${d.slice(5).replace('-', '/')}(${WEEKDAY[dt.getUTCDay()]})`
}

async function loadClients() {
    const rows = await sb('clients?select=id,company&limit=5000')
    const map = new Map()
    rows.forEach((c) => keysOf(c.company).forEach((k) => { if (!map.has(k)) map.set(k, c) }))
    return map
}
const findClient = (map, raw) => {
    if (!raw || NON_CLIENT_PATTERN.test(String(raw).trim()) || looksLikeMultiCompany(raw)) return null
    for (const cand of nameCandidates(raw)) {
        const hit = keysOf(cand).map((k) => map.get(k)).find(Boolean)
        if (hit) return hit
    }
    return null
}

/** 일정 -> schedules (달력에 바로 뜬다) */
async function applySchedules(items, clientMap) {
    const saved = []
    for (const it of items) {
        if (!it.date) continue
        const c = findClient(clientMap, it.clientName)
        const time = /^\d{1,2}:\d{2}$/.test(it.time || '') ? it.time.padStart(5, '0') : null
        const startsAt = `${it.date}T${time || '09:00'}:00${KST_OFFSET}`
        const dur = Number(it.durationMin) > 0 ? Number(it.durationMin) : 60
        const endsAt = new Date(new Date(startsAt).getTime() + dur * 60000).toISOString()

        await sb('schedules', {
            method: 'POST', prefer: 'return=minimal',
            body: [{
                title: it.title || `${it.clientName || ''} ${it.kind || '방문'}`.trim(),
                starts_at: startsAt,
                ends_at: endsAt,
                all_day: !time,
                client_id: c ? c.id : null,
                client_name: it.clientName || null,
                location: it.location || null,
                notes: it.notes || null,
                kind: it.kind || '방문',
                status: '예정',
                source: 'telegram'
            }]
        })
        saved.push({ ...it, time, matched: !!c, company: c?.company })
    }
    return saved
}

/** 업무기록 -> activities (같은 거래처·같은 날은 건너뛴다) */
async function applyActivities(items, clientMap) {
    const saved = [], skipped = [], unmatched = []
    for (const it of items) {
        const c = findClient(clientMap, it.clientName)
        if (!c) { unmatched.push(it.clientName || '(거래처 없음)'); continue }
        if (!it.date) { skipped.push(`${c.company} (날짜 없음)`); continue }

        const dup = await sb(
            `activities?select=id&client_id=eq.${c.id}&activity_date=eq.${it.date}&limit=1`
        )
        if (dup.length) { skipped.push(`${c.company} ${fmtDate(it.date)}`); continue }

        await sb('activities', {
            method: 'POST', prefer: 'return=minimal',
            body: [{
                client_id: c.id,
                client_name: c.company,
                activity_date: it.date,
                // 유선은 방문이 아니다. KPI 정기적방문횟수는 미팅/방문만 센다.
                type: it.kind === '전화' ? '전화' : '미팅',
                status: '완료',
                description: [it.person ? `[담당자] ${it.person}` : '', it.description || ''].filter(Boolean).join('\n'),
                // '다음에 할 일'이 적혀 있으면 같이 담는다. 이게 아침 브리핑의 재료다.
                next_action_date: /^\d{4}-\d{2}-\d{2}$/.test(it.nextDate || '') ? it.nextDate : null,
                next_action_detail: it.nextDetail || null
            }]
        })
        saved.push(c.company)
    }
    return { saved, skipped, unmatched }
}

/** 오늘/이번주 일정 답하기 */
async function answerQuestion(ask) {
    const today = kstToday()
    const from = `${today}T00:00:00${KST_OFFSET}`
    const days = ask === 'week' ? 7 : 1
    const to = new Date(new Date(from).getTime() + days * 86400000).toISOString()

    const rows = await sb(
        `schedules?select=title,starts_at,all_day,client_name,location,kind,status` +
        `&starts_at=gte.${encodeURIComponent(from)}&starts_at=lt.${encodeURIComponent(to)}` +
        `&status=neq.취소&order=starts_at.asc&limit=50`
    )
    if (!rows.length) return ask === 'week' ? '이번 7일간 등록된 일정이 없습니다.' : '오늘 등록된 일정이 없습니다.'

    const lines = rows.map((r) => {
        const d = new Date(new Date(r.starts_at).getTime() + 9 * 3600 * 1000)
        const hhmm = r.all_day ? '종일' : `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
        const day = ask === 'week' ? `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAY[d.getUTCDay()]}) ` : ''
        return `• ${day}<b>${hhmm}</b> ${r.client_name || ''} ${r.title}${r.location ? ` @${r.location}` : ''}`
    })
    return `<b>${ask === 'week' ? '앞으로 7일' : '오늘'} 일정 ${rows.length}건</b>\n` + lines.join('\n')
}

async function saveToInbox(row) {
    await sb('telegram_inbox', { method: 'POST', prefer: 'return=minimal', body: [row] })
}

// ---------------------------------------------------------------------------
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    // 웹훅 주소는 공개 URL이다. 비밀 토큰 검증이 없으면 누구나 CRM에 데이터를 넣을 수 있다.
    // 비밀값은 봇 토큰에서 계산한다 — 사람이 정해서 두 군데에 옮겨 적을 필요가 없다.
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
        console.error('[telegram] TELEGRAM_BOT_TOKEN 없음')
        return res.status(500).json({ ok: false, error: 'BOT_TOKEN_MISSING' })
    }
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET || deriveSecret(botToken)
    if (req.headers['x-telegram-bot-api-secret-token'] !== secret) {
        console.warn('[telegram] secret token 불일치 — 거부')
        return res.status(401).json({ ok: false })
    }

    // 텔레그램은 200이 아니면 계속 재전송한다. 처리 실패도 200으로 답한다.
    const ok = () => res.status(200).json({ ok: true })

    let update = req.body
    if (typeof update === 'string') { try { update = JSON.parse(update) } catch { return ok() } }

    const msg = update?.message || update?.edited_message
    if (!msg) return ok()

    const chatId = String(msg.chat?.id || '')
    const fromName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || msg.from?.username || ''

    // ---- 허용된 사람만 ----
    // 봇 아이디는 검색되므로 이 목록이 실질적인 자물쇠다.
    // 환경변수가 있으면 그것이 우선, 없으면 bot_allowlist 테이블을 본다.
    // 목록이 비어 있으면 **처음 말을 건 사람이 주인으로 등록된다** (선착순 1회).
    // 봇을 만든 직후 바로 /start 를 보내면 안전하다.
    const envAllowed = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '').split(',').map((x) => x.trim()).filter(Boolean)
    let allowed = envAllowed

    if (allowed.length === 0) {
        let list = []
        try { list = await sb('bot_allowlist?select=chat_id') } catch (e) { console.error('[telegram] allowlist 조회 실패', e.message) }

        if (list.length === 0) {
            try {
                await sb('bot_allowlist', { method: 'POST', prefer: 'return=minimal', body: [{ chat_id: chatId, label: fromName || null }] })
                await tgSend(chatId,
                    `✅ <b>연결됐습니다.</b> 이제 이 대화만 이 봇을 쓸 수 있습니다.\n\n` +
                    `그냥 보내보세요:\n` +
                    `• <i>내일 오후 2시 한국화학 방문</i> → 달력에 등록\n` +
                    `• <i>오늘 대성드럼 김부장 미팅함</i> → 활동에 등록\n` +
                    `• ERP 화면 사진 → 읽어서 담아둠\n\n` +
                    `<b>/today</b> 오늘 일정  <b>/week</b> 이번주  <b>/help</b> 사용법`
                )
                return ok()
            } catch (e) {
                console.error('[telegram] 자동 등록 실패', e.message)
                // **RLS 거부는 조회에서 '빈 결과'로 온다.** 그래서 여기까지 와서야 드러난다 —
                // 허용 목록이 비어 보였을 뿐 실은 못 읽은 것이다.
                await tgSend(chatId, (e.denied || !HAS_SERVICE_KEY)
                    ? SETUP_HINT
                    : `등록에 실패했습니다. Supabase에서 schedules_and_inbox.sql 을 실행했는지 확인해 주세요.`)
                return ok()
            }
        }
        allowed = list.map((r) => String(r.chat_id))
    }

    if (!allowed.includes(chatId)) {
        await tgSend(chatId, '이 봇은 등록된 사용자만 쓸 수 있습니다.')
        console.warn('[telegram] 허용되지 않은 chat_id:', chatId)
        return ok()
    }

    const text = (msg.text || msg.caption || '').trim()
    const photos = msg.photo

    if (text === '/start' || text === '/help') {
        await tgSend(chatId,
            '<b>CRM 비서</b>\n\n그냥 보내세요. 알아서 갈라 넣습니다.\n\n' +
            '<b>일정</b> — "내일 오후 2시 한국화학 방문"\n   → 달력에 바로 등록\n' +
            '<b>업무기록</b> — "오늘 대성드럼 김부장 미팅, 단가 협의함"\n   → 활동에 바로 등록\n' +
            '<b>일일업무보고서 사진</b> → 활동에 등록 (영업계획은 제외)\n' +
            '<b>매출·미수금 화면 사진</b> → 받은함에 담아둠\n' +
            '   (중복 검사를 거쳐야 해서 앱에서 확인 후 반영)\n\n' +
            '<b>/today</b> 오늘 일정   <b>/week</b> 이번주 일정\n' +
            '<b>/브리핑</b> 아침 브리핑 지금 받기\n\n' +
            `chat id: <code>${chatId}</code>`
        )
        return ok()
    }
    if (text === '/today' || text === '/week') {
        try { await tgSend(chatId, await answerQuestion(text === '/week' ? 'week' : 'today')) }
        catch (e) { await tgSend(chatId, `일정을 불러오지 못했습니다: ${e.message}`) }
        return ok()
    }
    if (!text && !photos) {
        await tgSend(chatId, '사진이나 글로 보내주세요. 사용법은 /help')
        return ok()
    }

    try {
        const today = kstToday()
        // 한국 날짜 문자열의 요일 — UTC 자정으로 읽어야 하루 밀리지 않는다 (위 fmtDate 참고)
        const dow = WEEKDAY[new Date(`${today}T00:00:00Z`).getUTCDay()]

        const parts = [{ text: PROMPT(today, dow) }]
        if (text) parts.push({ text: `\n사용자 메시지:\n${text}` })
        if (photos?.length) {
            const img = await fetchPhotoBase64(photos)
            parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } })
        }

        const parsed = await callGemini(parts)
        const intent = ['schedule', 'activity', 'sales', 'receivables', 'question', 'memo'].includes(parsed.intent)
            ? parsed.intent : 'memo'
        const items = Array.isArray(parsed.items) ? parsed.items : []
        const warn = (parsed.warnings || []).slice(0, 3)

        // ---- 질문 ----
        if (intent === 'question') {
            const ask = items[0]?.ask === 'week' ? 'week' : 'today'
            await tgSend(chatId, await answerQuestion(ask))
            return ok()
        }

        // ---- 일정: 바로 등록 ----
        if (intent === 'schedule' && items.length) {
            const clientMap = await loadClients()
            const saved = await applySchedules(items, clientMap)
            await saveToInbox({
                chat_id: chatId, from_name: fromName, raw_text: text || null,
                has_image: !!photos?.length, doc_type: 'schedule',
                payload: { items, reply: parsed.reply || '' }, status: 'auto',
                applied_at: new Date().toISOString(), note: `일정 ${saved.length}건 등록`
            })

            // 제목에 이미 거래처명이 있으면 또 붙이지 않는다 ('대달산업 대달산업 방문' 방지)
            const label = (s) => {
                const t = String(s.title || '').trim()
                const c = String(s.company || s.clientName || '').trim()
                if (!c) return t
                if (!t) return c
                return t.includes(c) ? t : `${c} ${t}`
            }
            const noTime = saved.filter((s) => !s.time).length
            const lines = saved.map((s) =>
                `• ${fmtDate(s.date)} ${s.time || '종일'} ${label(s)}` +
                (s.clientName && !s.matched ? ' <i>(거래처 미등록)</i>' : '')
            )
            await tgSend(chatId,
                `📅 <b>일정 ${saved.length}건을 달력에 넣었습니다.</b>\n${lines.join('\n')}` +
                (warn.length ? `\n\n⚠️ ${warn.join('\n⚠️ ')}` : '') +
                (noTime ? `\n\n시간을 적으면 그 시각으로 들어갑니다. 예: <i>10일 오후 2시 대달산업 방문</i>` : '')
            )
            return ok()
        }

        // ---- 업무기록: 바로 등록 (중복 방지) ----
        if (intent === 'activity' && items.length) {
            const clientMap = await loadClients()
            const r = await applyActivities(items, clientMap)
            await saveToInbox({
                chat_id: chatId, from_name: fromName, raw_text: text || null,
                has_image: !!photos?.length, doc_type: 'activity',
                payload: { items, reply: parsed.reply || '' }, status: 'auto',
                applied_at: new Date().toISOString(), note: `활동 ${r.saved.length}건 등록`
            })

            let reply = `📝 <b>업무기록 ${r.saved.length}건을 넣었습니다.</b>`
            if (r.saved.length) reply += `\n${r.saved.map((n) => `• ${n}`).join('\n')}`
            if (r.skipped.length) reply += `\n\n이미 있어 건너뜀: ${r.skipped.join(', ')}`
            if (r.unmatched.length) reply += `\n\n거래처를 못 찾음: ${[...new Set(r.unmatched)].join(', ')}`
            if (warn.length) reply += `\n\n⚠️ ${warn.join('\n⚠️ ')}`
            await tgSend(chatId, reply)
            return ok()
        }

        // ---- 매출·채권: 담아두기 (대사를 거쳐야 한다) ----
        if (intent === 'sales' || intent === 'receivables') {
            await saveToInbox({
                chat_id: chatId, from_name: fromName, raw_text: text || null,
                has_image: !!photos?.length, doc_type: intent,
                payload: { rows: items, summary: parsed.reply || '', warnings: parsed.warnings || [] },
                status: 'pending'
            })
            const label = intent === 'sales' ? '매출' : '채권(미수금)'
            await tgSend(chatId,
                `📥 <b>${label} ${items.length}건으로 읽었습니다.</b>\n${parsed.reply || ''}` +
                (warn.length ? `\n\n⚠️ ${warn.join('\n⚠️ ')}` : '') +
                `\n\n중복 검사를 거쳐야 해서 바로 넣지 않았습니다.\nCRM <b>설정 &gt; 받은 항목</b>에서 확인 후 반영해 주세요.`
            )
            return ok()
        }

        // ---- 메모 ----
        await saveToInbox({
            chat_id: chatId, from_name: fromName, raw_text: text || null,
            has_image: !!photos?.length, doc_type: 'memo',
            payload: { items, reply: parsed.reply || '' }, status: 'pending'
        })
        await tgSend(chatId, `🗒 메모로 담아뒀습니다.\n${parsed.reply || ''}\n\nCRM 설정 &gt; 받은 항목에서 볼 수 있습니다.`)
        return ok()
    } catch (e) {
        console.error('[telegram] 처리 실패', e)
        // 권한에 막힌 것을 '사진이 흐려서'로 안내하면 며칠을 헤맨다. 원인을 그대로 말한다.
        await tgSend(chatId, (e.denied || !HAS_SERVICE_KEY)
            ? SETUP_HINT
            : `읽지 못했습니다: ${e.message}\n사진이면 더 크게 찍어 다시 보내주세요.`)
        return ok()
    }
}
