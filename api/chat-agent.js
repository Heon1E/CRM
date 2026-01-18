// Serverless Function for Vercel/Netlify
// This proxies requests to Claude API to keep the API key secure

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  )

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { messages, stream = false } = req.body

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages format' })
    }

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY

    if (!ANTHROPIC_API_KEY) {
      return res.status(500).json({ 
        error: 'API key not configured',
        message: 'Please set ANTHROPIC_API_KEY environment variable' 
      })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        messages: messages,
        system: `당신은 프론트엔드 개발 전문가입니다. React, Supabase, Tailwind CSS를 사용하는 CRM 프로젝트를 돕고 있습니다.
사용자의 요청을 분석하고, 구체적인 코드 수정 방안을 제시하세요.
항상 한국어로 답변하며, 명확하고 실행 가능한 지침을 제공하세요.`,
        stream: stream
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('Claude API Error:', errorData)
      return res.status(response.status).json({ 
        error: 'Claude API request failed',
        details: errorData 
      })
    }

    if (stream) {
      // 스트리밍 응답 처리
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          res.write(chunk)
        }
        res.end()
      } catch (error) {
        console.error('Streaming error:', error)
        res.end()
      }
    } else {
      // 일반 응답
      const data = await response.json()
      return res.status(200).json(data)
    }
  } catch (error) {
    console.error('Server error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    })
  }
}
