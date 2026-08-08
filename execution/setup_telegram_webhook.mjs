/**
 * 텔레그램 봇 웹훅 등록/확인
 *
 * 텔레그램에게 "메시지가 오면 이 주소로 보내라"고 알려주는 작업이다. 한 번만 하면 된다.
 * 토큰은 .env.local에서 읽는다. 화면에 찍지 않는다.
 *
 * 준비:
 *   .env.local 에 아래 두 줄을 넣어둔다 (커밋되지 않는 파일이다)
 *     TELEGRAM_BOT_TOKEN=BotFather가_준_토큰
 *     TELEGRAM_WEBHOOK_SECRET=아무거나_긴_문자열
 *
 * 사용법:
 *   node execution/setup_telegram_webhook.mjs --info
 *       지금 어떻게 연결돼 있는지 확인 (아무것도 바꾸지 않음)
 *
 *   node execution/setup_telegram_webhook.mjs --url https://내주소.vercel.app
 *       웹훅 등록
 *
 *   node execution/setup_telegram_webhook.mjs --delete
 *       연결 해제
 */

import fs from 'fs'
import path from 'path'

const loadEnv = () => {
    const out = {}
    for (const file of ['.env.local', '.env']) {
        const p = path.resolve(process.cwd(), file)
        if (!fs.existsSync(p)) continue
        fs.readFileSync(p, 'utf8').split('\n')
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith('#'))
            .forEach((l) => {
                const i = l.indexOf('=')
                if (i === -1) return
                const k = l.slice(0, i)
                if (!(k in out)) out[k] = l.slice(i + 1).replace(/^["']|["']$/g, '')
            })
    }
    return { ...out, ...process.env }
}

const env = loadEnv()
const TOKEN = env.TELEGRAM_BOT_TOKEN
const SECRET = env.TELEGRAM_WEBHOOK_SECRET

if (!TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN이 없습니다. .env.local에 넣어 주세요.')
    console.error('(텔레그램에서 @BotFather 에게 /newbot 을 보내면 토큰을 줍니다)')
    process.exit(1)
}

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const val = (f) => { const i = args.indexOf(f); return i === -1 ? null : args[i + 1] }

const api = async (method, body) => {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.description || `${method} 실패`)
    return data.result
}

const me = await api('getMe')
console.log(`봇: @${me.username} (${me.first_name})\n`)

if (has('--delete')) {
    await api('deleteWebhook', { drop_pending_updates: false })
    console.log('웹훅 연결을 해제했습니다.')
    process.exit(0)
}

const url = val('--url')

if (!url || has('--info')) {
    const info = await api('getWebhookInfo')
    console.log('현재 웹훅 상태')
    console.log('─'.repeat(60))
    console.log(`  주소            : ${info.url || '(연결 안 됨)'}`)
    console.log(`  비밀토큰 사용   : ${info.has_custom_certificate ? 'n/a' : (info.url ? '설정됨(추정)' : '-')}`)
    console.log(`  대기 중 메시지  : ${info.pending_update_count ?? 0}`)
    if (info.last_error_message) {
        console.log(`  마지막 오류     : ${info.last_error_message}`)
        console.log(`  발생 시각       : ${new Date((info.last_error_date || 0) * 1000).toLocaleString('ko-KR')}`)
    }
    console.log('─'.repeat(60))
    if (!url) {
        console.log('\n등록하려면: node execution/setup_telegram_webhook.mjs --url https://내주소.vercel.app')
    }
    process.exit(0)
}

// 비밀값은 봇 토큰에서 계산한다 (서버도 같은 방식으로 만든다).
// 사람이 정해서 두 군데에 옮겨 적을 필요가 없다.
const { createHash } = await import('crypto')
const SECRET_VALUE = SECRET || createHash('sha256').update(`xavian-crm:${TOKEN}`).digest('hex')

const endpoint = `${url.replace(/\/$/, '')}/api/telegram-webhook`
await api('setWebhook', {
    url: endpoint,
    secret_token: SECRET_VALUE,
    allowed_updates: ['message', 'edited_message'],
    max_connections: 10
})

console.log(`웹훅을 등록했습니다:\n  ${endpoint}\n`)
console.log(`이제 텔레그램에서 @${me.username} 에게 /start 를 보내면 끝입니다.`)
console.log('(처음 /start 를 보낸 대화가 주인으로 등록됩니다)')
