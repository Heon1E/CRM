/**
 * Frontend utility for Business Card Analysis
 * Sends image data to backend API endpoint for processing
 * Implements client-side compression to ensure payload is under 1MB
 */
import { compressImage } from './imageCompression'

/**
 * Convert Base64 string to File object for compression
 */
const base64ToFile = (base64, filename = 'image.jpg') => {
  const arr = base64.split(',')
  const mimeMatch = arr[0]?.match(/:(.*?);/)
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg'
  const bstr = atob(arr[1] || arr[0])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new File([u8arr], filename, { type: mime })
}

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

    // 3. Client-side compression (Max 1024px, JPEG 0.6 quality)
    let finalBase64 = imageBase64
    let originalSize = imageBase64.length
    let compressedSize = originalSize

    try {
      // Convert Base64 to File for compression
      const file = base64ToFile(imageBase64, 'business-card.jpg')
      
      // Compress with production settings: Max 1024px, JPEG 0.6 quality
      const compressed = await compressImage(file, {
        maxWidth: 1024,
        maxHeight: 1024,
        quality: 0.6,
        maxSizeKB: 1000, // 1MB limit
      })

      finalBase64 = compressed.base64
      compressedSize = compressed.compressedSize

      // Log compression stats
      const compressionRatio = ((1 - compressedSize / file.size) * 100).toFixed(1)
      console.log('[Gemini API] 이미지 압축 완료:', {
        originalSize: `${(file.size / 1024).toFixed(2)} KB`,
        compressedSize: `${(compressedSize / 1024).toFixed(2)} KB`,
        compressionRatio: `${compressionRatio}%`,
        base64Size: `${(finalBase64.length * 3 / 4 / 1024).toFixed(2)} KB (Base64)`,
      })
    } catch (compressionError) {
      console.warn('[Gemini API] 압축 실패, 원본 이미지 사용:', compressionError.message)
      // Continue with original image if compression fails
    }

    // 4. Send POST request to backend API
    // IMPORTANT: Must stringify the body and set Content-Type header
    const response = await fetch('/api/analyze-card', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', // MUST specify content type
      },
      body: JSON.stringify({ imageBase64: finalBase64 }), // MUST stringify the body
    })

    // 5. Handle response
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: '알 수 없는 오류가 발생했습니다.' }))
      throw new Error(errorData.error || `서버 오류: ${response.status}`)
    }

    // 6. Parse and return extracted info
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