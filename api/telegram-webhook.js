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
import { nextBusinessDay } from '../src/utils/businessDay.js'
import { mergeActivityDescription } from '../src/utils/activityMerge.js'

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

/*
 * 음성 메모 / 오디오 파일을 내려받는다.
 *
 * 텔레그램의 '누르고 말하기'는 OGG/Opus로 오고, 파일로 붙이면 `.m4a` 같은 것이
 * 온다. **Gemini가 받는 형식은 정해져 있다** — `audio/ogg`는 그대로 되지만
 * `.m4a`가 달고 오는 `audio/mp4`·`audio/x-m4a`는 목록에 없어 400이 난다.
 * 담고 있는 것은 AAC이므로 그렇게 알려 준다.
 *
 * 봇 API의 `getFile`은 20MB까지만 내려준다. 그보다 앞서 우리가 막는다 —
 * 길면 판독도 오래 걸리고 함수가 시간 안에 못 끝난다. **자르지 않는다.**
 * 뒷부분이 조용히 사라지면 통화 끝에 합의한 것이 기록에서 빠진다.
 */
const AUDIO_MIME = {
    'audio/mp4': 'audio/aac', 'audio/x-m4a': 'audio/aac', 'audio/m4a': 'audio/aac',
    'audio/mpeg': 'audio/mp3', 'audio/mpeg3': 'audio/mp3', 'audio/x-wav': 'audio/wav',
    'audio/3gpp': 'audio/aac', 'audio/amr': 'audio/aac', 'audio/opus': 'audio/ogg',
}
const AUDIO_OK = new Set(['audio/ogg', 'audio/aac', 'audio/mp3', 'audio/wav', 'audio/flac', 'audio/aiff'])
const MAX_AUDIO_SEC = 900   // 15분

