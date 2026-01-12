import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * Vercel Serverless Function for Business Card Analysis
 * Production-ready implementation with strict SDK compliance
 */
export default async function handler(req, res) {
  // 1. CORS Setup (Production Ready)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY
    if (!API_KEY) {
      console.error('[API] Missing API Key')
      return res.status(500).json({ error: 'Server configuration error' })
    }

    // 2. Parse & Validate Body
    let body = req.body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON' })
      }
    }
    const { imageBase64 } = body
    if (!imageBase64) return res.status(400).json({ error: 'No image provided' })

    // 3. Prepare Image Data
    let cleanBase64 = imageBase64
    let mimeType = 'image/jpeg'
    if (imageBase64.includes(',')) {
      const parts = imageBase64.split(',')
      cleanBase64 = parts[1]
      if (parts[0].includes('png')) mimeType = 'image/png'
      else if (parts[0].includes('webp')) mimeType = 'image/webp'
    }

    // 4. Initialize Model (Stable Vision)
    const genAI = new GoogleGenerativeAI(API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-pro-vision' })

    // 5. Strict Prompt
    const promptText = `
      Analyze this business card image.
      Extract these fields into a raw JSON object: company, contact_person, position, phone, email, address.
      Rules:
      - Use empty string "" if a field is missing.
      - Return ONLY valid JSON.
      - Do NOT use Markdown code blocks.
    `

    // 6. Generate Content (Canonical Structure)
    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            { text: promptText }, // Context first
            { inlineData: { data: cleanBase64, mimeType: mimeType } }, // Image second
          ],
        },
      ],
    })

    const response = await result.response
    const text = response.text()
    console.log('[API] Response Preview:', text.substring(0, 50) + '...')

    // 7. Robust Parsing & Cleaning
    let jsonString = text.replace(/```json|```/g, '').trim()
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/)
    if (jsonMatch) jsonString = jsonMatch[0]

    const data = JSON.parse(jsonString)
    return res.status(200).json(data)
  } catch (error) {
    // 8. Secure Error Handling
    console.error('[Server Error]', error) // Log full error internally

    // Return generic message to client to avoid leaking internals
    return res.status(500).json({
      error: '명함 분석에 실패했습니다. (AI 응답 오류)',
      code: 'AI_PROCESSING_FAILED',
    })
  }
}
