import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * Vercel Serverless Function for Business Card Analysis
 * Using gemini-pro-vision (Legacy Stable Model) to avoid 404 errors
 */
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY
    if (!API_KEY) throw new Error('GEMINI_API_KEY is missing')

    // Body Parsing
    let body = req.body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch (e) {
        throw new Error('Invalid JSON body')
      }
    }
    const { imageBase64 } = body
    if (!imageBase64) throw new Error('No image provided')

    // Clean Base64
    const parts = imageBase64.split(',')
    const cleanBase64 = parts[1] || parts[0]
    const mimeType = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg'

    // Initialize Legacy Model (gemini-pro-vision)
    const genAI = new GoogleGenerativeAI(API_KEY)
    const model = genAI.getGenerativeModel({
      model: 'gemini-pro-vision', // <--- STABLE LEGACY MODEL
      // generationConfig: REMOVED (Not supported)
    })

    const promptText = `
      Analyze this business card. 
      Return ONLY a raw JSON string (no markdown).
      Fields: company, contact_person, position, phone, email, address.
      Use "" for missing fields.
    `

    // Legacy Model prefers flat array
    const result = await model.generateContent([
      promptText,
      { inlineData: { data: cleanBase64, mimeType: mimeType } },
    ])

    const response = await result.response
    const text = response.text()
    console.log('[API] Raw Response:', text.substring(0, 100))

    // Regex Parsing (Essential for Legacy Model)
    let jsonString = text.replace(/```json|```/g, '').trim()
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/)
    if (jsonMatch) jsonString = jsonMatch[0]

    let data
    try {
      data = JSON.parse(jsonString)
    } catch (e) {
      console.error('JSON Parse Failed:', text)
      throw new Error('AI output was not valid JSON')
    }

    return res.status(200).json(data)
  } catch (error) {
    console.error('[CRITICAL ERROR]', error)
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: error.message,
      stack: error.stack,
    })
  }
}
