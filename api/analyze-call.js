/**
 * 통화 녹음 판독 — **오디오를 실제로 보낸다.**
 *
 * 예전 `ShareProcessing.jsx`는 브라우저에서 Gemini를 직접 부르면서
 * **오디오를 보내지 않았다.** 파일명과 제목만 넘기고 이렇게 시켰다:
 *
 *   "파일명과 제목을 바탕으로 추론한 통화 내용 요약, 3-5줄"
 *   "실제 음성 내용을 들을 수 없으므로 파일명과 제목 정보만을 기반으로 추론해주세요"
 *
 * 즉 **통화 내용을 지어내게 하고 그것을 활동 기록에 그대로 저장**하고 있었다.
 * 활동 기록은 영업 코치·KPI·거래처 브리핑의 근거다. 파일명이
 * `통화 녹음 001.m4a`이면 아무 근거 없는 3~5줄이 이력에 남는다.
 * (오디오를 base64로 바꾸는 코드는 있었는데 어디에도 쓰이지 않았다 — 큰 파일을
 * 통째로 문자열로 만들어 놓고 버렸다.)
 *
 * `gemini-2.5-flash`는 오디오를 직접 받는다. 파일을 실어 보내 **들은 것만**
 * 적게 한다. 못 알아들으면 지어내지 말고 그렇다고 말하게 한다.
 *
 * 키는 `GEMINI_API_KEY`(VITE_ 없음). 브라우저에 두면 번들에서 추출된다.
 */
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY

/*
 * Vercel 서버리스 함수의 요청 본문 한도가 4.5MB다. base64는 원본보다 4/3배로
 * 불어나므로 오디오 원본 기준 약 3MB까지만 받는다. 삼성 통화 녹음(AAC 모노)이
 * 대략 분당 0.5MB이니 6분쯤이다. 넘으면 **자르지 않고 거절한다** — 뒷부분이
 * 조용히 사라지면 "통화 끝에 합의한 것"이 기록에서 빠진다.
 */
const MAX_BASE64 = 4_000_000

/*
 * Gemini가 받는 오디오 형식은 정해져 있다. 안드로이드 통화 녹음은 `.m4a`
 * (MP4 컨테이너 + AAC)로 나오는데 브라우저가 붙이는 `audio/mp4`·`audio/x-m4a`는
 * 그 목록에 없어 400이 난다. 담고 있는 것은 AAC이므로 그렇게 알려 준다.
 */
