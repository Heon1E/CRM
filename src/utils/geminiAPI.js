import { GoogleGenerativeAI } from '@google/generative-ai'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY

if (!API_KEY) {
  console.warn('VITE_GEMINI_API_KEY가 설정되지 않았습니다. Gemini API를 사용할 수 없습니다.')
}

/**
 * Gemini API를 사용하여 명함 이미지에서 정보 추출
 */
export const extractBusinessCardInfo = async (imageBase64) => {
  if (!API_KEY) {
    throw new Error('Gemini API 키가 설정되지 않았습니다. 환경 설정에서 API 키를 확인해주세요.')
  }

  try {
    console.log('[Gemini API] 1단계: 데이터 검증 시작');
    
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      throw new Error('유효한 이미지 데이터가 없습니다.');
    }

    // 1. 데이터 및 MIME 타입 추출
    let base64Data = imageBase64;
    let mimeType = 'image/jpeg'; 

    if (imageBase64.includes(',')) {
      const parts = imageBase64.split(',');
      const header = parts[0];
      base64Data = parts[1]; // 순수 Base64
      
      if (header.includes('image/png')) mimeType = 'image/png';
      else if (header.includes('image/webp')) mimeType = 'image/webp';
      else mimeType = 'image/jpeg';
    }

    // 2. Gemini API 초기화 및 프롬프트 설정
    const genAI = new GoogleGenerativeAI(API_KEY);
    const prompt = `
명함 이미지에서 정보를 추출하여 반드시 JSON으로만 응답하세요.
{
  "company": "회사명(주식회사 등 포함)",
  "contact_person": "이름",
  "position": "직함",
  "phone": "전화번호(010-0000-0000)",
  "email": "이메일",
  "address": "주소"
}
정보가 없으면 ""으로 채우세요.`;

    // 3. API 호출 함수 (재사용 가능하도록 분리)
    const callGeminiAPI = async (modelName) => {
      const model = genAI.getGenerativeModel({ model: modelName });
      const apiPromise = model.generateContent([
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        },
        prompt
      ]);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), 25000)
      );

      const result = await Promise.race([apiPromise, timeoutPromise]);
      return result.response;
    };

    // 4. 첫 번째 모델로 시도 (gemini-1.5-flash-001)
    let response;
    let text;
    try {
      console.log('[Gemini API] 모델 gemini-1.5-flash-001로 호출 시도...');
      response = await callGeminiAPI('gemini-1.5-flash-001');
      text = response.text();
    } catch (firstError) {
      // 404 에러 또는 모델을 찾을 수 없는 경우 Fallback 모델로 재시도
      const isModelNotFound = firstError.message?.includes('404') || 
                              firstError.message?.includes('Model not found') ||
                              firstError.message?.includes('NOT_FOUND');
      
      if (isModelNotFound) {
        console.warn('[Gemini API] gemini-1.5-flash-001 모델을 찾을 수 없음, Fallback 모델로 재시도...');
        try {
          console.log('[Gemini API] Fallback 모델 gemini-pro-vision으로 호출 시도...');
          response = await callGeminiAPI('gemini-pro-vision');
          text = response.text();
        } catch (fallbackError) {
          // Fallback 모델도 실패한 경우
          console.error('[Gemini API] Fallback 모델 호출 실패:', fallbackError);
          throw new Error('AI 모델 버전을 찾을 수 없습니다. 개발자에게 문의하세요.');
        }
      } else {
        // 404가 아닌 다른 에러인 경우 그대로 throw
        throw firstError;
      }
    }
    
    // 5. JSON 파싱
    let jsonText = text.trim();
    if (jsonText.includes('```')) {
      jsonText = jsonText.replace(/```json|```/g, '').trim();
    }
    
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('분석 결과 형식이 올바르지 않습니다.');

    const extractedInfo = JSON.parse(jsonMatch[0]);
    
    console.log('[Gemini API] 분석 성공:', extractedInfo);
    return extractedInfo;

  } catch (error) {
    console.error('[Gemini API] 상세 에러:', error);
    
    // 타임아웃 에러
    if (error.message === 'TIMEOUT') {
      throw new Error('분석 시간이 너무 오래 걸립니다. 네트워크를 확인해주세요.');
    }
    
    // 404 에러 (모델을 찾을 수 없음) - 이미 위에서 처리했지만 안전장치
    if (error.message?.includes('404') || 
        error.message?.includes('Model not found') ||
        error.message?.includes('NOT_FOUND') ||
        error.message?.includes('AI 모델 버전을 찾을 수 없습니다')) {
      throw new Error('AI 모델 버전을 찾을 수 없습니다. 개발자에게 문의하세요.');
    }
    
    // API 키 관련 에러
    if (error.message?.includes('403') || 
        error.message?.includes('API_KEY_INVALID') ||
        error.message?.includes('PERMISSION_DENIED')) {
      throw new Error('API 키가 유효하지 않습니다.');
    }
    
    // 기타 에러는 원본 메시지 그대로 전달 (이미 한글화된 경우 포함)
    throw new Error(error.message || '명함 분석 중 알 수 없는 오류가 발생했습니다.');
  }
}