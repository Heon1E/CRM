import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * Vercel Serverless Function for Business Card Analysis
 * Handles Gemini API calls server-side to bypass CORS and region restrictions
 */
export default async function handler(req, res) {
  // 1. CORS 설정 (보안 강화 및 에러 방지)
  const allowedOrigins = [
    'https://crm-orpin-three.vercel.app', // 실제 배포 도메인
    'http://localhost:5173',               // 로컬 개발 환경
    'http://localhost:3000'
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // 개발 편의를 위해 일단 * 허용하되, 배포 시엔 위 리스트만 허용하는 게 정석
    res.setHeader('Access-Control-Allow-Origin', '*'); 
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Preflight 요청 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 2. API 키 확인
    const API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

    if (!API_KEY) {
      console.error('[API] GEMINI_API_KEY is not set');
      return res.status(500).json({ error: '서버 API 키 설정 오류' });
    }

    // 3. Body 파싱 (Vercel은 자동이지만 안전장치 추가)
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    }

    const { imageBase64 } = body;
    if (!imageBase64) {
      return res.status(400).json({ error: '이미지 데이터가 없습니다.' });
    }

    // 4. Base64 정리 (헤더 제거)
    let cleanBase64 = imageBase64;
    let mimeType = 'image/jpeg';

    if (imageBase64.includes(',')) {
      const parts = imageBase64.split(',');
      cleanBase64 = parts[1];
      const header = parts[0];
      
      if (header.includes('png')) mimeType = 'image/png';
      else if (header.includes('webp')) mimeType = 'image/webp';
    }

    // 5. Gemini 호출 (서버이므로 1.5-flash 사용 가능!)
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: 'application/json' // JSON 강제
      }
    });

    const prompt = `
      Extract business card info into this JSON structure:
      {
        "company": "Company Name",
        "contact_person": "Name",
        "position": "Job Title",
        "phone": "010-xxxx-xxxx",
        "email": "email@address.com",
        "address": "Full Address"
      }
      If not found, use empty string "".
    `;

    const result = await model.generateContent([
      { inlineData: { data: cleanBase64, mimeType: mimeType } },
      { text: prompt }
    ]);

    const responseText = result.response.text();
    console.log('[API] Raw Response:', responseText.substring(0, 100) + '...');

    // 6. 결과 파싱 및 반환
    let data;
    try {
      // 마크다운 코드블록 제거 등 클리닝 없이 바로 파싱 시도 (JSON 모드 사용했으므로)
      data = JSON.parse(responseText);
    } catch (e) {
      // 혹시 모르니 클리닝 후 재시도
      const cleaned = responseText.replace(/```json|```/g, '').trim();
      data = JSON.parse(cleaned);
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error('[API Error]', error);
    return res.status(500).json({ 
      error: error.message || '서버 내부 오류 발생' 
    });
  }
}