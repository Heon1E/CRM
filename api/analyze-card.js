import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const API_KEY =
      process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

    console.log('[DEBUG] API Key:', API_KEY ? 'FOUND' : 'MISSING');
    if (!API_KEY) throw new Error('GEMINI_API_KEY is missing');

    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        throw new Error('Invalid JSON body');
      }
    }

    const { imageBase64 } = body;
    if (!imageBase64) throw new Error('No imageBase64 received');

    console.log(
      '[DEBUG] Payload size:',
      Math.round(imageBase64.length / 1024),
      'KB'
    );

    // Clean base64
    const parts = imageBase64.split(',');
    const cleanBase64 = parts[1] || parts[0];
    const mimeType =
      (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';

    // Gemini (Legacy Stable Vision Model)
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-pro-vision',
    });

    const prompt = `
Analyze this business card.
Return ONLY a raw JSON object.
Fields:
company, contact_person, position, phone, email, address.
Use "" if missing.
`;

    // Use Flat Array for Legacy Model Compatibility
    const result = await model.generateContent([
      prompt,
      { inlineData: { data: cleanBase64, mimeType } },
    ]);

    const response = await result.response;
    const text = response.text();

    console.log('[Gemini Raw]', text.substring(0, 200));

    // Regex Extraction
    let jsonText = text.replace(/```json|```/g, '').trim();
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (match) jsonText = match[0];

    let data;
    try {
      data = JSON.parse(jsonText);
    } catch {
      throw new Error('Gemini response is not valid JSON');
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error('[CRITICAL ERROR]', error);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: error.message,
      stack: error.stack,
      toString: error.toString(),
    });
  }
}
