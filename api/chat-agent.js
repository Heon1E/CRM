// Serverless Function for Vercel/Netlify
// This proxies requests to Google Gemini API to keep the API key secure

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
    const { messages } = req.body

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages format' })
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ 
        error: 'API key not configured',
        message: 'Please set GEMINI_API_KEY environment variable' 
      })
    }

    // Gemini API 형식으로 메시지 변환
    const systemPrompt = `당신은 CRM 비서 AI입니다. 사용자의 입력을 분석하여 다음 작업을 수행합니다:

**1. 명함 인식 (이미지가 있을 때)**
- 명함에서 정보를 추출하여 JSON 형식으로 반환
- 형식: {"action": "add_client", "client": {"company": "회사명", "contact_person": "담당자", "phone": "전화번호", "email": "이메일", "address": "주소"}}

**2. 활동내역 등록 (텍스트 입력)**
- "오늘 A사 방문", "B사 김대리와 미팅" 등을 파싱
- 형식: {"action": "add_activity", "activity": {"title": "활동명", "client_name": "거래처명", "activity_type": "미팅|전화|방문|이메일", "notes": "내용", "activity_date": "YYYY-MM-DD"}}

**3. 일반 대화**
- 위 두 가지에 해당하지 않으면 친절하게 대화

**중요:** 명함이나 활동 등록이 감지되면 반드시 JSON을 \`\`\`json 블록 안에 포함하여 답변하세요.`

    // Gemini 포맷으로 변환 (user/model 역할)
    const contents = messages.map((msg, idx) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }))

    // 시스템 프롬프트를 첫 번째 user 메시지로 추가
    if (contents.length > 0) {
      contents[0].parts[0].text = `${systemPrompt}\n\n${contents[0].parts[0].text}`
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
          }
        })
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('Gemini API Error:', errorData)
      return res.status(response.status).json({ 
        error: 'Gemini API request failed',
        details: errorData 
      })
    }

    const data = await response.json()
    
    // Claude API 응답 형식으로 변환 (프론트엔드 호환성)
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '응답을 생성할 수 없습니다.'
    
    return res.status(200).json({
      content: [{ text: responseText }]
    })
  } catch (error) {
    console.error('Server error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    })
  }
}