async function fetchAudioBase64(a) {
    const info = await fetch(TG(`getFile?file_id=${a.file_id}`)).then((r) => r.json())
    if (!info.ok) throw new Error('녹음을 가져오지 못했습니다. 20MB를 넘으면 받을 수 없습니다.')
    const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${info.result.file_path}`
    const buf = Buffer.from(await fetch(url).then((r) => r.arrayBuffer()))
    const raw = String(a.mime_type || '').split(';')[0].trim().toLowerCase()
    const mapped = AUDIO_MIME[raw] || raw
    return { data: buf.toString('base64'), mimeType: AUDIO_OK.has(mapped) ? mapped : 'audio/ogg' }
}

/*
 * 같은 것을 두 번 보냈는지 알아본다 — **내용으로 판정한다.**
 *
 * 손이 미끄러져 같은 녹음·같은 스크린샷을 두 번 보내는 일이 있다. 예전에는
 * 활동에 `(거래처, 날짜)`가 겹치면 건너뛰어 우연히 막혔는데, 이제 그런 건
 * **합치므로** 같은 내용이 '2회째'로 두 번 적힌다. 일정·매출은 아예 막는 것도
 * 없었다.
 *
 * 그래서 판독하기 **전에** 내용 지문을 보고 이미 처리한 것이면 그대로 끝낸다.
 * Gemini 호출도 건너뛰니 비용도 아낀다.
 *
 * 지문은 **파일 바이트의 해시**다. 텔레그램의 `file_unique_id`를 쓸 수도 있지만,
 * 같은 화면을 다시 캡처하면 그 id는 달라지므로 내용 자체를 본다.
 * 글은 공백을 정리한 뒤 해시한다.
 *
 * 마이그레이션은 필요 없다 — `telegram_inbox.payload.fp`에 담고
 * PostgREST의 `payload->>fp` 로 찾는다.
 */
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 32)

export const fingerprint = ({ text, blobs = [] } = {}) => {
    const parts = blobs.filter(Boolean).map(sha)
    const t = String(text || '').replace(/\s+/g, ' ').trim()
    if (t) parts.push(sha(t))
    return parts.length ? sha(parts.join('|')) : null
}

/** 이미 처리한 지문이면 그 기록을 돌려준다. */
async function findProcessed(fp) {
    if (!fp) return null
    try {
        const rows = await sb(`telegram_inbox?select=doc_type,note,created_at,status`
            + `&payload->>fp=eq.${fp}&order=created_at.desc&limit=1`)
        return rows[0] || null
    } catch (e) {
        // 지문 조회가 실패했다고 판독을 막지는 않는다 — 중복 하나가 오류보다 낫다
        console.warn('[telegram] 지문 조회 실패', e.message)
        return null
    }
}

// ---------------------------------------------------------------------------
// 판독 프롬프트 — 무엇인지 고르고, 그에 맞는 칸만 채운다
// ---------------------------------------------------------------------------
const PROMPT = (today, dow) => `
너는 한국 B2B 영업사원(드럼·IBC 용기 유통)의 CRM 비서다.
사용자가 보낸 **글·사진·녹음**을 읽거나 듣고 **아래 JSON 하나만** 출력한다.
설명 문장은 쓰지 않는다. **아래 형식을 그대로 쓴다 — 다른 칸 이름을 지어내지 마라.**
녹음만 보내는 경우가 많다. 그때도 형식은 똑같다.

오늘은 ${today} (${dow}요일) 이다. 한국 시간 기준.

**우리 회사는 '아이앤디'(IND · 아이앤디비씨 · IDIBC · 아이앤디 주식회사)다.**
드럼·IBC 용기를 만들어 파는 쪽이 우리다. 절대 거래처가 아니다 —
clientName에 넣지 마라. 우리 영업사원(이헌일·박민철·송원기)도 person이 아니다.
녹음에서 우리 쪽 사람이 먼저 자기소개를 하는 경우가 많으니 헷갈리지 마라.
**clientName·person은 언제나 상대편(고객사와 그 직원)이다.**

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
  - **description은 요약이 아니다. 통화에서 오간 것을 빠짐없이 옮긴 기록이다.**
    한두 문장으로 줄이지 마라. 5분짜리 통화를 한 줄로 적으면 나중에 그 기록만
    보고는 아무것도 할 수 없다. 오간 내용이 많으면 **1. 2. 3. 으로 번호를 매겨**
    항목별로 적는다. 통화가 길면 길게 쓴다.
    반드시 남길 것 — 들렸다면 하나도 빼지 마라:
      · 숫자는 **단위째 그대로**. 수량·단가·금액·규격(mm/리터/인치)·비중·기간·개수.
        '15만원'은 금액이지 시각이 아니다. '150 캡', '20피트', '월 10개'처럼 그대로.
      · 회사명·사람 이름·직급·부서·공장 위치.
      · 상대가 요구한 것과 우리가 답한 것을 **구분해서**. 누가 무엇을 하기로 했는지.
      · 걸림돌·불만·경쟁사 이야기·가격 저항. 잘 안 된 이야기일수록 중요하다.
      · 서로 합의한 것, 아직 확인이 필요한 것.
    들리지 않은 것은 쓰지 않는다. 지어내는 것과 빠짐없이 적는 것은 다르다.
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
- 파일명이 함께 주어지면 **거래처명·상대방 이름을 못 들었을 때만** 참고한다
  ("TalkFile_아존아시아박부장_...m4a" 같은 이름에 상대 회사가 들어 있다).
  파일명으로 통화 **내용**을 추측하지는 마라.
- **음성이 붙어 있으면 그것을 직접 듣고 들린 내용만 쓴다.** 파일명이나 길이를
  보고 내용을 추측하지 마라. 알아들을 수 없으면 items를 비우고 reply에
  "음성을 알아듣지 못했습니다"라고 적어라. 그럴듯한 요약을 만들어 채우지 마라.
- 숫자는 **단위째로** 옮긴다. '15만원'은 금액이지 시각이 아니다.
- **녹음이 상대방과 주고받은 대화(통화·미팅)이면 intent는 반드시 activity다.**
  녹음이 있다는 것 자체가 그 통화가 있었다는 증거다. 그 안에서 "다음주에 다시
  통화하시죠" 같은 약속이 나와도 schedule로 바꾸지 마라 — 그건 activity의
  nextDate·nextDetail에 넣는다. 통화한 사실을 잃어버리면 안 된다.
- 녹음이 **사용자가 비서에게 혼자 불러 주는 말**("내일 2시 한국화학 방문 잡아줘")
  이면 그때만 schedule이다. 대화가 아니라 지시다.
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
    // `sales_rep`도 받는다 — 담당이 비어 있는 곳만 채우려면 현재 값을 알아야 한다
    const rows = await sb('clients?select=id,company,sales_rep&limit=5000')
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

/**
 * 이 대화가 누구인지 — `bot_allowlist.sales_rep`.
 *
 * **왜 필요한가.** `activities.user_name`은 '누가 다녀왔는가'이고, 담당 판정의
 * 근거다. 앱에서 넣은 활동은 로그인한 사람을 넣는데, 봇으로 들어온 활동은
 * 지금까지 **비워 두고 있었다**(33건). 지금은 거래처마다 담당이 다 지정돼 있어
 * KPI 누락이 0건이지만, 담당 없는 거래처를 봇으로 처음 방문 기록하면 그
 * 거래처는 담당이 안 붙고 KPI 정기적방문횟수·영업 코치에서 빠진다.
 * 영업사원이 둘 더 늘면 '누가 다녀왔는지'도 구분해야 한다.
 *
 * **칸이 없어도 동작한다.** `bot_allowlist`에 `sales_rep`을 나중에 더했으므로
 * (`execution/sql/bot_allowlist_rep.sql`), 없으면 예전처럼 비워 둔다.
 */
async function repOfChat(chatId) {
    try {
        const rows = await sb(`bot_allowlist?select=sales_rep&chat_id=eq.${encodeURIComponent(chatId)}&limit=1`)
        return rows?.[0]?.sales_rep || null
    } catch {
        return null   // 칸이 없는 경우 등 — 업무를 막지 않는다
    }
}

/** 업무기록 -> activities (같은 거래처·같은 날은 건너뛴다) */
/*
 * **우리 회사는 거래처가 아니다.** 녹음에서 우리 쪽 사람이 먼저 자기소개를 하면
 * 모델이 그것을 거래처로 적는다 — 실제로 그랬다(clientName "IND", person
 * "이헌일 차장"). 프롬프트로 막았지만 그것만 믿을 수는 없다. 신규 등록은
 * 되돌리기 번거로우므로 **코드에서 한 번 더 막는다.**
 */
const OURS = /^(아이앤디|아이엔디|ind|idibc|아이앤디비씨)(주식회사)?$/i
const isOurCompany = (name) => OURS.test(normalizeKey(name, { removeCorp: true, removePunct: true }))

/*
 * 못 찾은 거래처를 새로 만든다.
 *
 * 예전에는 "거래처를 못 찾음: OO"이라고만 하고 활동을 버렸다. 처음 통화한
 * 곳일수록 CRM에 없는데, **바로 그 통화가 가장 남길 값어치가 있다.**
 * 판독 내용(단가·수량·다음 할 일)이 통째로 사라졌다.
 *
 * 다만 아무 이름이나 만들면 거래처 목록이 쓰레기가 된다. 셋을 막는다:
 *   - 우리 회사 (위 isOurCompany)
 *   - 두 글자 미만 — 잘못 들은 조각일 가능성이 크다
 *   - 사람 이름·'사무실' 같은 것 (NON_CLIENT_PATTERN, findClient와 같은 기준)
 * 만든 곳은 '잠재고객'으로 들어가고 답장에 그렇게 알린다 — 틀렸으면
 * 앱에서 이름을 고치거나 지우면 된다.
 */
const TITLE = '사장|대표|부장|차장|과장|대리|주임|팀장|실장|이사|상무|전무|소장|공장장|반장|기사|님|씨'
/*
 * '박부장'·'김대표'처럼 **사람을 거래처 칸에 적은 것**을 거른다.
 * 녹음에서 상대 회사를 못 듣고 이름만 들리면 모델이 그리 적는다 —
 * 그대로 만들면 거래처 목록에 사람이 쌓인다. 회사를 가리키는 말
 * (산업·화학·상사…)이 함께 있으면 회사로 본다.
 */
const looksLikePerson = (name) => {
    const t = String(name).replace(/\s+/g, '')
    if (t.length > 5) return false
    if (/(산업|화학|상사|공업|물산|테크|전자|기업|코리아|케미|드럼|아이비씨)/.test(t)) return false
    return new RegExp(`^[가-힣]{1,3}(${TITLE})$`).test(t)
}

async function createClient(name, repName) {
    const clean = String(name || '').trim()
    if (clean.length < 2) return null
    if (isOurCompany(clean)) return null
    if (looksLikePerson(clean)) return null
    if (NON_CLIENT_PATTERN.test(clean) || looksLikeMultiCompany(clean)) return null
    const rows = await sb('clients', {
        method: 'POST', prefer: 'return=representation',
        body: [{ company: clean, status: '잠재고객', sales_rep: repName || null }]
    })
    const c = Array.isArray(rows) ? rows[0] : rows
    return c ? { id: c.id, company: c.company, sales_rep: c.sales_rep } : null
}

/*
 * **날짜 없는 '다음 할 일'은 없는 것과 같다.**
 *
 * 아침 브리핑(`api/daily-digest.js`)과 달력 옆 '하기로 한 것'은 전부
 * `next_action_date`로 고른다. 그런데 통화에서는 "견적서 보내드릴게요"처럼
 * **날짜를 말하지 않고 약속하는 경우가 대부분이다.** 실측으로 그랬다 —
 * nextDetail은 '견적서 및 카탈로그 발송'인데 nextDate가 비어 있어
 * 어디에도 안 뜨는 채로 묻혔다. `next_action_date` 칸이 원래 있었는데도
 * 225건 중 7건만 채워져 아무도 안 쓰던 것과 같은 실패다.
 *
 * 그래서 날짜가 없으면 **다음 영업일**로 잡는다. 지어내는 것이 아니라
 * '언제까지'를 정하는 쪽에 가깝다 — 사람이 봇 답장에서 바로 알 수 있게
 * 무슨 날짜로 잡았는지 말해 준다. 틀리면 앱에서 고치면 된다.
 */

/*
 * 통화에서 알아낸 상대방을 **거래처 담당자로 남긴다.**
 *
 * 예전에는 활동 내용 안에 "[담당자] 박경록"으로만 적혔다. 그러면 거래처 카드와
 * 브리핑에는 연락처가 여전히 비어 있어, 만나러 가면서 '누구를 찾아야 하지'를
 * 활동 메모에서 다시 뒤져야 한다 — `extract_contacts.mjs`가 과거분을 훑어
 * 채워야 했던 것도 같은 이유다. 이제 들어올 때 바로 넣는다.
 *
 * **전화번호는 못 얻는다.** 통화 내용에 자기 번호를 부르는 사람은 없다.
 * 이름·직급만 채우고 번호는 명함이나 연락처 가져오기로 채운다.
 *
 * 조심할 것:
 *  - 이미 같은 이름이 있으면 만들지 않는다 (손으로 넣은 쪽이 더 정확하다).
 *  - 거래처당 대표는 하나라는 유니크 제약이 있다. **그 거래처에 아무도 없을
 *    때만** 대표로 세운다 — 이미 있는 대표와 부딪히면 통째로 실패한다.
 *  - 실패해도 활동 등록을 막지 않는다. 부수적인 일이 본업을 막으면 안 된다.
 */
const TITLE_TAIL = /\s*(사장|대표이사|대표|부사장|전무|상무|이사|본부장|실장|공장장|소장|팀장|부장|차장|과장|대리|주임|사원|기사|책임|수석|님)$/

async function saveContact(clientId, rawPerson) {
    const raw = String(rawPerson || '').trim().replace(/님$/, '')
    if (!raw || raw.length < 2 || raw.length > 20) return
    const m = raw.match(TITLE_TAIL)
    const role = m ? m[1] : null
    const stripped = (m ? raw.slice(0, m.index) : raw).trim()
    /*
     * 직급을 떼고 두 글자가 안 남으면 **떼지 않는다.** '김부장'이 그렇다 —
     * 성만 들린 흔한 경우인데, '김'만 남기면 아무 쓸모가 없다. 부르던 대로
     * 두는 편이 나중에 알아보기 쉽다. (`김진만 주임 이천공장`처럼 끝말이
     * 직급이 아닌 것을 떼지 않는 것과 같은 판단이다.)
     */
    const name = stripped.length >= 2 ? stripped : raw
    if (name.length < 2) return

    const dup = await sb(`client_contacts?select=id&client_id=eq.${clientId}` +
        `&name=eq.${encodeURIComponent(name)}&limit=1`)
    if (dup.length) return

    const any = await sb(`client_contacts?select=id&client_id=eq.${clientId}&limit=1`)
    await sb('client_contacts', {
        method: 'POST', prefer: 'return=minimal',
        body: [{ client_id: clientId, name, department_role: role, is_primary: any.length === 0 }]
    })
}

async function applyActivities(items, clientMap, repName = null) {
    const saved = [], skipped = [], unmatched = [], created = [], assumed = [], merged = []
    for (const it of items) {
        let c = findClient(clientMap, it.clientName)
        if (!c) {
            // 처음 통화한 곳이면 CRM에 없는 게 당연하다. 만들어서 기록을 살린다.
            try { c = await createClient(it.clientName, repName) }
            catch (e) { console.warn('[telegram] 거래처 생성 실패', e.message) }
            if (c) {
                created.push(c.company)
                keysOf(c.company).forEach((k) => { if (!clientMap.has(k)) clientMap.set(k, c) })
            }
        }
        if (!c) { unmatched.push(it.clientName || '(거래처 없음)'); continue }
        if (!it.date) { skipped.push(`${c.company} (날짜 없음)`); continue }

        /*
         * 같은 거래처·같은 날 기록이 이미 있으면 **버리지 않고 합친다.**
         * 예전에는 '이미 있어 건너뜀'으로 끝냈는데, 하루에 두세 번 통화하는
         * 일은 흔하고 **뒤의 통화일수록 결론에 가깝다**(오전 문의 -> 오후 수량 확정).
         * 그게 통째로 사라지고 있었다.
         *
         * 활동을 여러 건으로 만들지는 않는다 — KPI 정기적방문횟수가 건수를
         * 세므로 하루 세 번 통화가 방문 세 번이 되면 안 된다.
         * 기록은 합치고 횟수는 '[통화 N회]'로 따로 적는다.
         */
        const dup = await sb(
            `activities?select=id,type,description,next_action_date,next_action_detail` +
            `&client_id=eq.${c.id}&activity_date=eq.${it.date}&limit=1`
        )
        if (dup.length) {
            const m = mergeActivityDescription(dup[0].description, it, { existingType: dup[0].type })
            const patch = { description: m.description, type: m.type }
            // 다음에 할 일은 나중 것이 이긴다 (앞의 것은 이미 지나갔을 수 있다)
            if (it.nextDetail) {
                patch.next_action_detail = it.nextDetail
                patch.next_action_date = /^\d{4}-\d{2}-\d{2}$/.test(it.nextDate || '')
                    ? it.nextDate : (nextBusinessDay(it.date) || dup[0].next_action_date)
            }
            await sb(`activities?id=eq.${dup[0].id}`, { method: 'PATCH', prefer: 'return=minimal', body: patch })
            if (it.person) { try { await saveContact(c.id, it.person) } catch { /* 부수적인 일이 본업을 막지 않는다 */ } }
            merged.push(`${c.company} ${fmtDate(it.date)} ${m.count}회째`)
            continue
        }

        // 하기로 한 일은 있는데 날짜를 안 말한 경우 -> 다음 영업일로 잡는다
        const said = /^\d{4}-\d{2}-\d{2}$/.test(it.nextDate || '') ? it.nextDate : null
        const dueDate = said || (it.nextDetail ? nextBusinessDay(it.date) : null)
        if (!said && dueDate) assumed.push(`${c.company} ${fmtDate(dueDate)}`)

        await sb('activities', {
            method: 'POST', prefer: 'return=minimal',
            body: [{
                client_id: c.id,
                client_name: c.company,
                activity_date: it.date,
                // 유선은 방문이 아니다. KPI 정기적방문횟수는 미팅/방문만 센다.
                type: it.kind === '전화' ? '전화' : '미팅',
                status: '완료',
                // 누가 다녀왔는가 (상대측 참석자가 아니다 — 그쪽은 아래 [담당자]로 들어간다)
                user_name: repName,
                description: [it.person ? `[담당자] ${it.person}` : '', it.description || ''].filter(Boolean).join('\n'),
                // '다음에 할 일'이 적혀 있으면 같이 담는다. 이게 아침 브리핑의 재료다.
                next_action_date: dueDate,
                next_action_detail: it.nextDetail || null
            }]
        })
        /*
         * 다녀온 곳은 내 담당이다 — 담당이 비어 있으면 채운다.
         * 앱(`DataContext.addActivity`)과 같은 규칙이다. 이미 담당이 있으면
         * 건드리지 않는다(`sales_rep=is.null` 조건이 그 역할을 한다).
         */
        if (repName && !c.sales_rep) {
            try {
                await sb(`clients?id=eq.${c.id}&sales_rep=is.null`, {
                    method: 'PATCH', prefer: 'return=minimal', body: { sales_rep: repName }
                })
            } catch (e) { console.warn('[telegram] 담당 자동 지정 실패', e.message) }
        }
        // 통화에서 알아낸 상대방을 담당자로 남긴다 (실패해도 활동은 이미 들어갔다)
        if (it.person) {
            try { await saveContact(c.id, it.person) }
            catch (e) { console.warn('[telegram] 담당자 저장 실패', e.message) }
        }
        saved.push(c.company)
    }
    return { saved, skipped, unmatched, created, assumed, merged }
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
        /*
         * **거부만 하고 끝내면 기기를 늘릴 길이 없다.**
         * 영업용 폰처럼 텔레그램 계정이 다른 기기는 chat_id가 달라 여기로 떨어지는데,
         * 예전에는 '등록된 사용자만 쓸 수 있습니다' 한 줄이라 자기 id조차 알 수 없었다.
         * 관리자도 그 번호를 모르니 목록에 넣어 줄 수가 없다 — 막다른 길이었다.
         *
         * chat_id를 알려 주는 것은 위험하지 않다. 그 대화를 이미 쥔 사람만 보고,
         * **넣어 주는 것은 여전히 등록된 기기에서만** 할 수 있다.
         */
        await tgSend(chatId,
            '이 봇은 등록된 기기만 쓸 수 있습니다.\n\n'
            + `이 대화의 id: <code>${chatId}</code>\n\n`
            + '이미 쓰고 있는 기기에서 아래를 보내면 여기도 열립니다:\n'
            + `<code>/기기추가 ${chatId}</code>`
        )
        console.warn('[telegram] 허용되지 않은 chat_id:', chatId)
        return ok()
    }

    const text = (msg.text || msg.caption || '').trim()
    const photos = msg.photo
    // '누르고 말하기'(voice)와 파일로 붙인 오디오(audio) 둘 다 받는다.
    const audio = msg.voice || msg.audio || null

    if (text === '/start' || text === '/help') {
        await tgSend(chatId,
            '<b>CRM 비서</b>\n\n그냥 보내세요. 알아서 갈라 넣습니다.\n\n' +
            '<b>일정</b> — "내일 오후 2시 한국화학 방문"\n   → 달력에 바로 등록\n' +
            '<b>업무기록</b> — "오늘 대성드럼 김부장 미팅, 단가 협의함"\n   → 활동에 바로 등록\n' +
            '<b>녹음</b> — 통화 녹음을 보내거나 마이크를 눌러 말하세요\n' +
            '   → 들은 내용으로 활동에 등록 (최대 15분)\n' +
            '<b>일일업무보고서 사진</b> → 활동에 등록 (영업계획은 제외)\n' +
            '<b>매출·미수금 화면 사진</b> → 받은함에 담아둠\n' +
            '   (중복 검사를 거쳐야 해서 앱에서 확인 후 반영)\n\n' +
            '<b>/today</b> 오늘 일정   <b>/week</b> 이번주 일정\n' +
            '<b>/브리핑</b> 아침 브리핑 지금 받기\n\n' +
            '<b>/기기목록</b> 등록된 기기   <b>/기기추가 &lt;id&gt;</b> 다른 폰 열기\n\n' +
            `chat id: <code>${chatId}</code>`
        )
        return ok()
    }
    if (text === '/today' || text === '/week') {
        try { await tgSend(chatId, await answerQuestion(text === '/week' ? 'week' : 'today')) }
        catch (e) { await tgSend(chatId, `일정을 불러오지 못했습니다: ${e.message}`) }
        return ok()
    }
    /*
     * 기기(대화) 관리 — **여기까지 온 대화는 이미 허용된 것이다.**
     * 그래서 등록된 기기에서만 다른 기기를 열어 줄 수 있다. 영업용 폰처럼
     * 텔레그램 계정이 다른 기기는 chat_id가 달라 따로 넣어야 한다.
     */
    if (text.startsWith('/기기')) {
        const [cmd, arg] = text.split(/\s+/)
        try {
            if (cmd === '/기기목록') {
                const rows = await sb('bot_allowlist?select=chat_id,label,sales_rep&order=created_at')
                await tgSend(chatId,
                    `📱 <b>등록된 기기 ${rows.length}대</b>\n`
                    + rows.map((r) => `• <code>${r.chat_id}</code> ${r.label || ''}`
                        + `${r.sales_rep ? ` (${r.sales_rep})` : ''}`
                        + `${String(r.chat_id) === chatId ? ' ← 지금 이 기기' : ''}`).join('\n')
                    + '\n\n추가: <code>/기기추가 &lt;id&gt;</code>   삭제: <code>/기기삭제 &lt;id&gt;</code>'
                )
                return ok()
            }
            if (cmd === '/기기추가') {
                if (!/^-?\d+$/.test(arg || '')) {
                    await tgSend(chatId, '기기 id를 같이 보내주세요. 예: <code>/기기추가 123456789</code>\n'
                        + '(새 기기에서 봇에게 아무 말이나 보내면 그 id를 알려줍니다.)')
                    return ok()
                }
                const dup = await sb(`bot_allowlist?select=chat_id&chat_id=eq.${encodeURIComponent(arg)}&limit=1`)
                if (dup.length) { await tgSend(chatId, '이미 등록된 기기입니다.'); return ok() }
                // 담당자는 지금 이 기기 것을 물려준다 — 같은 사람의 다른 폰이기 때문이다
                const rep = await repOfChat(chatId)
                await sb('bot_allowlist', {
                    method: 'POST', prefer: 'return=minimal',
                    body: [{ chat_id: String(arg), label: '추가 기기', sales_rep: rep }]
                })
                await tgSend(chatId, `✅ 기기를 추가했습니다: <code>${arg}</code>${rep ? ` (담당 ${rep})` : ''}`)
                await tgSend(String(arg), '✅ <b>연결됐습니다.</b> 이제 이 기기에서도 쓸 수 있습니다.\n사용법은 /help')
                return ok()
            }
            if (cmd === '/기기삭제') {
                // 마지막 기기를 지우면 아무도 못 들어온다. 그때는 SQL로만 되살릴 수 있다.
                const rows = await sb('bot_allowlist?select=chat_id')
                if (rows.length <= 1) { await tgSend(chatId, '마지막 기기는 지울 수 없습니다.'); return ok() }
                if (!rows.some((r) => String(r.chat_id) === String(arg))) {
                    await tgSend(chatId, '그런 기기가 없습니다. <code>/기기목록</code>으로 확인하세요.')
                    return ok()
                }
                await sb(`bot_allowlist?chat_id=eq.${encodeURIComponent(arg)}`, { method: 'DELETE', prefer: 'return=minimal' })
                await tgSend(chatId, `🗑 기기를 지웠습니다: <code>${arg}</code>`)
                return ok()
            }
        } catch (e) {
            console.error('[telegram] 기기 관리 실패', e.message)
            await tgSend(chatId, e.denied || !HAS_SERVICE_KEY ? SETUP_HINT : `처리하지 못했습니다: ${e.message}`)
            return ok()
        }
    }
    if (!text && !photos && !audio) {
        await tgSend(chatId, '사진·녹음·글로 보내주세요. 사용법은 /help')
        return ok()
    }

    try {
        const today = kstToday()
        // 한국 날짜 문자열의 요일 — UTC 자정으로 읽어야 하루 밀리지 않는다 (위 fmtDate 참고)
        const dow = WEEKDAY[new Date(`${today}T00:00:00Z`).getUTCDay()]

        const parts = [{ text: PROMPT(today, dow) }]
        const blobs = []   // 내용 지문용 (같은 것을 두 번 보냈는지 본다)
        if (text) parts.push({ text: `\n사용자 메시지:\n${text}` })
        if (photos?.length) {
            const img = await fetchPhotoBase64(photos)
            blobs.push(img.data)
            parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } })
        }
        if (audio) {
            if (Number(audio.duration || 0) > MAX_AUDIO_SEC) {
                await tgSend(chatId, `녹음이 너무 깁니다 (${Math.round(audio.duration / 60)}분). 15분까지 받습니다 — 나눠서 보내주세요.`)
                return ok()
            }
            await tgSend(chatId, '녹음을 듣고 있습니다…')
            /*
             * **파일명을 같이 준다.** 통화 녹음 파일명에는 상대 회사·사람이
             * 들어 있는 경우가 많다(`TalkFile_아존아시아박부장_...m4a`).
             * 실제로 이것을 안 줬더니 모델이 우리 쪽 사람의 자기소개를 듣고
             * 거래처를 '아이앤디'(우리 회사)로 적었다.
             */
            if (audio.file_name) parts.push({ text: `
녹음 파일명: ${audio.file_name}` })
            const snd = await fetchAudioBase64(audio)
            blobs.push(snd.data)
            parts.push({ inlineData: { data: snd.data, mimeType: snd.mimeType } })
        }

        /*
         * **판독하기 전에** 같은 것을 이미 처리했는지 본다. 여기서 끊으면
         * Gemini 호출도 하지 않는다. 손이 미끄러져 두 번 보낸 것을 두 번
         * 기록하는 것보다, 두 번째는 알려 주고 마는 편이 낫다.
         */
        const fp = fingerprint({ text, blobs })
        const already = await findProcessed(fp)
        if (already) {
            const what = { schedule: '일정', activity: '업무기록', sales: '매출', receivables: '채권', memo: '메모' }
            await tgSend(chatId,
                '↩️ <b>이미 처리한 내용입니다.</b> 그대로 두었습니다.\n'
                + `${fmtDate(String(already.created_at).slice(0, 10))}에 `
                + `${what[already.doc_type] || already.doc_type}으로 넣었습니다`
                + `${already.note ? ` — ${already.note}` : ''}.`
            )
            return ok()
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
                chat_id: chatId, from_name: fromName, raw_text: text || (audio ? '[녹음]' : null),
                has_image: !!photos?.length, doc_type: 'schedule',
                payload: { fp, items, reply: parsed.reply || '' }, status: 'auto',
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
            const r = await applyActivities(items, clientMap, await repOfChat(chatId))
            await saveToInbox({
                chat_id: chatId, from_name: fromName, raw_text: text || (audio ? '[녹음]' : null),
                has_image: !!photos?.length, doc_type: 'activity',
                payload: { fp, items, reply: parsed.reply || '' }, status: 'auto',
                applied_at: new Date().toISOString(), note: `활동 ${r.saved.length}건 등록`
            })

            let reply = `📝 <b>업무기록 ${r.saved.length}건을 넣었습니다.</b>`
            if (r.saved.length) reply += `\n${r.saved.map((n) => `• ${n}`).join('\n')}`
            if (r.merged.length) reply += `\n\n🔗 <b>같은 날 기록에 합쳤습니다:</b> ${r.merged.join(', ')}`
            // 이제 중복은 합치므로, 여기 남는 것은 날짜를 못 읽은 건뿐이다
            if (r.skipped.length) reply += `\n\n건너뜀: ${r.skipped.join(', ')}`
            if (r.created.length) reply += `\n\n🆕 <b>새 거래처로 등록:</b> ${[...new Set(r.created)].join(', ')}\n<i>이름이 틀렸으면 앱에서 고치거나 지워주세요.</i>`
            // 날짜를 말하지 않은 약속은 다음 영업일로 잡았다. 그 사실을 밝힌다.
            if (r.assumed.length) reply += `\n\n⏰ <b>하기로 한 일 기한:</b> ${r.assumed.join(', ')}\n<i>날짜를 안 말씀하셔서 다음 영업일로 잡았습니다. 아침 브리핑에 뜹니다.</i>`
            if (r.unmatched.length) reply += `\n\n거래처를 못 찾음: ${[...new Set(r.unmatched)].join(', ')}`
            if (warn.length) reply += `\n\n⚠️ ${warn.join('\n⚠️ ')}`
            await tgSend(chatId, reply)
            return ok()
        }

        // ---- 매출·채권: 담아두기 (대사를 거쳐야 한다) ----
        if (intent === 'sales' || intent === 'receivables') {
            await saveToInbox({
                chat_id: chatId, from_name: fromName, raw_text: text || (audio ? '[녹음]' : null),
                has_image: !!photos?.length, doc_type: intent,
                payload: { fp, rows: items, summary: parsed.reply || '', warnings: parsed.warnings || [] },
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

        /*
         * 녹음을 보냈는데 아무것도 못 뽑았으면 **그렇게 말한다.**
         * '메모로 담아뒀습니다'라고 하면 잘 된 줄 알고 넘어가고, 정작 활동은
         * 비어 있다. 판독이 지어내지 않도록 막아 둔 만큼 결과도 정확히 알린다.
         */
        if (audio && !items.length) {
            await tgSend(chatId,
                '🎧 <b>녹음을 알아듣지 못했습니다.</b>\n' +
                (parsed.reply ? `${parsed.reply}\n` : '') +
                '\n조용하거나 잡음이 많으면 놓칩니다. 글로 적어 보내주시면 그대로 넣겠습니다.'
            )
            return ok()
        }

        // ---- 메모 ----
        await saveToInbox({
            chat_id: chatId, from_name: fromName, raw_text: text || (audio ? '[녹음]' : null),
            has_image: !!photos?.length, doc_type: 'memo',
            payload: { fp, items, reply: parsed.reply || '' }, status: 'pending'
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
