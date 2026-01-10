import React, { useState, useRef, useEffect, useCallback } from 'react'
import { X, Camera, Image, Sparkles } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useBackgroundTask } from '../contexts/BackgroundTaskContext'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { extractBusinessCardInfo } from '../utils/geminiAPI'
import { compressImage } from '../utils/imageCompression'
import { saveToStore, deleteFromStore, STORES } from '../utils/offlineDB'
import { addToQueue, QUEUE_OPERATION } from '../utils/syncQueue'
import toast from 'react-hot-toast'

/**
 * 명함 스캔 모달 컴포넌트 (Gemini AI 백그라운드 처리)
 * 카메라 촬영 또는 갤러리 이미지 선택 → 백그라운드에서 Gemini API 처리 → 고객 정보 추출 및 등록
 */
const BusinessCardScannerModal = ({ isOpen, onClose, onSuccess }) => {
  const { clients, addClient, updateClient } = useData()
  const { addTask, removeTask } = useBackgroundTask()
  const { isOnline } = useOnlineStatus()
  const [imageSrc, setImageSrc] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)

  // 고객 데이터 처리 (조회/등록/업데이트) - 스마트 DB 매핑 (데이터 보존 우선) - useCallback으로 최적화
  const processClientData = useCallback(async (info) => {
    try {
      // 동일한 이름과 회사명으로 기존 고객 조회
      const existingClient = clients.find(c => 
        c.contact_person === info.contact_person && 
        c.company === info.company &&
        info.contact_person && info.company
      ) || (info.company && clients.find(c => 
        c.company === info.company && 
        info.company
      ))

      let result = {
        action: '',
        client: null,
        addedFields: [],
        updatedFields: []
      }

      if (existingClient) {
        // 기존 고객 업데이트: 기존 필드가 비어있을 때만 채우기 (기존 값 보존)
        const updateData = {}
        const addedFields = []

        // 각 필드 확인: 기존 값이 null, undefined, 빈 문자열일 때만 업데이트
        Object.keys(info).forEach(key => {
          const existingValue = existingClient[key]
          const newValue = info[key]
          
          // 기존 값이 비어있고, 새 값이 있을 때만 업데이트 (데이터 보존 우선)
          if (newValue && 
              (existingValue === null || existingValue === undefined || existingValue === '')) {
            updateData[key] = newValue
            addedFields.push(key)
          }
        })

        if (Object.keys(updateData).length > 0) {
          // 업데이트 실행
          const updated = await updateClient(existingClient.id, updateData)
          result.action = 'updated'
          result.client = updated
          result.addedFields = addedFields
          result.updatedFields = Object.keys(updateData)
        } else {
          result.action = 'no_change'
          result.client = existingClient
          result.message = '기존 정보에 추가할 내용이 없습니다.'
        }
      } else {
        // 신규 고객 등록 (정보가 있는 필드만 포함)
        const newClient = {}
        
        if (info.company) newClient.company = info.company
        if (info.contact_person) newClient.contact_person = info.contact_person
        if (info.phone) newClient.phone = info.phone
        if (info.email) newClient.email = info.email
        if (info.address) newClient.address = info.address
        
        // 최소한 회사명이나 이름 중 하나는 있어야 등록
        if (newClient.company || newClient.contact_person) {
          newClient.status = '대기'
          const created = await addClient(newClient)
          result.action = 'created'
          result.client = created
          result.addedFields = Object.keys(newClient).filter(key => newClient[key] && key !== 'status')
        } else {
          result.action = 'failed'
          result.error = '회사명 또는 이름 정보가 필요합니다.'
        }
      }

      result.success = result.action !== 'failed'
      return result

    } catch (error) {
      console.error('고객 데이터 처리 중 오류:', error)
      return {
        success: false,
        error: error.message || '알 수 없는 오류가 발생했습니다.'
      }
    }
  }, [clients, addClient, updateClient])

  // 백그라운드 처리 함수 (비동기 실행) - 오프라인 지원 - useCallback으로 최적화
  const processBusinessCardInBackground = useCallback(async (imageBase64, taskId) => {
    try {
      // 오프라인 상태 확인
      if (!isOnline) {
        // 오프라인: 이미지와 정보를 IndexedDB에 저장하고, 온라인 전환 시 처리하도록 큐에 추가
        // 명함 스캔은 Gemini API가 필요하므로 오프라인에서는 분석을 보류하고 알림
        removeTask(taskId)
        
        toast.warning('현재 오프라인 상태입니다. 명함 분석은 인터넷 연결 후 자동으로 진행됩니다.', {
          duration: 6000,
          icon: '⚠️'
        })
        
        // 오프라인 명함 스캔 작업을 로컬에 저장 (온라인 전환 시 재시도)
        try {
          // 이미지 Base64를 IndexedDB에 저장 (명함 스캔 대기 목록)
          const offlineScanData = {
            id: `offline_scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            imageBase64: imageBase64,
            timestamp: new Date().toISOString(),
            status: 'pending',
            type: 'business_card_scan',
            taskId: taskId // 백그라운드 작업 ID 연결
          }
          
          // 오프라인 명함 스캔 대기 목록에 저장
          await saveToStore(STORES.PENDING_SCANS, offlineScanData)
          
          // 큐에도 추가 (동기화 처리용)
          await addToQueue('pending_scans', QUEUE_OPERATION.INSERT, {
            imageBase64: imageBase64.substring(0, 100) + '...', // 메타데이터만 (전체 이미지는 IndexedDB에)
            timestamp: offlineScanData.timestamp,
            type: 'business_card_scan'
          }, offlineScanData.id)
          
          toast.info('명함 이미지가 로컬에 저장되었습니다. 연결 복구 시 자동으로 분석됩니다.', {
            duration: 5000,
            icon: '💾'
          })
        } catch (queueError) {
          console.error('오프라인 명함 스캔 저장 실패:', queueError)
          toast.error('명함 이미지 저장 중 오류가 발생했습니다. 다시 시도해주세요.', {
            duration: 5000,
            icon: '❌'
          })
        }
        
        return // 오프라인 처리 종료
      }

      // 온라인 상태: Gemini API로 정보 추출
      let extractedInfo
      try {
        extractedInfo = await extractBusinessCardInfo(imageBase64)
        
        // 추출된 정보 검증 (최소한 하나의 필드는 있어야 함)
        const hasValidInfo = extractedInfo.company || extractedInfo.contact_person || 
                            extractedInfo.phone || extractedInfo.email
        if (!hasValidInfo) {
          throw new Error('명함 정보를 읽을 수 없습니다. 선명한 명함 사진을 다시 찍어주세요.')
        }
      } catch (extractError) {
        // 에러 메시지가 이미 한글로 되어 있으면 그대로 사용, 아니면 기본 메시지 사용
        const errorMessage = extractError.message || 'AI 분석 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'
        
        // 작업 실패: 백그라운드 작업 목록에서 제거
        removeTask(taskId)
        
        // 완료 후에만 에러 표시 (로딩 중이 아니므로 안전)
        toast.error(errorMessage, {
          duration: 5000,
          icon: '❌'
        })
        return // 처리를 중단하고 종료
      }

      // 고객 데이터 처리 (조회/등록/업데이트) - 오프라인 지원
      let result
      try {
        result = await processClientData(extractedInfo)
      } catch (processError) {
        console.error('고객 데이터 처리 중 오류:', processError)
        
        // 네트워크 에러인 경우 오프라인 처리 시도
        if (!isOnline || processError.message?.includes('network') || processError.message?.includes('fetch')) {
          // 오프라인으로 전환된 경우: 로컬에 저장
          try {
            const offlineClientData = {
              ...extractedInfo,
              id: `offline_client_${Date.now()}`,
              is_offline: true,
              created_at: new Date().toISOString()
            }
            
            await saveToStore(STORES.CLIENTS, offlineClientData)
            await addToQueue('clients', QUEUE_OPERATION.INSERT, extractedInfo, offlineClientData.id)
            
            removeTask(taskId)
            
            toast.warning('오프라인 상태로 전환되었습니다. 데이터는 로컬에 저장되었으며, 연결 복구 시 자동으로 업로드됩니다.', {
              duration: 6000,
              icon: '💾'
            })
            
            return // 오프라인 처리 종료
          } catch (offlineError) {
            console.error('오프라인 데이터 저장 실패:', offlineError)
          }
        }
        
        // 작업 실패: 백그라운드 작업 목록에서 제거
        removeTask(taskId)
        
        // 완료 후에만 에러 표시
        toast.error(`데이터베이스 처리 중 오류가 발생했습니다: ${processError.message || '알 수 없는 오류'}`, {
          duration: 5000,
          icon: '❌'
        })
        return // 처리를 중단하고 종료
      }

      // 작업 완료: 백그라운드 작업 목록에서 제거
      removeTask(taskId)

      // 완료 알림 (처리가 완전히 끝난 후에만 표시)
      if (result.success) {
        if (result.action === 'created') {
          const clientName = result.client?.contact_person || result.client?.company || '고객'
          toast.success(`명함 분석 완료: ${clientName} 님의 정보가 등록되었습니다.`, {
            duration: 5000,
            icon: '✅'
          })
        } else if (result.action === 'updated') {
          const clientName = result.client?.contact_person || result.client?.company || '고객'
          const addedFields = result.addedFields || []
          if (addedFields.length > 0) {
            const fieldNames = addedFields.map(f => {
              const map = {
                company: '회사명',
                contact_person: '이름',
                position: '직함',
                phone: '전화번호',
                email: '이메일',
                address: '주소'
              }
              return map[f] || f
            }).join(', ')
            toast.success(`명함 분석 완료: ${clientName} 님의 정보가 업데이트되었습니다. (추가: ${fieldNames})`, {
              duration: 5000,
              icon: '✅'
            })
          } else {
            toast.success(`명함 분석 완료: ${clientName} 님의 정보를 확인했습니다. (변경사항 없음)`, {
              duration: 4000,
              icon: 'ℹ️'
            })
          }
        } else if (result.action === 'no_change') {
          const clientName = result.client?.contact_person || result.client?.company || '고객'
          toast.success(`명함 분석 완료: ${clientName} 님의 정보를 확인했습니다. (추가할 정보 없음)`, {
            duration: 4000,
            icon: 'ℹ️'
          })
        }

        // 성공 콜백 호출
        if (onSuccess) {
          onSuccess(result)
        }
      } else {
        // 처리 실패 (하지만 에러는 이미 표시됨)
        toast.error(`명함 분석 실패: ${result.error || '알 수 없는 오류'}`, {
          duration: 5000,
          icon: '❌'
        })
      }

    } catch (error) {
      console.error('명함 스캔 백그라운드 처리 중 예상치 못한 오류:', error)
      
      // 작업 실패: 백그라운드 작업 목록에서 제거
      removeTask(taskId)
      
      // 에러 메시지 한글화
      let errorMessage = 'AI 분석 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'
      
      // 이미 한글 메시지인 경우 그대로 사용
      if (error.message && !error.message.match(/^[a-zA-Z0-9\s\-_]+$/)) {
        errorMessage = error.message
      }
      
      // 완료 후에만 에러 표시
      toast.error(errorMessage, {
        duration: 5000,
        icon: '❌'
      })
    }
  }, [isOnline, clients, addClient, updateClient, processClientData, removeTask, onSuccess])

  // 오프라인 명함 스캔 재시도 리스너 (전역 리스너 - 모달이 열려있지 않아도 작동)
  useEffect(() => {
    const handleRetryBusinessCardScan = async (event) => {
      const { scanId, imageBase64, taskId } = event.detail || {}
      if (!imageBase64 || !taskId) return

      try {
        // 백그라운드 작업 추가
        addTask(taskId, '명함 분석 (재시도)')

        // 명함 스캔 재처리
        await processBusinessCardInBackground(imageBase64, taskId)
        
        // 처리 완료 후 IndexedDB에서 제거
        try {
          await deleteFromStore(STORES.PENDING_SCANS, scanId)
        } catch (deleteError) {
          console.error('오프라인 명함 스캔 데이터 삭제 실패:', deleteError)
        }
      } catch (retryError) {
        console.error('오프라인 명함 스캔 재시도 실패:', retryError)
        removeTask(taskId)
      }
    }

    window.addEventListener('retryBusinessCardScan', handleRetryBusinessCardScan)

    return () => {
      window.removeEventListener('retryBusinessCardScan', handleRetryBusinessCardScan)
    }
  }, [addTask, removeTask, processBusinessCardInBackground])

  // 파일 선택 핸들러 (이미지 압축 포함)
  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) {
      toast.error('이미지 파일만 선택할 수 있습니다.', {
        duration: 3000,
        icon: '⚠️'
      })
      return
    }

    try {
      setIsUploading(true)

      // 이미지 압축 (명함 스캔용 최적 설정)
      const compressed = await compressImage(file, {
        maxWidth: 1920, // 최대 너비
        maxHeight: 1920, // 최대 높이
        quality: 0.85, // JPEG 품질 (0.85는 명함 인식에 적절)
        maxSizeKB: 500, // 최대 파일 크기 (500KB)
      })

      // 압축된 이미지 설정
      setImageFile(compressed.file)
      setImageSrc(compressed.base64)

      // 압축 정보 표시 (선택적)
      if (compressed.compressionRatio && parseFloat(compressed.compressionRatio) > 0) {
        toast.success(`이미지 압축 완료: ${compressed.compressionRatio}% 크기 감소`, {
          duration: 2000,
          icon: '✅'
        })
      }
    } catch (error) {
      console.error('이미지 압축 실패:', error)
      
      // 압축 실패 시 원본 이미지 사용
      toast.warning('이미지 압축 중 오류가 발생했습니다. 원본 이미지를 사용합니다.', {
        duration: 4000,
        icon: '⚠️'
      })
      
      setImageFile(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        setImageSrc(e.target.result)
      }
      reader.onerror = () => {
        toast.error('이미지 읽기 실패. 다시 시도해주세요.', {
          duration: 4000,
          icon: '❌'
        })
      }
      reader.readAsDataURL(file)
    } finally {
      setIsUploading(false)
    }
  }

  // 카메라 열기
  const handleCameraClick = () => {
    cameraInputRef.current?.click()
  }

  // 갤러리 열기
  const handleGalleryClick = () => {
    fileInputRef.current?.click()
  }

  // 이미지 리셋
  const handleReset = () => {
    setImageSrc(null)
    setImageFile(null)
    setIsUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }


  // 이미지 업로드 및 백그라운드 처리 시작 (이미 압축된 이미지 사용)
  const handleProcessImage = async () => {
    if (!imageSrc || !imageFile) {
      toast.error('이미지를 선택해주세요.', {
        duration: 3000,
        icon: '⚠️'
      })
      return
    }

    // API 키 확인
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) {
      toast.error('Gemini API 키가 설정되지 않았습니다. .env 파일에 VITE_GEMINI_API_KEY를 추가해주세요.', {
        duration: 6000,
        icon: '⚠️'
      })
      return
    }

    setIsUploading(true)

    try {
      // 이미 압축된 이미지 Base64 사용 (handleFileSelect에서 이미 압축됨)
      // imageSrc는 이미 압축된 Data URL이므로 바로 사용
      let imageBase64 = imageSrc
      
      // 이미지가 Data URL 형식인지 확인 (대부분의 경우 이미 압축되어 있음)
      if (!imageBase64 || typeof imageBase64 !== 'string' || !imageBase64.startsWith('data:')) {
        // 방어 로직: 압축되지 않은 경우에만 다시 변환
        const reader = new FileReader()
        imageBase64 = await new Promise((resolve, reject) => {
          reader.onload = (e) => resolve(e.target.result)
          reader.onerror = reject
          reader.readAsDataURL(imageFile)
        })
      }

      // 이미지 Base64가 준비되면 처리 시작
      if (imageBase64) {
        // 고유 작업 ID 생성
        const taskId = `bizcard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

        // 백그라운드 작업 추가
        addTask(taskId, '명함 분석')

        // 즉시 사용자에게 피드백 및 모달 닫기
        toast.success('명함 분석을 시작했습니다. 완료되면 알림을 드릴게요.', {
          duration: 3000,
          icon: '📸'
        })

        // 모달 닫기 (사용자를 자유로운 상태로)
        setIsUploading(false)
        handleReset()
        onClose()

        // 백그라운드에서 비동기 처리 시작 (await 없이 실행)
        // 에러는 processBusinessCardInBackground 내부에서 처리하므로 여기서는 catch 불필요
        processBusinessCardInBackground(imageBase64, taskId).catch((error) => {
          // 예상치 못한 에러만 처리 (일반적인 에러는 내부에서 처리됨)
          console.error('백그라운드 처리 시작 중 예상치 못한 오류:', error)
          removeTask(taskId)
          
          // 에러 메시지 한글화
          let errorMessage = 'AI 분석 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'
          if (error.message && !error.message.match(/^[a-zA-Z0-9\s\-_]+$/)) {
            errorMessage = error.message
          }
          
          toast.error(errorMessage, {
            duration: 5000,
            icon: '❌'
          })
        })
      }
    } catch (error) {
      console.error('이미지 처리 중 오류:', error)
      setIsUploading(false)
      toast.error('이미지 처리 중 오류가 발생했습니다. 다시 시도해주세요.', {
        duration: 5000,
        icon: '❌'
      })
    }
  }


  // 모달 닫기
  const handleClose = () => {
    if (!isUploading) {
      handleReset()
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40 transition-opacity bg-gray-900 bg-opacity-50"
          onClick={handleClose}
        />

        {/* Modal */}
        <div className="relative z-50 inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl w-full">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              <h3 className="text-lg font-bold text-gray-900">명함 스캔 (AI)</h3>
            </div>
            <button
              onClick={handleClose}
              disabled={isUploading}
              className="text-gray-400 hover:text-gray-500 transition-colors p-1 hover:bg-gray-100 rounded-lg touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-5">
            {!imageSrc ? (
              /* 이미지 선택 */
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-blue-900 mb-2">
                    <span className="font-semibold">Gemini AI</span>를 사용하여 명함에서 정보를 자동으로 추출합니다.
                  </p>
                  <p className="text-xs text-blue-700">
                    이미지를 업로드하면 백그라운드에서 분석이 시작되며, 완료되면 알림을 드립니다.
                  </p>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  명함 이미지를 선택하거나 촬영해주세요.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={handleCameraClick}
                    disabled={isUploading}
                    className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-300 rounded-xl hover:border-brand-blue hover:bg-blue-50 transition-all touch-manipulation min-h-[200px] disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <Camera className="w-12 h-12 text-gray-400 mb-3" />
                    <span className="text-sm font-medium text-gray-700">카메라 촬영</span>
                  </button>
                  <button
                    onClick={handleGalleryClick}
                    disabled={isUploading}
                    className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-300 rounded-xl hover:border-brand-blue hover:bg-blue-50 transition-all touch-manipulation min-h-[200px] disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <Image className="w-12 h-12 text-gray-400 mb-3" />
                    <span className="text-sm font-medium text-gray-700">갤러리 선택</span>
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={isUploading}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={isUploading}
                />
              </div>
            ) : (
              /* 이미지 미리보기 및 업로드 */
              <div className="space-y-4">
                {/* 이미지 미리보기 */}
                <div className="relative w-full bg-gray-100 rounded-lg overflow-hidden">
                  <img
                    src={imageSrc}
                    alt="명함"
                    className="w-full h-auto max-h-96 object-contain"
                  />
                  {!isUploading && (
                    <button
                      onClick={handleReset}
                      className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      <X className="w-4 h-4 text-gray-600" />
                    </button>
                  )}
                </div>

                {/* 안내 메시지 */}
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <Sparkles className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-purple-900 mb-1">
                        Gemini AI 분석 안내
                      </p>
                      <p className="text-xs text-purple-700">
                        분석 시작 후 백그라운드에서 처리됩니다. 완료되면 화면 상단에 알림이 표시됩니다.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 액션 버튼 */}
                {!isUploading && (
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={handleReset}
                      className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium touch-manipulation min-h-[44px]"
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      다시 선택
                    </button>
                    <button
                      onClick={handleProcessImage}
                      disabled={!imageSrc || isUploading}
                      className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium touch-manipulation min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>AI 분석 시작</span>
                    </button>
                  </div>
                )}

                {isUploading && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-900 text-center">
                      이미지 준비 중...
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default BusinessCardScannerModal
