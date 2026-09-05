import React, { useState, useRef, useEffect, useCallback } from 'react'
import { X, Camera, Image, Sparkles, Loader2 } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useBackgroundTask } from '../contexts/BackgroundTaskContext'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { extractBusinessCardInfo } from '../utils/geminiAPI'
import { compressImage } from '../utils/imageCompression'
import { saveToStore, deleteFromStore, STORES } from '../utils/offlineDB'
import { addToQueue, QUEUE_OPERATION } from '../utils/syncQueue'
import { supabase } from '../lib/supabase'
import { showError, showSuccess } from '../utils/alert'
import toast from 'react-hot-toast'

const BusinessCardScannerModal = ({ isOpen, onClose, onSuccess }) => {
  const { clients, addClient, updateClient, replaceClientContacts } = useData()
  const { addTask, removeTask } = useBackgroundTask()
  const { isOnline } = useOnlineStatus()
  const [imageSrc, setImageSrc] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)

  const processClientData = useCallback(async (info) => {
    try {
      const companyName = info.company ? String(info.company).trim() : ''
      const existingClient = companyName 
        ? clients.find(c => (c.company || '').trim().toLowerCase() === companyName.toLowerCase())
        : null

      let result = { action: '', client: null, addedFields: [], success: true }

      if (existingClient) {
        const updateData = {}; const addedFields = []; let contactsToAdd = []
        // 지운 표시가 붙은 사람을 되살리지 않는다
        const { data: contactsData } = await supabase.from('client_contacts')
          .select('*').eq('client_id', existingClient.id).is('deleted_at', null)
        const existingContacts = contactsData || []

        if (info.contact_person && !existingContacts.some(c => c.name === info.contact_person)) {
          contactsToAdd.push({
            name: info.contact_person, department_role: info.position || '',
            phone: info.phone || '', email: info.email || '',
            /* **이미 대표가 있으면 대표로 세우지 않는다.** 거래처당 대표는
               하나라는 유니크 제약이 있어, 대표를 둘 담아 보내면 저장이
               통째로 실패한다. `replaceClientContacts`는 지우고 넣는 방식이라
               그 실패가 곧 **그 거래처 담당자 전멸**이었다. */
            is_primary: !existingContacts.some(c => c.is_primary),
          })
        }

        Object.keys(info).forEach(key => {
          if (['contact_person', 'phone', 'email', 'position'].includes(key)) return
          if (info[key] && !existingClient[key]) { updateData[key] = info[key]; addedFields.push(key); }
        })

        if (contactsToAdd.length > 0) {
          const r = await replaceClientContacts(existingClient.id, [...existingContacts, ...contactsToAdd])
          // 저장이 안 됐는데 '담당자 추가됨'이라고 적으면 사라진 것을 아무도 모른다
          if (!r?.success) throw (r?.error || new Error('담당자를 저장하지 못했습니다.'))
          addedFields.push('담당자')
        }

        if (Object.keys(updateData).length > 0 || contactsToAdd.length > 0) {
          const updated = await updateClient(existingClient.id, updateData)
          result.action = 'updated'; result.client = updated; result.addedFields = addedFields;
        } else { result.action = 'no_change'; result.client = existingClient; }
      } else if (info.company) {
        const contacts = info.contact_person ? [{
          name: info.contact_person, department_role: info.position || '',
          phone: info.phone || '', email: info.email || '', is_primary: true,
        }] : []
        const created = await addClient({ company: info.company, address: info.address || '', status: '신규', contacts })
        result.action = 'created'; result.client = created;
      } else { result.action = 'failed'; result.error = '회사명 정보가 필요합니다.'; result.success = false; }
      
      return result
    } catch (error) { return { success: false, error: error.message } }
  }, [clients, addClient, updateClient, replaceClientContacts])

  const processBusinessCardInBackground = useCallback(async (imageBase64, taskId) => {
    try {
      setIsAnalyzing(true)
      if (!isOnline) {
        removeTask(taskId); setIsAnalyzing(false)
        toast('오프라인 상태입니다.', { icon: '⚠️' })
        return
      }
      const extractedInfo = await extractBusinessCardInfo(imageBase64)
      const result = await processClientData(extractedInfo)
      if (result.success) {
        if (onSuccess) onSuccess({ ...result, extractedInfo })
        showSuccess('명함 분석 완료')
      } else { throw new Error(result.error) }
    } catch (error) {
      showError(error.message || '분석 중 오류 발생')
    } finally {
      setIsAnalyzing(false); setIsUploading(false); removeTask(taskId)
    }
  }, [isOnline, processClientData, removeTask, onSuccess])

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      setIsUploading(true)
      const compressed = await compressImage(file, { maxWidth: 1280, maxHeight: 1280, quality: 0.75, maxSizeKB: 800 })
      setImageFile(compressed.file); setImageSrc(compressed.base64)
    } catch (error) { showError('이미지 압축 실패') } finally { setIsUploading(false) }
  }

  const handleProcessImage = async () => {
    if (!imageSrc) return
    setIsAnalyzing(true); setIsUploading(true)
    const taskId = `bizcard_${Date.now()}`
    try {
      addTask(taskId, '명함 분석')
      toast('AI 분석 시작...', { icon: '🔍' })
      await processBusinessCardInBackground(imageSrc, taskId)
      handleReset(); onClose()
    } catch (error) {
      removeTask(taskId); setIsAnalyzing(false); setIsUploading(false)
      showError('처리 중 오류 발생')
    }
  }

  const handleReset = () => {
    setImageSrc(null); setImageFile(null); setIsUploading(false); setIsAnalyzing(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  const handleClose = () => { if (!isAnalyzing) { handleReset(); onClose(); } }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-md" onClick={handleClose} />
        <div className="relative z-50 inline-block align-bottom bg-[color:var(--bg-card)] border border-[color:var(--border)] rounded-card text-left overflow-hidden transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl w-full">
          <div className="flex items-center justify-between px-4 py-4 md:px-6 md:py-5 border-b border-[color:var(--border)]">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-[color:var(--text-secondary)]" />
              <h3 className="text-lg font-semibold text-[color:var(--text-primary)]">명함 스캔 (AI)</h3>
            </div>
            <button onClick={handleClose} disabled={isAnalyzing} className="text-[color:var(--text-secondary)] p-1 hover:text-[color:var(--text-primary)]"><X className="w-5 h-5" /></button>
          </div>
          <div className="px-4 py-4 md:px-6 md:py-5">
            {!imageSrc ? (
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => cameraInputRef.current?.click()} className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-[color:var(--border)] rounded-xl hover:bg-[color:var(--bg-subtle)] min-h-[200px]">
                  <Camera className="w-12 h-12 text-[color:var(--text-secondary)] mb-3" /><span className="text-sm font-medium text-[color:var(--text-secondary)]">카메라 촬영</span>
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-[color:var(--border)] rounded-xl hover:bg-[color:var(--bg-subtle)] min-h-[200px]">
                  <Image className="w-12 h-12 text-[color:var(--text-secondary)] mb-3" /><span className="text-sm font-medium text-[color:var(--text-secondary)]">갤러리 선택</span>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelect} className="hidden" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative w-full bg-[color:var(--bg-card)] rounded-lg overflow-hidden border border-[color:var(--border)]">
                  <img src={imageSrc} alt="명함" className="w-full h-auto max-h-96 object-contain" />
                  {!isAnalyzing && <button onClick={handleReset} className="absolute top-2 right-2 p-2 bg-[color:var(--bg-card)] border border-[color:var(--border)] rounded-full"><X className="w-4 h-4 text-[color:var(--text-secondary)]" /></button>}
                </div>
                <div className="flex items-center space-x-3">
                  <button onClick={handleReset} disabled={isAnalyzing} className="btn-secondary flex-1 px-4 py-2.5">다시 선택</button>
                  <button onClick={handleProcessImage} disabled={isAnalyzing || isUploading} className="btn-primary flex-1 px-4 py-2.5 flex items-center justify-center space-x-2 disabled:opacity-50">
                    {isAnalyzing ? <><Loader2 className="w-4 h-4 animate-spin" /><span>분석 중...</span></> : <><Sparkles className="w-4 h-4" /><span>AI 분석 시작</span></>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default BusinessCardScannerModal


