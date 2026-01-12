import { GoogleGenerativeAI } from '@google/generative-ai'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY

if (!API_KEY) {
  console.warn('VITE_GEMINI_API_KEY가 설정되지 않았습니다. Gemini API를 사용할 수 없습니다.')
}

/**
 * Gemini API를 사용하여 명함 이미지에서 정보 추출
 * Using gemini-pro-vision for stable client-side compatibility
 */
export const extractBusinessCardInfo = async (imageBase64) => {
  if (!API_KEY) {
    throw new Error('API 키가 설정되지 않았습니다.');
  }

  try {
    // 1. Clean Base64 Data
    let base64Data = imageBase64;
    let mimeType = 'image/jpeg';
    
    if (imageBase64.includes(',')) {
      const parts = imageBase64.split(',');
      const header = parts[0];
      base64Data = parts[1];
      
      if (header.includes('image/png')) mimeType = 'image/png';
      else if (header.includes('image/webp')) mimeType = 'image/webp';
    }

    // 2. Initialize Legacy Model (Stable for Browser)
    const genAI = new GoogleGenerativeAI(API_KEY);
    // CRITICAL: Using 'gemini-pro-vision' as it is the most stable vision model for client-side SDKs
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-pro-vision', 
      // Note: 'responseMimeType' is NOT supported in pro-vision, so we removed it.
    });

    // 3. Strong JSON Prompt
    const promptText = `
      Analyze this business card image and extract the following information.
      Return the result ONLY as a JSON object. Do not include Markdown formatting (like \`\`\`json).
      
      Fields required:
      - company (String): Company name
      - contact_person (String): Name
      - position (String): Job title
      - phone (String): Phone number
      - email (String): Email address
      - address (String): Full address

      If a field is not found, use an empty string "".
    `;

    // 4. Correct Request Structure (Strict SDK Compliance)
    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      },
      {
        text: promptText
      }
    ]);

    // 5. Response Parsing
    const response = await result.response;
    const text = response.text();
    
    console.log('[Gemini API] Raw Response:', text);

    // 6. Manual JSON Cleaning (Since we can't enforce JSON mode)
    let jsonString = text.trim();
    // Remove markdown code blocks if present
    if (jsonString.includes('```')) {
      jsonString = jsonString.replace(/```json|```/g, '').trim();
    }
    
    // Find the JSON object
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonString = jsonMatch[0];
    }

    const extractedInfo = JSON.parse(jsonString);
    
    return {
      company: extractedInfo.company || '',
      contact_person: extractedInfo.contact_person || '',
      position: extractedInfo.position || '',
      phone: extractedInfo.phone || '',
      email: extractedInfo.email || '',
      address: extractedInfo.address || ''
    };

  } catch (error) {
    console.error('[Gemini API Error]', error);
    
    // Friendly Error Messages
    const msg = error.message?.toLowerCase() || '';
    if (msg.includes('404') || msg.includes('not found')) {
      throw new Error('AI 모델에 연결할 수 없습니다. (지역/버전 호환성 문제)');
    } else if (msg.includes('400') || msg.includes('invalid')) {
      throw new Error('이미지 형식이 올바르지 않거나 너무 큽니다.');
    } else if (msg.includes('503') || msg.includes('overloaded')) {
      throw new Error('AI 서버 사용량이 많습니다. 잠시 후 다시 시도해주세요.');
    }
    
    throw new Error('명함 분석에 실패했습니다. 다시 시도해주세요.');
  }
}