/**
 * 음성 지능 비서 유틸리티
 * Gemini API를 사용한 단발성 음성 명령 처리
 */

/**
 * 음성 명령 처리 (Gemini API 사용)
 * 사용자의 음성 텍스트를 분석하여 3가지 유형 중 하나로 처리
 * @param {string} transcript - 음성 인식된 텍스트
 * @returns {Promise<Object>} { type: 'schedule' | 'order' | 'note', data: object }
 */
export const processVoiceCommand = async (transcript) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('Gemini API 키가 설정되지 않았습니다.')
  }

  const today = new Date().toISOString().split('T')[0]
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  const nextWeekMonday = new Date(Date.now() + (8 - new Date().getDay()) * 86400000).toISOString().split('T')[0]

  const prompt = `당신은 영업 관리 AI 비서입니다. 사용자의 음성 명령을 분석하여 다음 3가지 유형 중 하나로 분류하고 처리해주세요:

**유형 A (일정 등록 - schedule):**
- 날짜/시간이 언급된 일정이나 약속
- 예: "15일 미팅", "내일 약속", "다음주 월요일 오후 2시 회의", "3월 20일 A사 방문"
- 키워드: 미팅, 약속, 회의, 방문, 일정, 스케줄

**유형 B (주문/활동 - order):**
- 출고, 주문, 배송, 보내줘 등의 키워드가 포함된 업무 지시
- 예: "A사에 제품 출고해줘", "B회사 주문 접수", "C기업에 견적서 보내줘", "D사에 샘플 전달"
- 키워드: 출고, 주문, 배송, 보내줘, 전달, 접수, 견적서, 샘플

**유형 C (일반 메모 - note):**
- 그 외의 모든 메모나 기록
- 예: "A사 담당자 연락처 변경", "B회사 제품 샘플 전달 완료", "C기업과 통화함"

**[응답 형식]**
{
  "type": "schedule" | "order" | "note",
  "data": {
    // type이 "schedule"인 경우:
    "title": "일정 제목",
    "description": "상세 설명",
    "date": "YYYY-MM-DD 형식의 날짜 (오늘: ${today}, 내일: ${tomorrow}, 다음주 월요일: ${nextWeekMonday} 등으로 변환)",
    "time": "HH:MM 형식의 시간 (언급된 경우만, 없으면 null)",
    "clientName": "거래처명 (언급된 경우)",
    "type": "미팅" | "전화" | "방문" | "회의"
    
    // type이 "order"인 경우:
    "title": "📦 주문 접수: [내용]",
    "description": "상세 내용 (거래처, 제품, 수량 등)",
    "date": "YYYY-MM-DD 형식의 날짜 (오늘: ${today})",
    "clientName": "거래처명 (언급된 경우)",
    "type": "주문" | "출고" | "배송" | "견적"
    
    // type이 "note"인 경우:
    "title": "일반 메모",
    "description": "메모 내용",
    "date": "YYYY-MM-DD 형식의 날짜 (오늘: ${today})",
    "type": "이메일" | "전화" | "메모"
  }
}

**[중요 규칙]**
1. 날짜 표현("오늘", "내일", "15일", "다음주 월요일" 등)을 실제 날짜(YYYY-MM-DD)로 변환해주세요.
   - 오늘: ${today}
   - 내일: ${tomorrow}
   - 다음주 월요일: ${nextWeekMonday}
   - "15일", "20일" 등은 현재 월의 해당 날짜로 변환
2. 시간이 언급되지 않으면 time 필드는 null로 설정하세요.
3. 거래처명이나 회사명이 언급되면 clientName에 포함하세요.
4. 유형 B(주문/활동)의 경우 title에 반드시 "📦 주문 접수: " 접두사를 붙여주세요.
5. 모든 날짜는 YYYY-MM-DD 형식으로 정확히 변환해주세요.

다음 음성 텍스트를 분석해주세요:
"${transcript}"`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini API 오류 (${response.status}): ${errorText}`)
    }

    const result = await response.json()
    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text

    if (!responseText) {
      throw new Error('Gemini API 응답이 비어있습니다.')
    }

    // JSON 추출 (코드 블록 제거)
    let jsonText = responseText.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '')
    }

    // JSON 파싱 시도
    let parsed = null
    try {
      parsed = JSON.parse(jsonText)
    } catch (parseError) {
      // JSON 객체 추출 시도
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
      if (jsonMatch && jsonMatch[0]) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('JSON 파싱 실패')
      }
    }

    // 결과 검증 및 안전한 반환
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('유효하지 않은 응답 형식')
    }

    // 안전한 구조로 정규화
    const safeData = parsed.data || {}
    const todayDate = new Date().toISOString().split('T')[0]

    return {
      type: parsed.type || 'note',
      data: {
        title: safeData.title || '음성 명령',
        description: safeData.description || transcript,
        date: safeData.date || todayDate,
        time: safeData.time || null,
        clientName: safeData.clientName || '',
        type: safeData.type || (parsed.type === 'schedule' ? '미팅' : parsed.type === 'order' ? '주문' : '이메일')
      }
    }
  } catch (error) {
    console.error('[voiceAssistant] 음성 명령 처리 오류:', error)
    throw error
  }
}

// 하위 호환성을 위한 기존 함수들 (사용하지 않지만 유지)
export const classifyVoiceIntent = async (transcript) => {
  const result = await processVoiceCommand(transcript)
  return {
    intent: result.type === 'schedule' ? 'schedule' : result.type === 'order' ? 'meeting' : 'note',
    confidence: 0.9,
    data: result.data
  }
}

export const analyzeVoiceCommand = async (transcript) => {
  const result = await processVoiceCommand(transcript)
  return {
    type: result.type,
    action: result.data.title,
    data: result.data
  }
}

// 회의록 요약 함수는 유지 (사용하지 않지만 호환성 유지)
export const summarizeMeeting = async (transcript) => {
  // 간단한 구현 (필요시 확장)
  return {
    summary: transcript.substring(0, 200) + '...',
    agenda: [],
    decisions: [],
    nextMeeting: null
  }
}
