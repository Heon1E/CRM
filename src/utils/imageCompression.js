/**
 * 이미지 압축 유틸리티
 * Canvas API를 사용하여 이미지를 리사이징하고 압축합니다.
 */

/**
 * 이미지 파일을 Base64로 압축 변환
 * @param {File} file - 이미지 파일
 * @param {Object} options - 압축 옵션
 * @param {number} options.maxWidth - 최대 너비 (기본값: 1920)
 * @param {number} options.maxHeight - 최대 높이 (기본값: 1920)
 * @param {number} options.quality - JPEG 품질 (0.0 ~ 1.0, 기본값: 0.8)
 * @param {number} options.maxSizeKB - 최대 파일 크기 (KB, 기본값: 500)
 * @returns {Promise<{base64: string, file: File}>} 압축된 이미지 Base64와 File 객체
 */
export const compressImage = async (file, options = {}) => {
  const {
    maxWidth = 1280, // 모바일 메모리 부하 감소: 최대 1280px로 제한
    maxHeight = 1280, // 모바일 메모리 부하 감소: 최대 1280px로 제한
    quality = 0.75, // 초기 품질을 낮춰서 압축 속도 향상
    maxSizeKB = 800, // 800KB로 강제 조정 (API 전송 한계 대응)
  } = options

  return new Promise((resolve, reject) => {
    // File 객체 검증
    if (!file || !(file instanceof File)) {
      reject(new Error('유효한 이미지 파일이 필요합니다.'))
      return
    }

    // 파일 타입 검증
    if (!file.type.startsWith('image/')) {
      reject(new Error('이미지 파일만 업로드할 수 있습니다.'))
      return
    }

    // FileReader로 이미지 읽기
    const reader = new FileReader()

    reader.onload = (e) => {
      console.log('[이미지 압축] 1단계: 이미지 로드 완료')
      const img = new Image()

      img.onload = () => {
        try {
          console.log('[이미지 압축] 2단계: 이미지 크기 계산 시작', { 
            originalWidth: img.width, 
            originalHeight: img.height,
            originalSize: file.size 
          })
          
          // 원본 이미지 크기
          const originalWidth = img.width
          const originalHeight = img.height

          // 리사이징 비율 계산 (비율 유지)
          let width = originalWidth
          let height = originalHeight

          if (width > maxWidth) {
            height = (height * maxWidth) / width
            width = maxWidth
          }

          if (height > maxHeight) {
            width = (width * maxHeight) / height
            height = maxHeight
          }

          console.log('[이미지 압축] 3단계: 리사이징 크기 결정', { width, height })

          // Canvas 생성
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height

          // Canvas에 이미지 그리기 (고품질 리샘플링)
          const ctx = canvas.getContext('2d')
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(img, 0, 0, width, height)
          
          console.log('[이미지 압축] 4단계: Canvas에 이미지 그리기 완료')

          // 품질을 점진적으로 낮추면서 최대 크기 이하로 압축 (무한 루프 방지)
          const MAX_ITERATIONS = 10 // 최대 반복 횟수 제한
          let iterationCount = 0
          let currentQuality = quality
          let compressedBase64 = null
          let currentSizeKB = Infinity

          const tryCompress = () => {
            iterationCount++
            console.log(`[이미지 압축] 5단계: 압축 시도 ${iterationCount}/${MAX_ITERATIONS}`, { 
              currentQuality, 
              currentSizeKB: currentSizeKB !== Infinity ? currentSizeKB : '계산 중...' 
            })
            
            // 무한 루프 방지: 최대 반복 횟수 초과 시 현재 결과 반환
            if (iterationCount > MAX_ITERATIONS) {
              console.warn('[이미지 압축] 최대 반복 횟수 초과, 현재 결과 사용')
              // 마지막으로 생성된 이미지 사용
              if (compressedBase64) {
                canvas.toBlob(
                  (blob) => {
                    if (!blob) {
                      console.error('[이미지 압축] Blob 생성 실패')
                      reject(new Error('이미지 압축에 실패했습니다.'))
                      return
                    }

                    const compressedFile = new File([blob], file.name, {
                      type: 'image/jpeg',
                      lastModified: Date.now(),
                    })

                    // Base64가 Data URL 형식인지 확인 (Gemini API 요구사항)
                    if (!compressedBase64 || typeof compressedBase64 !== 'string' || !compressedBase64.startsWith('data:image/')) {
                      console.error('[이미지 압축] Base64 형식 오류', { compressedBase64: compressedBase64?.substring(0, 50) })
                      reject(new Error('압축된 이미지 형식이 올바르지 않습니다.'))
                      return
                    }

                    // 최종 검증: Base64 데이터가 비어있지 않은지 확인
                    if (compressedBase64.length < 100) {
                      console.error('[이미지 압축] Base64 데이터가 너무 작음', { length: compressedBase64.length })
                      reject(new Error('압축된 이미지 데이터가 너무 작습니다.'))
                      return
                    }

                    console.log('[이미지 압축] 6단계: 압축 완료 (최대 반복 횟수 초과)', {
                      originalSize: file.size,
                      compressedSize: blob.size,
                      compressionRatio: ((1 - blob.size / file.size) * 100).toFixed(1)
                    })

                    resolve({
                      base64: compressedBase64,
                      file: compressedFile,
                      originalSize: file.size,
                      compressedSize: blob.size,
                      compressionRatio: ((1 - blob.size / file.size) * 100).toFixed(1),
                    })
                  },
                  'image/jpeg',
                  currentQuality
                )
              } else {
                console.error('[이미지 압축] 압축된 이미지가 없음')
                reject(new Error('이미지 압축에 실패했습니다. 파일 크기가 너무 큽니다.'))
              }
              return
            }

            // 현재 품질로 압축 시도
            compressedBase64 = canvas.toDataURL('image/jpeg', currentQuality)
            currentSizeKB = (compressedBase64.length * 3) / 4 / 1024 // Base64 크기 추정

            console.log(`[이미지 압축] 압축 결과`, { 
              currentSizeKB: currentSizeKB.toFixed(2), 
              maxSizeKB, 
              currentQuality 
            })

            // 목표 크기 이하이거나 최소 품질에 도달하면 완료
            if (currentSizeKB <= maxSizeKB || currentQuality <= 0.1) {
              console.log('[이미지 압축] 목표 크기 달성, 최종 압축 완료')
              canvas.toBlob(
                (blob) => {
                  if (!blob) {
                    console.error('[이미지 압축] Blob 생성 실패')
                    reject(new Error('이미지 압축에 실패했습니다.'))
                    return
                  }

                  const compressedFile = new File([blob], file.name, {
                    type: 'image/jpeg',
                    lastModified: Date.now(),
                  })

                  // Base64가 Data URL 형식인지 확인 (Gemini API 요구사항)
                  if (!compressedBase64 || typeof compressedBase64 !== 'string' || !compressedBase64.startsWith('data:image/')) {
                    console.error('[이미지 압축] Base64 형식 오류', { compressedBase64: compressedBase64?.substring(0, 50) })
                    reject(new Error('압축된 이미지 형식이 올바르지 않습니다.'))
                    return
                  }

                  // 최종 검증: Base64 데이터가 비어있지 않은지 확인
                  if (compressedBase64.length < 100) {
                    console.error('[이미지 압축] Base64 데이터가 너무 작음', { length: compressedBase64.length })
                    reject(new Error('압축된 이미지 데이터가 너무 작습니다.'))
                    return
                  }

                  console.log('[이미지 압축] 6단계: 압축 완료', {
                    originalSize: file.size,
                    compressedSize: blob.size,
                    compressionRatio: ((1 - blob.size / file.size) * 100).toFixed(1)
                  })

                  resolve({
                    base64: compressedBase64,
                    file: compressedFile,
                    originalSize: file.size,
                    compressedSize: blob.size,
                    compressionRatio: ((1 - blob.size / file.size) * 100).toFixed(1),
                  })
                },
                'image/jpeg',
                currentQuality
              )
            } else {
              // 품질을 더 낮춰서 재시도
              currentQuality = Math.max(0.1, currentQuality - 0.1)
              console.log(`[이미지 압축] 품질 낮춤: ${currentQuality}, 재시도`)
              // 동기적으로 재시도 (setTimeout 제거로 무한 루프 방지)
              tryCompress()
            }
          }

          tryCompress()
        } catch (error) {
          reject(new Error(`이미지 압축 중 오류가 발생했습니다: ${error.message}`))
        }
      }

      img.onerror = () => {
        reject(new Error('이미지를 로드할 수 없습니다.'))
      }

      img.src = e.target.result
    }

    reader.onerror = () => {
      reject(new Error('파일을 읽을 수 없습니다.'))
    }

    reader.readAsDataURL(file)
  })
}

/**
 * 이미지 파일의 크기 정보 가져오기
 * @param {File} file - 이미지 파일
 * @returns {Promise<{width: number, height: number, size: number}>}
 */
export const getImageInfo = async (file) => {
  return new Promise((resolve, reject) => {
    if (!file || !(file instanceof File)) {
      reject(new Error('유효한 이미지 파일이 필요합니다.'))
      return
    }

    const reader = new FileReader()

    reader.onload = (e) => {
      const img = new Image()

      img.onload = () => {
        resolve({
          width: img.width,
          height: img.height,
          size: file.size,
          type: file.type,
        })
      }

      img.onerror = () => {
        reject(new Error('이미지를 로드할 수 없습니다.'))
      }

      img.src = e.target.result
    }

    reader.onerror = () => {
      reject(new Error('파일을 읽을 수 없습니다.'))
    }

    reader.readAsDataURL(file)
  })
}