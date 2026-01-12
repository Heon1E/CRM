import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * Vercel Serverless Function for Business Card Analysis
 * Handles Gemini API calls server-side to bypass CORS and region restrictions
 */
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Get API key from environment variable
    const API_KEY = process.env.VITE_GEMINI_API_KEY

    if (!API_KEY) {
      console.error('[API] VITE_GEMINI_API_KEY is not set')
      return res.status(500).json({ error: 'API 키가 설정되지 않았습니다.' })
    }

    // Get image data from request body
    const { imageBase64 } = req.body

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: '유효한 이미지 데이터가 없습니다.' })
    }

    // 1. Clean Base64 Data
    let base64Data = imageBase64
    let mimeType = 'image/jpeg'

    if (imageBase64.includes(',')) {
      const parts = imageBase64.split(',')
      const header = parts[0]
      base64Data = parts[1]

      if (header.includes('image/png')) {
        mimeType = 'image/png'
      } else if (header.includes('image/webp')) {
        mimeType = 'image/webp'
      }
    }

    // 2. Initialize Gemini API (Server-side: gemini-1.5-flash works perfectly)
    const genAI = new GoogleGenerativeAI(API_KEY)
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    })

    // 3. JSON Schema for structured output
    const schema = {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company name' },
        contact_person: { type: 'string', description: 'Contact person name' },
        position: { type: 'string', description: 'Job title or position' },
        phone: { type: 'string', description: 'Phone number' },
        email: { type: 'string', description: 'Email address' },
        address: { type: 'string', description: 'Full address' },
      },
      required: ['company', 'contact_person', 'position', 'phone', 'email', 'address'],
    }

    // 4. Prompt for business card extraction
    const promptText = `
      Analyze this business card image and extract the following information.
      Return the result as a JSON object matching the provided schema.
      
      Fields to extract:
      - company: Company name (including legal entity type like 주식회사, (주), etc.)
      - contact_person: Person's name
      - position: Job title (사장, 대표, 과장, 차장, 부장, 이사, 팀장, 실장, 대리, 주임, 사원, etc.)
      - phone: Phone number (format: 010-1234-5678)
      - email: Email address
      - address: Full address (시/도/구/동 포함)

      If a field is not found, use an empty string "".
    `

    // 5. Generate content with image and prompt
    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      },
      {
        text: promptText,
      },
    ])

    // 6. Parse response
    const response = await result.response
    const text = response.text()

    console.log('[API] Gemini Response:', text.substring(0, 200))

    // 7. Parse JSON response (should be valid JSON due to responseMimeType)
    let extractedInfo
    try {
      // Remove markdown code blocks if present
      let jsonString = text.trim()
      if (jsonString.includes('```')) {
        jsonString = jsonString.replace(/```json|```/g, '').trim()
      }

      // Find JSON object
      const jsonMatch = jsonString.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        jsonString = jsonMatch[0]
      }

      extractedInfo = JSON.parse(jsonString)
    } catch (parseError) {
      console.error('[API] JSON Parse Error:', parseError)
      return res.status(500).json({ error: '분석 결과 형식이 올바르지 않습니다.' })
    }

    // 8. Return structured data
    return res.status(200).json({
      company: extractedInfo.company || '',
      contact_person: extractedInfo.contact_person || '',
      position: extractedInfo.position || '',
      phone: extractedInfo.phone || '',
      email: extractedInfo.email || '',
      address: extractedInfo.address || '',
    })
  } catch (error) {
    console.error('[API] Error:', error)

    // Friendly error messages
    const msg = error.message?.toLowerCase() || ''
    const status = error.status || error.response?.status

    if (status === 404 || msg.includes('not found')) {
      return res.status(404).json({ error: 'AI 모델에 연결할 수 없습니다. (지역/버전 호환성 문제)' })
    } else if (status === 400 || msg.includes('invalid')) {
      return res.status(400).json({ error: '이미지 형식이 올바르지 않거나 너무 큽니다.' })
    } else if (status === 403 || msg.includes('permission') || msg.includes('api_key')) {
      return res.status(403).json({ error: 'API 키가 유효하지 않습니다.' })
    } else if (status === 429 || msg.includes('quota') || msg.includes('rate limit')) {
      return res.status(429).json({ error: 'AI 서버 사용량이 많습니다. 잠시 후 다시 시도해주세요.' })
    } else if (status === 503 || msg.includes('overloaded')) {
      return res.status(503).json({ error: 'AI 서버 사용량이 많습니다. 잠시 후 다시 시도해주세요.' })
    }

    return res.status(500).json({ error: '명함 분석에 실패했습니다. 다시 시도해주세요.' })
  }
}
