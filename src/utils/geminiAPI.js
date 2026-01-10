import { GoogleGenerativeAI } from '@google/generative-ai'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY

if (!API_KEY) {
  console.warn('VITE_GEMINI_API_KEY가 설정되지 않았습니다. Gemini API를 사용할 수 없습니다.')
}

/**
 * Gemini API를 사용하여 명함 이미지에서 정보 추출
 * @param {string} imageBase64 - Base64 인코딩된 이미지 (data:image/... 형식 포함 가능)
 * @returns {Promise<Object>} 추출된 정보 객체
 */
export const extractBusinessCardInfo = async (imageBase64) => {
  if (!API_KEY) {
    throw new Error('Gemini API 키가 설정되지 않았습니다.')
  }

  try {
    // Base64 문자열에서 data URL 제거
    let base64Data = imageBase64
    if (base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1]
    }

    // MIME 타입 추출
    let mimeType = 'image/jpeg'
    if (imageBase64.startsWith('data:image/png')) {
      mimeType = 'image/png'
    } else if (imageBase64.startsWith('data:image/jpeg') || imageBase64.startsWith('data:image/jpg')) {
      mimeType = 'image/jpeg'
    } else if (imageBase64.startsWith('data:image/webp')) {
      mimeType = 'image/webp'
    }

    // Gemini API 초기화
    const genAI = new GoogleGenerativeAI(API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    // 프롬프트 구성
    const prompt = `
다음 명함 이미지에서 비즈니스 정보를 추출해주세요. 
한국어 명함 형식에 맞춰 다음 정보를 정확하게 추출해주세요:

1. **회사명** (company): 주식회사, (주), ㈜ 등의 법인 형태 포함
2. **이름** (contact_person): 담당자 이름 (2-4자 한글)
3. **직함** (position): 사장, 대표, 과장, 차장, 부장, 이사, 팀장, 실장, 대리, 주임, 사원 등
4. **전화번호** (phone): 010-1234-5678 형식
5. **이메일** (email): 이메일 주소
6. **주소** (address): 회사 주소 (시/도/구/동 포함)

다음 JSON 형식으로만 응답해주세요. 추출할 수 없는 정보는 빈 문자열("")로 반환해주세요. 
추측하지 말고, 이미지에서 확실하게 확인된 정보만 추출해주세요.

{
  "company": "회사명",
  "contact_person": "이름",
  "position": "직함",
  "phone": "전화번호",
  "email": "이메일",
  "address": "주소"
}
`

    // 이미지와 프롬프트를 Gemini API에 전송
    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      },
      prompt
    ])

    const response = await result.response
    const text = response.text()

    // JSON 추출 (코드 블록이 있을 수 있음)
    let jsonText = text.trim()
    
    // JSON 코드 블록 제거
    if (jsonText.includes('```json')) {
      jsonText = jsonText.split('```json')[1].split('```')[0].trim()
    } else if (jsonText.includes('```')) {
      // 일반 코드 블록 제거
      const codeBlockMatch = jsonText.match(/```([\s\S]*?)```/)
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim()
      }
    }

    // JSON 객체 부분만 추출 (중괄호로 감싸진 부분)
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      jsonText = jsonMatch[0]
    }

    // JSON 파싱
    let extractedInfo
    try {
      extractedInfo = JSON.parse(jsonText)
      
      // 필드 검증: 모든 필드가 문자열인지 확인
      if (typeof extractedInfo !== 'object' || extractedInfo === null) {
        throw new Error('유효하지 않은 JSON 형식')
      }
    } catch (parseError) {
      // JSON 파싱 실패 시 텍스트에서 필드 추출 시도
      console.warn('JSON 파싱 실패, 텍스트에서 정보 추출 시도:', parseError)
      console.warn('원본 응답:', text.substring(0, 500))
      extractedInfo = parseTextResponse(text)
    }

    // 필드 검증 및 정제
    return {
      company: String(extractedInfo.company || '').trim(),
      contact_person: String(extractedInfo.contact_person || '').trim(),
      position: String(extractedInfo.position || '').trim(),
      phone: String(extractedInfo.phone || '').trim(),
      email: String(extractedInfo.email || '').trim(),
      address: String(extractedInfo.address || '').trim()
    }

  } catch (error) {
    console.error('Gemini API 호출 중 오류:', error)
    throw new Error(`명함 분석 실패: ${error.message}`)
  }
}

/**
 * JSON 파싱 실패 시 텍스트 응답에서 정보 추출 (폴백)
 */
function parseTextResponse(text) {
  const info = {
    company: '',
    contact_person: '',
    position: '',
    phone: '',
    email: '',
    address: ''
  }

  // 이메일 추출
  const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i)
  if (emailMatch) info.email = emailMatch[1]

  // 전화번호 추출
  const phoneMatch = text.match(/(\d{2,3}[-.\s]?\d{3,4}[-.\s]?\d{4})/g)
  if (phoneMatch && phoneMatch.length > 0) {
    info.phone = phoneMatch[0]
  }

  // 회사명 추출 (주식회사, (주) 등 포함)
  const companyMatch = text.match(/((주식회사|\(주\)|㈜|유한회사|\(유\))[가-힣\w\s]+)/i)
  if (companyMatch) {
    info.company = companyMatch[1].trim()
  }

  // 이름 추출 (2-4자 한글)
  const nameMatch = text.match(/([가-힣]{2,4})(\s|님|사장|대표|과장|차장|부장|이사)/i)
  if (nameMatch) {
    info.contact_person = nameMatch[1].trim()
  }

  // 직함 추출
  const positionMatch = text.match(/(사장|대표|과장|차장|부장|이사|팀장|실장|대리|주임|사원)/i)
  if (positionMatch) {
    info.position = positionMatch[1]
  }

  // 주소 추출
  const addressMatch = text.match(/([가-힣]+(시|도|구|군|동|읍|면)[\s\d\-가-힣]+)/)
  if (addressMatch) {
    info.address = addressMatch[1].trim()
  }

  return info
}
