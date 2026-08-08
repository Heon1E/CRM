/**
 * 텔레그램 연결 — 브라우저에서 주소 한 번 열면 끝
 *
 * 텔레그램에게 "메시지가 오면 이 주소로 보내라"고 알려주는 작업(setWebhook)이다.
 * 원래는 터미널에서 스크립트를 돌려야 했는데, 그러자면 토큰을 로컬 파일에 또 넣어야 했다.
 * 서버가 이미 토큰을 알고 있으니 서버가 직접 하면 된다.
 *
 * 쓰는 법: 배포 주소 뒤에 /api/telegram-setup 을 붙여 브라우저로 연다.
 *
 * 안전한가:
 *   - 받는 값이 없다. 웹훅 주소는 **이 배포 자신**으로만 설정한다.
 *   - 남이 눌러도 원래 있어야 할 자리로 다시 맞추는 것뿐이라 무해하다.
 *   - 비밀 토큰은 봇 토큰에서 계산하므로 사람이 정하거나 옮겨 적을 필요가 없다.
 */

import { deriveSecret } from './telegram-webhook.js'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

const page = (title, bodyHtml, color = '#1C6B3C') => `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Malgun Gothic', sans-serif;
         max-width: 560px; margin: 40px auto; padding: 0 20px; line-height: 1.7; color: #1a1a1a; }
  h1 { font-size: 20px; color: ${color}; margin-bottom: 4px; }
  code { background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  ol { padding-left: 20px; } li { margin: 6px 0; }
  .box { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; padding: 14px; margin: 16px 0; }
</style></head><body>${bodyHtml}</body></html>`

export default async function handler(req, res) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')

    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) {
        return res.status(200).send(page('설정이 필요합니다', `
      <h1>아직 토큰이 없습니다</h1>
      <p>Vercel에 <code>TELEGRAM_BOT_TOKEN</code> 을 넣고 <b>다시 배포</b>한 뒤 이 주소를 새로고침하세요.</p>
      <div class="box">
        <ol>
          <li>텔레그램에서 <b>@BotFather</b> 검색 → 대화 열기</li>
          <li><code>/newbot</code> 보내기 → 이름과 아이디 정하기 (아이디는 <code>_bot</code>으로 끝나야 함)</li>
          <li>받은 토큰 복사</li>
          <li>Vercel → 프로젝트 → Settings → Environment Variables →
              이름 <code>TELEGRAM_BOT_TOKEN</code>, 값에 토큰 붙여넣기 → Save</li>
          <li>Deployments → 맨 위 항목 → ⋯ → <b>Redeploy</b></li>
          <li>이 주소를 새로고침</li>
        </ol>
      </div>`, '#B45309'))
    }

    try {
        const me = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json())
        if (!me.ok) throw new Error(me.description || '봇 정보를 가져오지 못했습니다.')

        const host = req.headers['x-forwarded-host'] || req.headers.host
        const url = `https://${host}/api/telegram-webhook`

        const set = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url,
                secret_token: deriveSecret(token),
                allowed_updates: ['message', 'edited_message'],
                max_connections: 10
            })
        }).then((r) => r.json())
        if (!set.ok) throw new Error(set.description || 'setWebhook 실패')

        return res.status(200).send(page('연결 완료', `
      <h1>연결됐습니다</h1>
      <p>봇: <b>@${esc(me.result.username)}</b></p>
      <div class="box">
        <b>이제 마지막 한 단계입니다.</b>
        <ol>
          <li>텔레그램에서 <b>@${esc(me.result.username)}</b> 을 찾아 대화를 엽니다</li>
          <li><code>/start</code> 를 보냅니다</li>
          <li>“연결됐습니다”라고 답이 오면 끝입니다</li>
        </ol>
        <p style="margin:8px 0 0;font-size:13px;color:#666">
          처음 <code>/start</code> 를 보낸 대화가 주인으로 등록되고, 그 뒤로는 잠깁니다.
          <b>지금 바로 보내세요.</b>
        </p>
      </div>
      <p style="font-size:13px;color:#666">써보기: <i>“내일 오후 2시 한국화학 방문”</i> → 대시보드 달력에 바로 뜹니다.</p>`))
    } catch (e) {
        return res.status(200).send(page('연결 실패', `
      <h1>연결하지 못했습니다</h1>
      <div class="box"><code>${esc(e.message)}</code></div>
      <p>토큰이 올바른지, 저장 후 <b>다시 배포</b>했는지 확인하고 새로고침해 주세요.</p>`, '#B91C1C'))
    }
}
