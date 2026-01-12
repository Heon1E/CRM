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
    throw new Error('Gemini API 키가 설정되지 않았습니다. .env 파일에 VITE_GEMINI_API_KEY를 추가해주세요.')
  }

  try {
    // 이미지 데이터 검증
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      throw new Error('명함 정보를 읽을 수 없습니다. 선명한 명함 사진을 다시 찍어주세요.')
    }

    // Base64 문자열에서 data URL 제거
    let base64Data = imageBase64
    if (base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1]
    }

    // Base64 데이터 검증
    if (!base64Data || base64Data.length < 100) {
      throw new Error('명함 정보를 읽을 수 없습니다. 선명한 명함 사진을 다시 찍어주세요.')
    }

    // MIME 타입 추출 및 검증
    let mimeType = 'image/jpeg'
    if (imageBase64.startsWith('data:image/png')) {
      mimeType = 'image/png'
    } else if (imageBase64.startsWith('data:image/jpeg') || imageBase64.startsWith('data:image/jpg')) {
      mimeType = 'image/jpeg'
    } else if (imageBase64.startsWith('data:image/webp')) {
      mimeType = 'image/webp'
    } else if (!imageBase64.startsWith('data:image/')) {
      // 지원하지 않는 이미지 형식
      throw new Error('지원하지 않는 이미지 형식입니다. JPG, PNG, WebP 형식의 명함 사진을 사용해주세요.')
    }

    // Gemini API 초기화 (최신 모델 사용)
    const genAI = new GoogleGenerativeAI(API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    // 프롬프트 구성 (JSON 형식 강제)
    const prompt = `
다음 명함 이미지에서 비즈니스 정보를 추출해주세요. 
한국어 명함 형식에 맞춰 다음 정보를 정확하게 추출해주세요:

1. **회사명** (company): 주식회사, (주), ㈜ 등의 법인 형태 포함
2. **이름** (contact_person): 담당자 이름 (2-4자 한글)
3. **직함** (position): 사장, 대표, 과장, 차장, 부장, 이사, 팀장, 실장, 대리, 주임, 사원 등
4. **전화번호** (phone): 010-1234-5678 형식
5. **이메일** (email): 이메일 주소
6. **주소** (address): 회사 주소 (시/도/구/동 포함)

**중요: 응답은 반드시 JSON 형식으로만 해주세요. 다른 설명이나 텍스트 없이 순수 JSON만 반환해주세요.**

추출할 수 없는 정보는 빈 문자열("")로 반환해주세요. 
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

    // 이미지와 프롬프트를 Gemini API에 전송 (타임아웃 설정)
    let result
    let timeoutId = null
    try {
      // 타임아웃 Promise 생성 (30초로 설정 - 네트워크 불안정 대응)
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('timeout'))
        }, 30000) // 30초 타임아웃
      })

      // API 호출 Promise
      const apiPromise = model.generateContent([
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        },
        prompt
      ])

      // Promise.race로 타임아웃과 API 호출 경쟁
      result = await Promise.race([
        apiPromise,
        timeoutPromise
      ])
      
      // 성공 시 타임아웃 취소
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    } catch (apiError) {
      // 에러 발생 시 타임아웃 취소
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      
      // 에러 메시지 확인 및 한글화
      if (apiError.message === 'timeout') {
        throw new Error('서버 응답 시간이 초과되었습니다. 서버 점검 중일 수 있습니다. 잠시 후 다시 시도해주세요.')
      }
      
      // 네트워크 에러 처리
      if (apiError.message?.includes('Failed to fetch') || apiError.message?.includes('NetworkError')) {
        throw new Error('네트워크 연결에 문제가 있습니다. 인터넷 연결을 확인하고 잠시 후 다시 시도해주세요.')
      }
      
      // Gemini API 에러 처리
      if (apiError.status || apiError.statusCode) {
        const status = apiError.status || apiError.statusCode
        if (status === 403 || status === 401) {
          throw new Error('AI 분석 서비스 권한이 없습니다. API 키를 확인해주세요.')
        } else if (status === 400) {
          throw new Error('명함 정보를 읽을 수 없습니다. 선명한 명함 사진을 다시 찍어주세요.')
        } else if (status === 429) {
          throw new Error('AI 분석 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.')
        } else if (status >= 500) {
          throw new Error('AI 분석 서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.')
        }
      }
      
      // 에러 메시지 분석
      const errorMsg = apiError.message?.toLowerCase() || ''
      if (errorMsg.includes('forbidden') || errorMsg.includes('403')) {
        throw new Error('AI 분석 서비스 권한이 없습니다. API 키를 확인해주세요.')
      } else if (errorMsg.includes('quota') || errorMsg.includes('limit')) {
        throw new Error('AI 분석 서비스 사용 한도를 초과했습니다. 잠시 후 다시 시도해주세요.')
      } else if (errorMsg.includes('safety') || errorMsg.includes('blocked') || errorMsg.includes('content')) {
        throw new Error('명함 정보를 읽을 수 없습니다. 선명한 명함 사진을 다시 찍어주세요.')
      }
      
      // 기본 에러 메시지 (다른 에러)
      throw apiError
    }

    const response = await result.response
    
    // 응답 검증
    if (!response) {
      throw new Error('AI 분석 서비스에서 응답을 받지 못했습니다. 잠시 후 다시 시도해주세요.')
    }

    let text
    try {
      text = response.text()
      
      // 응답 텍스트 검증
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('명함 정보를 읽을 수 없습니다. 선명한 명함 사진을 다시 찍어주세요.')
      }
    } catch (textError) {
      console.error('응답 텍스트 추출 실패:', textError)
      throw new Error('명함 정보를 읽을 수 없습니다. 선명한 명함 사진을 다시 찍어주세요.')
    }

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
    } else {
      // JSON 객체가 없으면 텍스트에서 직접 추출 시도
      console.warn('JSON 객체를 찾을 수 없음, 텍스트에서 정보 추출 시도')
      const extractedInfo = parseTextResponse(text)
      
      // 추출된 정보가 거의 없으면 에러 처리
      const hasValidInfo = extractedInfo.company || extractedInfo.contact_person || 
                          extractedInfo.phone || extractedInfo.email
      
      if (!hasValidInfo) {
        throw new Error('명함 정보를 읽을 수 없습니다. 선명한 명함 사진을 다시 찍어주세요.')
      }
      
      return {
        company: String(extractedInfo.company || '').trim(),
        contact_person: String(extractedInfo.contact_person || '').trim(),
        position: String(extractedInfo.position || '').trim(),
        phone: String(extractedInfo.phone || '').trim(),
        email: String(extractedInfo.email || '').trim(),
        address: String(extractedInfo.address || '').trim()
      }
    }

    // JSON 파싱
    let extractedInfo
    try {
      extractedInfo = JSON.parse(jsonText)
      
      // 필드 검증: 모든 필드가 문자열인지 확인
      if (typeof extractedInfo !== 'object' || extractedInfo === null || Array.isArray(extractedInfo)) {
        throw new Error('유효하지 않은 JSON 형식')
      }
      
      // 필드 존재 확인 (최소한 하나의 필드는 있어야 함)
      const hasFields = Object.keys(extractedInfo).length > 0
      if (!hasFields) {
        throw new Error('추출된 정보가 없습니다')
      }
      
    } catch (parseError) {
      // JSON 파싱 실패 시 텍스트에서 필드 추출 시도
      console.warn('JSON 파싱 실패, 텍스트에서 정보 추출 시도:', parseError)
      console.warn('원본 응답:', text.substring(0, 500))
      
      extractedInfo = parseTextResponse(text)
      
      // 텍스트에서도 정보를 추출하지 못한 경우
      const hasValidInfo = extractedInfo.company || extractedInfo.contact_person || 
                          extractedInfo.phone || extractedInfo.email
      
      if (!hasValidInfo) {
        throw new Error('명함 정보를 읽을 수 없습니다. 선명한 명함 사진을 다시 찍어주세요.')
      }
    }

    // 필드 검증 및 정제
    const cleanedInfo = {
      company: String(extractedInfo.company || '').trim(),
      contact_person: String(extractedInfo.contact_person || '').trim(),
      position: String(extractedInfo.position || '').trim(),
      phone: String(extractedInfo.phone || '').trim(),
      email: String(extractedInfo.email || '').trim(),
      address: String(extractedInfo.address || '').trim()
    }

    // 최소한 하나의 유효한 정보는 있어야 함 (회사명, 이름, 전화번호, 이메일 중 하나)
    const hasValidInfo = cleanedInfo.company || cleanedInfo.contact_person || 
                        cleanedInfo.phone || cleanedInfo.email

    if (!hasValidInfo) {
      throw new Error('명함 정보를 읽을 수 없습니다. 선명한 명함 사진을 다시 찍어주세요.')
    }

    return cleanedInfo

  } catch (error) {
    console.error('Gemini API 호출 중 오류:', error)
    
    // 에러 메시지 한글화 및 분류
    let userFriendlyMessage = '분석 서비스 연결 불가: 서버 점검 중입니다. 잠시 후 다시 시도해주세요.'
    
    // HTTP 상태 코드별 에러 메시지
    if (error.status || error.statusCode) {
      const status = error.status || error.statusCode
      if (status === 403 || status === 401) {
        userFriendlyMessage = 'AI 분석 서비스 권한이 없습니다. API 키를 확인해주세요.'
      } else if (status === 400) {
        userFriendlyMessage = '명함 정보를 읽을 수 없습니다. 선명한 명함 사진을 다시 찍어주세요.'
      } else if (status === 413) {
        userFriendlyMessage = '이미지 파일이 너무 큽니다. 더 작은 이미지를 사용해주세요.'
      } else if (status === 429) {
        userFriendlyMessage = 'AI 분석 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'
      } else if (status === 500 || status === 502 || status === 503 || status === 504) {
        userFriendlyMessage = '서버 점검 중입니다. 잠시 후 다시 시도해주세요.'
      }
    }
    
    // 에러 메시지 내용 기반 분류
    const errorMessage = error.message?.toLowerCase() || ''
    if (errorMessage.includes('forbidden') || errorMessage.includes('403')) {
      userFriendlyMessage = 'AI 분석 서비스 권한이 없습니다. API 키를 확인해주세요.'
    } else if (errorMessage.includes('unauthorized') || errorMessage.includes('401')) {
      userFriendlyMessage = 'AI 분석 서비스 인증에 실패했습니다. API 키를 확인해주세요.'
    } else if (errorMessage.includes('quota') || errorMessage.includes('limit')) {
      userFriendlyMessage = 'AI 분석 서비스 사용 한도를 초과했습니다. 잠시 후 다시 시도해주세요.'
    } else if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('connection')) {
      userFriendlyMessage = '네트워크 연결에 문제가 있습니다. 인터넷 연결을 확인하고 잠시 후 다시 시도해주세요.'
    } else if (errorMessage.includes('timeout')) {
      userFriendlyMessage = 'AI 분석 요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.'
    } else if (errorMessage.includes('safety') || errorMessage.includes('blocked')) {
      userFriendlyMessage = '명함 정보를 읽을 수 없습니다. 선명한 명함 사진을 다시 찍어주세요.'
    } else if (errorMessage.includes('invalid') || errorMessage.includes('malformed')) {
      userFriendlyMessage = '명함 정보를 읽을 수 없습니다. 선명한 명함 사진을 다시 찍어주세요.'
    }
    
    throw new Error(userFriendlyMessage)
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
