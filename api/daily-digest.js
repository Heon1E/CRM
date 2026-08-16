/**
 * 아침 브리핑 — 오늘 챙길 것을 텔레그램으로 보낸다
 *
 * 후속조치일을 적어둬도 어디서도 알려주지 않으면 결국 안 쓴다(225건 중 7건이었다).
 * 분석이 아무리 좋아도 **다음 행동을 잊지 않게 하는 장치**가 없으면 놓친다.
 * 매일 아침 한 번, 오늘 할 일을 먼저 들이민다.
 *
 * 보내는 것:
 *   1. 오늘 일정 (schedules)
 *   +  이번 주 마감 예정 기회 · 멈춘 기회 (deals)
 *   2. 오늘 마감인 후속조치
 *   3. 기한이 지난 후속조치 (오래 밀린 것부터)
 *   4. 오래 방치된 거래처 경고 (과거 실적이 있는데 접촉이 끊긴 곳)
 *
 * 호출 경로:
 *   - Vercel Cron (vercel.json). 한국시간 07:00 = UTC 22:00
 *   - 손으로 확인할 때: /api/daily-digest?key=<봇토큰에서 만든 값>
 *
 * 받는 사람은 bot_allowlist에 등록된 대화다 (봇을 처음 쓴 그 대화).
 */

import { deriveSecret } from './telegram-webhook.js'

export const config = { maxDuration: 60 }

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
// RLS를 닫은 뒤로 anon 키로는 아무것도 못 읽고 못 쓴다 (execution/sql/auth_and_roles.sql).
// 서비스 롤 키가 없으면 조용히 실패하는 대신 눈에 띄게 알린다 — 봇이 말없이
// 죽어 있으면 며칠 뒤에야 알게 된다.
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[설정 필요] SUPABASE_SERVICE_ROLE_KEY 가 없습니다. '
        + 'RLS가 닫혀 있어 anon 키로는 동작하지 않습니다. '
        + 'Vercel 환경변수에 넣어 주세요 (VITE_ 접두어 없이).')
}
const DAY = 86_400_000
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

/** 서버는 UTC로 돈다. 한국 날짜를 기준으로 판단해야 '오늘'이 맞다. */
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)

const sb = async (path) => {
    const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
        headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
    })
    if (!res.ok) throw new Error(`${path} ${res.status}: ${(await res.text()).slice(0, 160)}`)
    return res.json()
}

const tgSend = async (chatId, text) => {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })
    })
}

const fmtMan = (v) => `${Math.round((Number(v) || 0) / 10000).toLocaleString('ko-KR')}만원`

/**
 * Vercel Cron이 부른 것인가.
 *
 * **예전에는 `x-vercel-cron` 헤더 하나만 봤다.** 크론이 실제로 불러도 401로
 * 막혀 **아무 일도 안 일어났다** — 8/12에 설정하고 나흘 동안 브리핑이 한 번도
 * 오지 않은 원인이다. 401은 조용해서 밖에서는 알 수가 없다.
 *
 * Vercel이 남기는 표시가 하나가 아니다. 셋 다 본다:
 *   - `x-vercel-cron` 헤더
 *   - `User-Agent: vercel-cron/1.0`
 *   - `CRON_SECRET`을 넣어 두면 `Authorization: Bearer <값>`
 * 하나라도 맞으면 크론으로 본다. 표시가 바뀌어도 나머지가 받쳐 준다.
 */
const isVercelCron = (req) => {
    if (req.headers['x-vercel-cron']) return true
    if (/vercel-cron/i.test(String(req.headers['user-agent'] || ''))) return true
    const secret = process.env.CRON_SECRET
    if (secret && req.headers.authorization === `Bearer ${secret}`) return true
    return false
}

/**
 * 오늘의 브리핑 글을 만든다. **보내지는 않는다** — 부르는 쪽이 보낸다.
 * 크론과 텔레그램 `/브리핑` 명령이 같은 글을 쓰게 하려고 떼어 놓았다.
 */
