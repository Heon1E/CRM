/**
 * 개발 서버에서 `api/*.js` 서버리스 함수를 실행해 주는 플러그인.
 *
 * Vercel은 `api/` 폴더의 파일을 자동으로 엔드포인트로 만들지만 `vite dev`는 그렇지 않다.
 * 그래서 개발 중에는 /api/... 호출이 전부 404가 나고, 스크린샷 판독 같은 기능을
 * 배포해 봐야만 확인할 수 있었다. 이 플러그인이 그 차이를 메운다.
 *
 * - `/api/analyze-erp` -> `api/analyze-erp.js`의 default export 실행
 * - 요청마다 모듈을 새로 불러오므로 함수 코드를 고치면 바로 반영된다
 * - `.env` / `.env.local` 값을 process.env에 실어 준다 (배포 환경변수 대용)
 */

import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { loadEnv } from 'vite'

const readBody = (req) =>
    new Promise((resolve) => {
        let raw = ''
        req.on('data', (c) => { raw += c })
        req.on('end', () => {
            if (!raw) return resolve(undefined)
            try { resolve(JSON.parse(raw)) } catch { resolve(raw) }
        })
    })

/** Vercel 핸들러가 기대하는 res.status().json() 형태로 감싼다 */
const wrapRes = (res) => {
    res.status = (code) => { res.statusCode = code; return res }
    res.json = (body) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(body))
        return res
    }
    res.send = (body) => { res.end(typeof body === 'string' ? body : JSON.stringify(body)); return res }
    return res
}

export default function apiDevPlugin() {
    let apiDir

    return {
        name: 'api-dev-server',
        apply: 'serve',

        configResolved(config) {
            apiDir = path.resolve(config.root, 'api')
            // 배포 환경변수 대신 .env 값을 서버 함수에 넘긴다.
            // VITE_ 접두어 없는 값도 읽어야 하므로 prefixes를 비운다.
            const env = loadEnv(config.mode, config.root, '')
            Object.entries(env).forEach(([k, v]) => {
                if (process.env[k] === undefined) process.env[k] = v
            })
        },

        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                if (!req.url?.startsWith('/api/')) return next()

                const name = req.url.split('?')[0].replace(/^\/api\//, '').replace(/\/$/, '')
                const file = path.join(apiDir, `${name}.js`)

                if (!name || !fs.existsSync(file)) {
                    res.statusCode = 404
                    res.setHeader('Content-Type', 'application/json')
                    return res.end(JSON.stringify({ error: 'NOT_FOUND', message: `api/${name}.js 없음` }))
                }

                try {
                    // 캐시를 우회해 수정한 코드가 바로 반영되게 한다
                    const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`)
                    const handler = mod.default
                    if (typeof handler !== 'function') throw new Error('default export가 함수가 아닙니다.')

                    req.body = await readBody(req)
                    await handler(req, wrapRes(res))
                } catch (e) {
                    server.config.logger.error(`[api-dev] ${name}: ${e.stack || e.message}`)
                    if (!res.writableEnded) {
                        res.statusCode = 500
                        res.setHeader('Content-Type', 'application/json')
                        res.end(JSON.stringify({ error: 'DEV_HANDLER_ERROR', message: e.message }))
                    }
                }
            })
        },
    }
}
