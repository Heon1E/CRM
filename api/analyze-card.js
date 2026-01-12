import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * Vercel Serverless Function for Business Card Analysis
 * Final Production Standard - Using gemini-1.5-pro with Canonical Structure
 */
export default async function handler(req, res) {
  // CORS Setup
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

    // Body Parsing
    let body = req.body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON body' })
      }
    }
    const { imageBase64 } = body
    if (!imageBase64) return res.status(400).json({ error: 'No image provided' })

    // Base64 Cleaning
    let cleanBase64 = imageBase64
    let mimeType = 'image/jpeg'
    if (imageBase64.includes(',')) {
      const parts = imageBase64.split(',')
      cleanBase64 = parts[1]
      if (parts[0].includes('png')) mimeType = 'image/png'
      else if (parts[0].includes('webp')) mimeType = 'image/webp'
    }

    // Initialize Model (1.5 Pro + JSON Mode)
    const genAI = new GoogleGenerativeAI(API_KEY)
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-pro',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    })

    const promptText = `
      Extract business card info.
      Fields: company, contact_person, position, phone, email, address.
      Use "" for missing fields.
    `

    // Canonical Request Structure (The Fix)
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
    console.log('[API] Raw Response:', text.substring(0, 100))

    // Safety Net: Robust JSON Parsing
    let data
    try {
      data = JSON.parse(text)
    } catch (parseError) {
      console.error('[API] JSON Parse Failed:', text)
      throw new Error('AI returned invalid JSON')
    }

    return res.status(200).json(data)
  } catch (error) {
    console.error('[API Error]', error)
    return res.status(500).json({
      error: '명함 분석에 실패했습니다.',
      details: error.message,
    })
  }
}