const MIME_MAP = {
    'audio/mp4': 'audio/aac',
    'audio/x-m4a': 'audio/aac',
    'audio/m4a': 'audio/aac',
    'audio/mpeg': 'audio/mp3',
    'audio/x-wav': 'audio/wav',
    'audio/vnd.wave': 'audio/wav',
    'audio/3gpp': 'audio/aac',
    'audio/amr': 'audio/aac',
}
const ALLOWED = new Set(['audio/aac', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aiff'])

const normalizeMime = (raw) => {
    const m = String(raw || '').split(';')[0].trim().toLowerCase()
    const mapped = MIME_MAP[m] || m
    return ALLOWED.has(mapped) ? mapped : 'audio/aac'
}

const PROMPT = (meta) => `너는 B2B 영업사원의 통화 녹음을 정리하는 조수다.
**첨부된 음성을 직접 듣고**, 들린 내용만 적는다.

절대 규칙:
1. **들리지 않은 것을 지어내지 마라.** 파일명·날짜만 보고 내용을 추측하지 마라.
2. 음성이 없거나 알아들을 수 없으면 summary를 빈 문자열로 두고
   inaudible을 true로 해라. 그럴듯한 요약을 만들어 채우지 마라.
3. 숫자는 **단위째로** 옮겨라. '15만원'은 금액이지 시각이 아니다.
4. 회사명·사람 이름·직급이 들리면 반드시 남겨라.
5. 확실하지 않은 항목은 빈 문자열로 둔다.

참고용 파일 정보 (내용 추론에 쓰지 마라. 날짜를 못 들었을 때만 date에 쓴다):
- 파일명: ${meta.fileName || '없음'}
- 공유 시각: ${meta.timestamp || '없음'}
- 오늘 날짜: ${meta.today}

JSON만 출력한다:
{
  "inaudible": false,
  "clientName": "들린 회사명 또는 빈 문자열",
  "contactName": "들린 상대방 이름·직급 또는 빈 문자열",
  "date": "YYYY-MM-DD",
  "type": "주문" | "미팅" | "컴플레인" | "일반",
  "summary": "들린 내용 요약 3-5줄",
  "nextAction": "하기로 한 일이 있으면 한 줄, 없으면 빈 문자열"
}`

/** 서버는 UTC로 돈다. 한국 날짜를 따로 만든다 (`src/utils/day.js`는 브라우저용). */
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)

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

    const { audioBase64, mimeType, fileName, timestamp } = req.body || {}
    const data = String(audioBase64 || '')
    if (!data) return res.status(400).json({ error: 'NO_AUDIO', message: '음성 파일이 비어 있습니다.' })
    if (data.length > MAX_BASE64) {
        return res.status(413).json({
            error: 'TOO_LARGE',
            message: '녹음이 너무 깁니다 (약 6분까지). 나눠서 공유하거나 직접 입력해 주세요.',
        })
    }

    const today = kstToday()
    try {
        const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: PROMPT({ fileName, timestamp, today }) },
                            { inline_data: { mime_type: normalizeMime(mimeType), data } },
                        ],
                    }],
                    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
                }),
            }
        )
        if (!r.ok) {
            const detail = await r.json().catch(() => ({}))
            console.error('[analyze-call] Gemini 실패', r.status, detail?.error?.message)
            const message = r.status === 429
                ? '사용량이 많아 잠시 지연되고 있습니다. 1분 뒤 다시 시도해 주세요.'
                : r.status === 400
                    ? '이 녹음 형식을 읽지 못했습니다. 활동을 직접 입력해 주세요.'
                    : '통화 판독에 실패했습니다.'
            return res.status(r.status === 429 ? 429 : 502).json({ error: 'GEMINI', message })
        }

        const body = await r.json()
        const text = body?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        if (!text) return res.status(502).json({ error: 'EMPTY', message: '판독 결과가 비어 있습니다.' })

        let parsed
        try {
            parsed = JSON.parse(text.replace(/^```json\s*/i, '').replace(/```$/, '').trim())
        } catch {
            console.error('[analyze-call] JSON 파싱 실패', text.slice(0, 200))
            return res.status(502).json({ error: 'PARSE', message: '판독 결과를 읽지 못했습니다.' })
        }

        /*
         * **못 알아들었으면 여기서 끝낸다.** 예전 코드는 실패해도 `success: true`로
         * 돌려주고 파일명으로 만든 가짜 요약을 활동에 저장했다. 없는 기록보다
         * 틀린 기록이 나쁘다.
         */
        if (parsed.inaudible || !String(parsed.summary || '').trim()) {
            return res.status(200).json({
                inaudible: true,
                message: '음성을 알아듣지 못했습니다. 활동을 직접 입력해 주세요.',
            })
        }

        const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.date || ''))
        return res.status(200).json({
            inaudible: false,
            clientName: String(parsed.clientName || '').trim(),
            contactName: String(parsed.contactName || '').trim(),
            date: dateOk ? parsed.date : today,
            type: ['주문', '미팅', '컴플레인', '일반'].includes(parsed.type) ? parsed.type : '일반',
            summary: String(parsed.summary || '').trim().slice(0, 3000),
            nextAction: String(parsed.nextAction || '').trim(),
        })
    } catch (e) {
        console.error('[analyze-call]', e.message)
        return res.status(500).json({ error: 'UNEXPECTED', message: '통화 판독에 실패했습니다.' })
    }
}

// 오디오 base64가 기본 한도(1MB)를 넘는다. Vercel 최대치까지 열어 준다.
export const config = { api: { bodyParser: { sizeLimit: '5mb' } } }
