import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * Vercel Serverless Function for Business Card Analysis
 * Using gemini-1.5-flash with JSON mode for reliable parsing
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
    if (!API_KEY) return res.status(500).json({ error: 'Server API Key missing' })

    // Parse Body
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

    // Clean Base64
    let cleanBase64 = imageBase64
    let mimeType = 'image/jpeg'
    if (imageBase64.includes(',')) {
      const parts = imageBase64.split(',')
      cleanBase64 = parts[1]
      if (parts[0].includes('png')) mimeType = 'image/png'
      else if (parts[0].includes('webp')) mimeType = 'image/webp'
    }

    // Initialize Model (Use 1.5 Flash with JSON Mode)
    const genAI = new GoogleGenerativeAI(API_KEY)
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash', // Works on server with updated SDK
      generationConfig: {
        responseMimeType: 'application/json', // Native JSON support
      },
    })

    const promptText = `
      Extract business card info. 
      Fields: company, contact_person, position, phone, email, address.
      Use "" for missing fields.
    `

    const result = await model.generateContent([
      { inlineData: { data: cleanBase64, mimeType: mimeType } },
      { text: promptText },
    ])

    const response = await result.response
    const text = response.text()
    console.log('[API] Response:', text.substring(0, 100))

    // Direct JSON Parse (Safe due to JSON Mode)
    const data = JSON.parse(text)
    return res.status(200).json(data)
  } catch (error) {
    console.error('[API Error]', error)
    // Return actual error message for debugging
    return res.status(500).json({
      error: error.message || 'Server Error',
      details: error.toString(),
    })
  }
}
