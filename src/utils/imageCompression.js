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
    maxWidth = 1024, // 모바일 고해상도 이미지 대응: 최대 1024px로 강제 리사이징
    maxHeight = 1024, // 모바일 고해상도 이미지 대응: 최대 1024px로 강제 리사이징
    quality = 0.8,
    maxSizeKB = 1024, // 1MB (1024KB) - API 전송 한계 대응
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
      const img = new Image()

      img.onload = () => {
        // 원본 이미지 크기
        const originalWidth = img.width
        const originalHeight = img.height

        // 리사이징 비율 계산
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

        // Canvas 생성
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        // Canvas에 이미지 그리기
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        // JPEG로 변환 (품질 조정)
        let compressedBase64 = canvas.toDataURL('image/jpeg', quality)
        let currentSizeKB = (compressedBase64.length * 3) / 4 / 1024 // Base64 크기 추정

        // 품질을 점진적으로 낮추면서 최대 크기 이하로 압축
        const tryCompress = (currentQuality) => {
          if (currentSizeKB <= maxSizeKB || currentQuality <= 0.1) {
            // 최종 Base64를 Blob으로 변환하여 File 객체 생성
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(new Error('이미지 압축에 실패했습니다.'))
                  return
                }

                const compressedFile = new File([blob], file.name, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
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
            // 품질을 낮춰서 다시 시도
            const newQuality = Math.max(0.1, currentQuality - 0.1)
            compressedBase64 = canvas.toDataURL('image/jpeg', newQuality)
            currentSizeKB = (compressedBase64.length * 3) / 4 / 1024
            setTimeout(() => tryCompress(newQuality), 0) // 비동기 재시도
          }
        }

        tryCompress(quality)
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