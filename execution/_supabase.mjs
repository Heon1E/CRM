/**
 * execution/ 스크립트 공용 Supabase 접속
 *
 * **RLS를 닫은 뒤로 anon 키로는 아무것도 읽지 못한다.** 그런데 RLS 거부는
 * 오류가 아니라 **빈 결과**로 온다. 그래서 스크립트가 "고칠 게 없습니다"라고
 * 조용히 끝나 버린다 — 가장 위험한 실패 방식이다. 아무 일도 안 했는데
 * 다 된 것처럼 보인다.
 *
 * 그래서 여기서 두 가지를 한다:
 *   1. `SUPABASE_SERVICE_ROLE_KEY`가 있으면 그것을 쓴다 (RLS를 우회한다).
 *   2. 없으면 실제로 읽히는지 찔러 보고, 안 읽히면 **바로 멈춘다.**
 *
 * 서비스 롤 키는 `.env.local`에 넣는다 (`.gitignore` 대상):
 *
 *     SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 * Supabase > Project Settings > API > service_role 값이다.
 * **`VITE_` 접두어를 붙이면 안 된다** — 붙이면 브라우저 번들에 박혀 배포된다.
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

export const loadEnv = () => {
    const out = {}
    // .env.local이 .env를 덮어쓴다 (Vite와 같은 순서)
    for (const file of ['.env', '.env.local']) {
        const p = path.resolve(process.cwd(), file)
        if (!fs.existsSync(p)) continue
        for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
            const s = line.trim()
            if (!s || s.startsWith('#')) continue
            const i = s.indexOf('=')
            if (i > 0) out[s.slice(0, i)] = s.slice(i + 1).replace(/^["']|["']$/g, '')
        }
    }
    if (!out.VITE_SUPABASE_URL) {
        throw new Error('.env.local 또는 .env에서 VITE_SUPABASE_URL을 찾지 못했습니다.')
    }
    return out
}

/**
 * 접속을 만들고 **실제로 읽히는지 확인한다.**
 *
 * @param {object} [opt]
 * @param {boolean} [opt.write]  쓰기까지 하는 스크립트면 true — 안내 문구가 달라진다
 * @param {string}  [opt.probe]  읽히는지 확인할 표 (기본 clients)
 */
export const connect = async ({ write = false, probe = 'clients' } = {}) => {
    const env = loadEnv()
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = env.VITE_SUPABASE_ANON_KEY
    const key = serviceKey || anonKey

    if (!key) throw new Error('Supabase 키를 찾지 못했습니다 (.env.local 확인).')

    const supabase = createClient(env.VITE_SUPABASE_URL, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    })

    // 읽히는지 찔러 본다. RLS에 막히면 오류가 아니라 0행으로 오므로 개수를 센다.
    const { count, error } = await supabase
        .from(probe).select('id', { count: 'exact', head: true })

    if (error) {
        throw new Error(`${probe} 조회 실패: ${error.message}`)
    }

    if (!count) {
        console.error(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ${probe} 를 한 행도 읽지 못했습니다.

  RLS(접근제어)에 막힌 것으로 보입니다. **RLS 거부는 오류가 아니라
  빈 결과로 오기 때문에**, 그대로 두면 이 스크립트는 "할 일이 없다"고
  조용히 끝납니다. 아무 일도 안 하고 다 된 것처럼 보이는 게 더 위험해서
  여기서 멈춥니다.

  해결: .env.local 에 서비스 롤 키를 넣으세요 (VITE_ 접두어 없이).

      SUPABASE_SERVICE_ROLE_KEY=eyJ...

  Supabase > Project Settings > API > service_role
  ${serviceKey ? '(지금은 서비스 롤 키를 쓰고 있는데도 비었습니다 — 표가 정말 비었을 수 있습니다.)' : '(지금은 anon 키를 쓰고 있습니다.)'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
        process.exit(1)
    }

    if (!serviceKey) {
        console.warn(`⚠ anon 키로 접속했습니다. 읽기는 되지만 ${write ? '쓰기가' : '일부 표가'} 막힐 수 있습니다.`)
        console.warn('  .env.local 에 SUPABASE_SERVICE_ROLE_KEY 를 넣으면 확실합니다.\n')
    }

    return { supabase, env, usingServiceKey: Boolean(serviceKey) }
}

export default connect
