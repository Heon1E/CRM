import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * Vercel Serverless Function for Business Card Analysis
 * Debug Mode - Returns detailed error information for troubleshooting
 */
export default async function handler(req, res) {
  // CORS Setup
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // 1. Debug: Check Environment Variables
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY
    const keyStatus = apiKey ? `Found (Starts with ${apiKey.substring(0, 4)}...)` : 'MISSING'
    console.log(`[DEBUG] API Key Status: ${keyStatus}`)

    if (!apiKey) {
      throw new Error(`Server Environment Error: GEMINI_API_KEY is missing. Status: ${keyStatus}`)
    }

    // 2. Debug: Check Request Body
    let body = req.body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch (e) {
        throw new Error('Request body is not valid JSON')
      }
    }
    const { imageBase64 } = body
    if (!imageBase64) throw new Error('No imageBase64 data received in body')

    console.log(`[DEBUG] Image received. Length: ${imageBase64.length}`)

    // 3. Initialize Model
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    })

    const promptText = `Extract business card info into JSON. Fields: company, contact_person, position, phone, email, address. Use "" for missing.`

    // 4. Clean Base64
    const parts = imageBase64.split(',')
    const cleanBase64 = parts[1] || parts[0] // Fallback if no header
    const mimeType = parts[0].includes('png') ? 'image/png' : 'image/jpeg'

    // 5. Generate
    console.log('[DEBUG] Calling Gemini API...')
    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            { text: promptText },
            { inlineData: { data: cleanBase64, mimeType: mimeType } },
          ],
        },
      ],
    })

    const response = await result.response
    const text = response.text()
    console.log('[DEBUG] Gemini Raw Response:', text.substring(0, 50))

    const data = JSON.parse(text)
    return res.status(200).json(data)
  } catch (error) {
    console.error('[CRITICAL ERROR]', error)

    // 6. Return REAL Error to Frontend (Temporary for Debugging)
    return res.status(500).json({
      error: 'CRITICAL_SERVER_ERROR',
      message: error.message,
      stack: error.stack, // This will tell us EXACTLY where it failed
      details: error.response ? JSON.stringify(error.response) : 'No response details',
    })
  }
}