export async function buildDigest() {
    {
        const today = kstToday()
        const dow = WEEKDAY[new Date(`${today}T00:00:00+09:00`).getUTCDay()]

        const chats = await sb('bot_allowlist?select=chat_id')

        // ---- 자료 ----
        // deals는 아직 안 만들었을 수 있다(마이그레이션 전). 실패해도 브리핑은 나가야 한다.
        // 단계는 한글이라 URL에 넣으면 인코딩 문제가 생기기 쉽다. 받아서 여기서 거른다.
        const dealsP = sb('deals?select=id,client_name,title,stage,amount,expected_close,'
            + 'stage_changed_at,created_at,owner&deleted_at=is.null&limit=500')
            .catch(() => [])

        const [clients, activities, schedules] = await Promise.all([
            sb('clients?select=id,company,sales_rep&limit=5000'),
            // 후속조치 판정에 과거 접촉 이력이 필요하다. 1년치면 충분하다.
            sb(`activities?select=id,client_id,activity_date,next_action_date,next_action_detail` +
                `&activity_date=gte.${new Date(Date.now() - 400 * DAY).toISOString().slice(0, 10)}&limit=5000`),
            sb(`schedules?select=title,client_name,starts_at,all_day,location,kind,status` +
                `&starts_at=gte.${encodeURIComponent(`${today}T00:00:00+09:00`)}` +
                `&starts_at=lt.${encodeURIComponent(`${today}T23:59:59+09:00`)}` +
                `&status=neq.취소&order=starts_at.asc&limit=50`),
        ])

        const OPEN = ['리드', '접촉', '제안', '샘플', '협상']
        const deals = (await dealsP).filter((d) => OPEN.includes(d.stage))

        const nameOf = new Map(clients.map((c) => [c.id, c.company]))

        // ---- 파이프라인 ----
        // 아침에 알아야 할 건 두 가지다: 이번 주에 떨어질 것, 그리고 멈춰 있는 것.
        const weekEnd = new Date(new Date(`${today}T00:00:00+09:00`).getTime() + 7 * DAY)
            .toISOString().slice(0, 10)
        const closingSoon = deals
            .filter((d) => d.expected_close && d.expected_close <= weekEnd)
            .sort((a2, b2) => String(a2.expected_close).localeCompare(String(b2.expected_close)))

        // 정체 기준은 단계마다 다르다. 샘플은 원래 오래 걸린다 —
        // 똑같이 두면 샘플 건이 전부 떠서 경고가 의미를 잃는다.
        const STALE = { 리드: 21, 접촉: 21, 제안: 30, 샘플: 60, 협상: 21 }
        const stuck = deals
            .filter((d) => {
                const since = d.stage_changed_at || d.created_at
                if (!since) return false
                const days = Math.floor((Date.now() - new Date(since).getTime()) / DAY)
                return days > (STALE[d.stage] ?? 30)
            })
            .map((d) => ({
                ...d,
                days: Math.floor((Date.now() - new Date(d.stage_changed_at || d.created_at).getTime()) / DAY),
            }))
            .sort((a2, b2) => b2.days - a2.days)

        // ---- 후속조치 ----
        // 기한일 이후에 그 거래처와 접촉했으면 처리된 것으로 본다.
        const contacted = new Map()
        activities.forEach((a) => {
            if (!a.client_id || !a.activity_date) return
            if (!contacted.has(a.client_id)) contacted.set(a.client_id, [])
            contacted.get(a.client_id).push(String(a.activity_date).slice(0, 10))
        })

        const overdue = [], due = []
        activities.forEach((a) => {
            const d = String(a.next_action_date || '').slice(0, 10)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !a.client_id) return
            if ((contacted.get(a.client_id) || []).some((x) => x >= d)) return
            const row = { name: nameOf.get(a.client_id) || '(이름 없음)', due: d, detail: String(a.next_action_detail || '').trim() }
            if (d < today) overdue.push(row)
            else if (d === today) due.push(row)
        })
        overdue.sort((a, b) => a.due.localeCompare(b.due))

        // ---- 오래 방치된 거래처 (과거 실적 있는데 접촉이 끊긴 곳) ----
        const lastContact = new Map()
        activities.forEach((a) => {
            const d = String(a.activity_date || '').slice(0, 10)
            if (!a.client_id || !d) return
            if (d > (lastContact.get(a.client_id) || '')) lastContact.set(a.client_id, d)
        })
        const cutoff = new Date(Date.now() - 120 * DAY).toISOString().slice(0, 10)
        const stale = clients
            .filter((c) => c.sales_rep && lastContact.has(c.id) && lastContact.get(c.id) < cutoff)
            .map((c) => ({ name: c.company, last: lastContact.get(c.id) }))
            .sort((a, b) => a.last.localeCompare(b.last))
            .slice(0, 3)

        // ---- 메시지 ----
        const lines = [`☀️ <b>${today.slice(5).replace('-', '/')}(${dow}) 오늘 할 일</b>`]

        if (schedules.length) {
            lines.push('', `📅 <b>일정 ${schedules.length}건</b>`)
            schedules.forEach((s) => {
                const t = new Date(new Date(s.starts_at).getTime() + 9 * 3600 * 1000)
                const hhmm = s.all_day ? '종일' : `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`
                lines.push(`• <b>${hhmm}</b> ${s.client_name || ''} ${s.title}${s.location ? ` @${s.location}` : ''}`)
            })
        }

        if (due.length) {
            lines.push('', `✅ <b>오늘 하기로 한 것 ${due.length}건</b>`)
            due.forEach((r) => lines.push(`• ${r.name}${r.detail ? ` — ${r.detail}` : ''}`))
        }

        if (overdue.length) {
            lines.push('', `⚠️ <b>기한 지난 후속조치 ${overdue.length}건</b>`)
            overdue.slice(0, 6).forEach((r) => {
                const late = Math.round((new Date(`${today}T00:00:00`) - new Date(`${r.due}T00:00:00`)) / DAY)
                lines.push(`• ${r.name} (${late}일 지남)${r.detail ? ` — ${r.detail}` : ''}`)
            })
            if (overdue.length > 6) lines.push(`  … 외 ${overdue.length - 6}건`)
        }

        if (closingSoon.length) {
            lines.push('', `🎯 <b>이번 주 마감 예정 ${closingSoon.length}건</b>`)
            closingSoon.slice(0, 6).forEach((d) => {
                const late = d.expected_close < today ? ' ⚠️기한 지남' : ''
                lines.push(`• ${d.client_name} — ${d.title} (${d.stage}, ${fmtMan(d.amount)})${late}`)
            })
            if (closingSoon.length > 6) lines.push(`  … 외 ${closingSoon.length - 6}건`)
        }

        if (stuck.length) {
            lines.push('', `🐢 <b>멈춘 기회 ${stuck.length}건</b>`)
            stuck.slice(0, 5).forEach((d) => {
                lines.push(`• ${d.client_name} — ${d.title} (${d.stage} ${d.days}일째)`)
            })
            if (stuck.length > 5) lines.push(`  … 외 ${stuck.length - 5}건`)
        }

        if (stale.length) {
            lines.push('', `🕸 <b>오래 못 간 곳</b>`)
            stale.forEach((s) => lines.push(`• ${s.name} — 마지막 접촉 ${s.last}`))
        }

        if (schedules.length + due.length + overdue.length + closingSoon.length + stuck.length === 0) {
            lines.push('', '오늘 잡힌 일정도, 하기로 한 것도 없습니다.')
            lines.push('CRM 영업 코치에서 챙길 곳을 확인해 보세요.')
        }

        lines.push('', '<i>일정은 여기로 보내면 바로 등록됩니다. 예: 내일 오후 2시 한국화학 방문</i>')

        return {
            text: lines.join('\n'),
            chats: chats.map((c) => String(c.chat_id)),
            counts: {
                schedules: schedules.length, due: due.length, overdue: overdue.length,
                closingSoon: closingSoon.length, stuck: stuck.length, stale: stale.length,
            },
        }
    }
}

export default async function handler(req, res) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) return res.status(500).json({ error: 'BOT_TOKEN_MISSING' })

    const cron = isVercelCron(req)
    const key = (req.query?.key) || new URL(req.url, 'http://x').searchParams.get('key')
    if (!cron && key !== deriveSecret(botToken)) {
        // 막을 때 이유를 남긴다. 예전에는 조용히 401만 내서 크론이 막힌 줄도 몰랐다.
        console.warn('[daily-digest] 거절 — ua:', req.headers['user-agent'],
            '/ x-vercel-cron:', req.headers['x-vercel-cron'])
        return res.status(401).json({ ok: false })
    }

    try {
        const { text, chats, counts } = await buildDigest()
        if (!chats.length) return res.status(200).json({ ok: true, sent: 0, note: '등록된 대화 없음' })
        for (const c of chats) await tgSend(c, text)
        console.log('[daily-digest] 보냄', { cron, sent: chats.length, counts })
        return res.status(200).json({ ok: true, sent: chats.length, counts })
    } catch (e) {
        console.error('[daily-digest] 실패', e)
        return res.status(500).json({ error: 'SERVER_ERROR', message: e.message })
    }
}
