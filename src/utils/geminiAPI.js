/**
 * Frontend utility for Business Card Analysis
 * Sends image data to backend API endpoint for processing
 */
export const extractBusinessCardInfo = async (imageBase64) => {
  try {
    // 1. Validate input
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      throw new Error('유효한 이미지 데이터가 없습니다.')
    }

    // 2. Validate image format (basic check)
    if (!imageBase64.startsWith('data:image/') && !imageBase64.includes(',')) {
      // If it's already clean base64, add data URL prefix for validation
      if (imageBase64.length < 100) {
        throw new Error('이미지 데이터가 너무 작습니다.')
      }
    }

    // 3. Send POST request to backend API
    // IMPORTANT: Must stringify the body and set Content-Type header
    const response = await fetch('/api/analyze-card', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', // MUST specify content type
      },
      body: JSON.stringify({ imageBase64: imageBase64 }), // MUST stringify the body
    })

    // 4. Handle response
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: '알 수 없는 오류가 발생했습니다.' }))
      throw new Error(errorData.error || `서버 오류: ${response.status}`)
    }

    // 5. Parse and return extracted info
    const extractedInfo = await response.json()

    console.log('[Gemini API] 분석 성공:', extractedInfo)

    return {
      company: extractedInfo.company || '',
      contact_person: extractedInfo.contact_person || '',
      position: extractedInfo.position || '',
      phone: extractedInfo.phone || '',
      email: extractedInfo.email || '',
      address: extractedInfo.address || '',
    }
  } catch (error) {
    console.error('[Gemini API Error]', error)

    // Re-throw with friendly error message
    if (error.message) {
      throw error
    }

    // Network errors
    if (error.name === 'TypeError' && error.message?.includes('fetch')) {
      throw new Error('서버에 연결할 수 없습니다. 네트워크를 확인해주세요.')
    }

    throw new Error('명함 분석에 실패했습니다. 다시 시도해주세요.')
  }
}