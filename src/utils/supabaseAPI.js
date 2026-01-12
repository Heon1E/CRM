import { supabase } from '../lib/supabase'

/**
 * 명함 데이터를 CRM에 저장하는 함수
 * @param {Object} cardData - Gemini가 분석한 데이터 { company, contact_person, position, phone, email, address }
 * @param {Object} options - 추가 옵션 { forceSave: boolean }
 * @returns {Object} result - { success: true/false, isDuplicate: boolean, message: string, data: object }
 */
export const saveCardToCRM = async (cardData, options = {}) => {
  try {
    // 1. 현재 로그인한 사용자 확인
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      throw new Error('로그인이 필요합니다.')
    }

    // 2. 데이터 매핑 (OCR 결과 -> DB 컬럼)
    // cardData는 { company, contact_person, position, phone, email, address } 형태
    const companyName = (cardData.company || '').trim()
    
    if (!companyName) {
      throw new Error('회사명은 필수입니다.')
    }

    // 3. 중복 체크 (회사명 기준)
    const { data: existingClients, error: checkError } = await supabase
      .from('clients')
      .select('id, company, phone, email')
      .ilike('company', companyName)
      .limit(1)

    if (checkError) {
      console.error('[중복 체크 오류]', checkError)
      // 중복 체크 실패해도 저장은 진행 (네트워크 오류 등)
    }

    // 4. 중복 발견 시 처리
    if (existingClients && existingClients.length > 0) {
      const duplicate = existingClients[0]
      
      // 강제 저장 옵션이 없으면 중복 알림 반환
      if (!options.forceSave) {
        return {
          success: false,
          isDuplicate: true,
          duplicateData: duplicate,
          message: `이미 등록된 거래처입니다: ${duplicate.company}`
        }
      }
    }

    // 5. 담당자 정보 구성
    const contacts = []
    if (cardData.contact_person || cardData.position || cardData.phone || cardData.email) {
      contacts.push({
        name: (cardData.contact_person || '').trim(),
        department_role: (cardData.position || '').trim(),
        phone: (cardData.phone || '').trim(),
        email: (cardData.email || '').trim(),
        is_primary: true, // 명함으로 등록된 담당자는 대표 담당자로 설정
      })
    }

    // 6. 최종 저장 (clients 테이블에 Insert)
    const newClient = {
      company: companyName,
      address: (cardData.address || '').trim(),
      status: '신규',
      created_by: user.id,
    }

    const { data: insertedClient, error: insertError } = await supabase
      .from('clients')
      .insert([newClient])
      .select()
      .single()

    if (insertError) {
      throw insertError
    }

    // 7. 담당자 정보 저장 (있는 경우)
    if (contacts.length > 0) {
      const contactsToInsert = contacts.map(contact => ({
        client_id: insertedClient.id,
        name: contact.name,
        department_role: contact.department_role,
        phone: contact.phone,
        email: contact.email,
        is_primary: contact.is_primary,
      }))

      const { error: contactsError } = await supabase
        .from('client_contacts')
        .insert(contactsToInsert)

      if (contactsError) {
        console.error('[담당자 저장 오류]', contactsError)
        // 담당자 저장 실패해도 거래처는 저장되었으므로 경고만
      }
    }

    // 8. 최종 결과 반환 (담당자 정보 포함)
    const result = {
      ...insertedClient,
      contact_person: contacts[0]?.name || '',
      phone: contacts[0]?.phone || '',
      email: contacts[0]?.email || '',
    }

    return {
      success: true,
      message: '성공적으로 저장되었습니다.',
      data: result,
    }

  } catch (error) {
    console.error('[Supabase Save Error]', error)
    return {
      success: false,
      message: error.message || '저장 중 오류가 발생했습니다.',
    }
  }
}
