/**
 * 음성 지능 비서 유틸리티
 * Gemini API를 사용한 음성 명령 처리 및 회의록 요약
 */

/**
 * 음성 의도 분류 (Gemini API 사용)
 * 사용자의 음성 텍스트를 분석하여 "일정 등록", "회의록 요약", "일반 메모" 중 어떤 의도인지 분류
 * @param {string} transcript - 음성 인식된 텍스트
 * @returns {Promise<Object>} { intent: 'schedule' | 'meeting' | 'note' | 'query' | 'unknown', confidence: number, data: object }
 */
export const classifyVoiceIntent = async (transcript) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('Gemini API 키가 설정되지 않았습니다.')
  }

  const prompt = `당신은 음성 의도 분류 AI 비서입니다. 사용자의 음성 텍스트를 분석하여 다음 3가지 의도 중 하나로 분류해주세요:

1. **일정 등록 (schedule)**: 특정 날짜/시간에 일정을 등록하거나 예약하는 의도
   - 예: "다음주 월요일 오후 2시에 A사 미팅 일정 등록해줘", "내일 3시에 C기업 방문 일정 잡아줘"
   
2. **회의록 요약 (meeting)**: 회의나 통화 내용을 요약하고 기록하는 의도
   - 예: "오늘 A사와 미팅했는데 계약 조건에 대해 논의했어", "B회사와 통화해서 제안서 보내기로 했어"
   
3. **일반 메모 (note)**: 간단한 메모나 기록을 남기는 의도
   - 예: "A사 담당자 연락처 변경", "B회사 제품 샘플 전달 완료"

**[응답 형식]**
{
  "intent": "schedule" | "meeting" | "note" | "query" | "unknown",
  "confidence": 0.0 ~ 1.0 (의도 분류 신뢰도),
  "data": {
    // intent가 "schedule"인 경우:
    "title": "일정 제목",
    "description": "상세 설명",
    "date": "YYYY-MM-DD 형식의 날짜 (오늘, 내일, 다음주 월요일 등 추론)",
    "time": "HH:MM 형식의 시간 (선택적)",
    "clientName": "거래처명 (언급된 경우)",
    "type": "미팅" | "전화" | "제안서" | "계약" | "견적" | "이메일"
    
    // intent가 "meeting"인 경우:
    "summary": "회의록 요약 (3-5줄)",
    "agenda": ["주요 안건 1", "주요 안건 2", ...],
    "decisions": ["결정 사항 1", "결정 사항 2", ...],
    "nextMeeting": {
      "date": "YYYY-MM-DD 형식의 날짜 (언급된 경우)",
      "time": "HH:MM 형식의 시간 (언급된 경우)",
      "topic": "다음 회의 주제 (언급된 경우)"
    } | null
    
    // intent가 "note"인 경우:
    "content": "메모 내용",
    "tags": ["태그1", "태그2", ...] (선택적)
    
    // intent가 "query"인 경우:
    "queryType": "clients" | "activities" | "sales" | "issues",
    "searchTerm": "검색어"
  }
}

**[중요 규칙]**
1. 날짜 표현("오늘", "내일", "다음주 월요일" 등)을 실제 날짜(YYYY-MM-DD)로 변환해주세요.
2. 시간이 언급되지 않으면 time 필드는 null로 설정하세요.
3. 거래처명이나 회사명이 언급되면 clientName에 포함하세요.
4. 의도가 불명확하면 intent를 "unknown"으로 설정하고 confidence를 0.5 이하로 설정하세요.
5. confidence는 0.0 ~ 1.0 사이의 숫자로 표현하세요.

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
    
    const parsed = JSON.parse(jsonText)
    return parsed
  } catch (error) {
    console.error('음성 의도 분류 오류:', error)
    throw error
  }
}

/**
 * 음성 명령 분석 (기존 함수 - 하위 호환성 유지)
 * @deprecated classifyVoiceIntent를 사용하세요
 * @param {string} transcript - 음성 인식된 텍스트
 * @returns {Promise<Object>} { type: 'schedule' | 'query' | 'unknown', action: string, data: object }
 */
export const analyzeVoiceCommand = async (transcript) => {
  try {
    const result = await classifyVoiceIntent(transcript)
    
    // 기존 형식으로 변환 (하위 호환성)
    return {
      type: result.intent === 'schedule' ? 'schedule' : result.intent === 'query' ? 'query' : 'unknown',
      action: result.data?.title || result.data?.summary || result.data?.content || '명령 처리',
      data: result.data
    }
  } catch (error) {
    console.error('음성 명령 분석 오류:', error)
    throw error
  }
}

/**
 * 회의록 요약 (Gemini API 사용)
 * @param {string} transcript - 회의록 전체 텍스트
 * @returns {Promise<Object>} { summary: string, agenda: string[], decisions: string[], nextMeeting: { date: string, time: string, topic: string } | null }
 */
export const summarizeMeeting = async (transcript) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('Gemini API 키가 설정되지 않았습니다.')
  }

  const prompt = `당신은 회의록 요약 전문가입니다. 다음 회의록을 분석하여 JSON 형식으로 응답해주세요.

**[응답 형식]**
{
  "summary": "회의록 전체 요약 (3-5줄)",
  "agenda": ["주요 안건 1", "주요 안건 2", ...],
  "decisions": ["결정 사항 1", "결정 사항 2", ...],
  "nextMeeting": {
    "date": "YYYY-MM-DD 형식의 날짜 (언급된 경우)",
    "time": "HH:MM 형식의 시간 (언급된 경우)",
    "topic": "다음 회의 주제 (언급된 경우)"
  } | null
}

**[중요 규칙]**
1. 날짜 표현을 실제 날짜로 변환하세요 (오늘: ${new Date().toISOString().split('T')[0]}, 내일: ${new Date(Date.now() + 86400000).toISOString().split('T')[0]} 등).
2. 다음 회의 일정이 언급되지 않으면 nextMeeting을 null로 설정하세요.
3. agenda와 decisions는 배열로 제공하되, 최대 5개까지만 포함하세요.
4. 모든 텍스트는 한국어로 작성하세요.

다음 회의록을 분석해주세요:
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

    // JSON 추출 및 안전한 파싱
    let jsonText = responseText.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '')
    }

    // JSON 객체 추출 시도 (여러 방법 시도)
    let parsed = null
    try {
      // 방법 1: 직접 파싱
      parsed = JSON.parse(jsonText)
    } catch (parseError1) {
      console.warn('[voiceAssistant] 직접 파싱 실패, JSON 객체 추출 시도:', parseError1.message)
      
      try {
        // 방법 2: JSON 객체 찾기 (중괄호 내부 추출)
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
        if (jsonMatch && jsonMatch[0]) {
          parsed = JSON.parse(jsonMatch[0])
          console.log('[voiceAssistant] JSON 객체 추출 성공')
        } else {
          throw new Error('JSON 객체를 찾을 수 없습니다.')
        }
      } catch (parseError2) {
        console.error('[voiceAssistant] JSON 파싱 완전 실패:', {
          originalError: parseError1.message,
          extractionError: parseError2.message,
          responseText: jsonText.substring(0, 200) + '...',
          timestamp: new Date().toISOString()
        })
        
        // 파싱 실패 시 기본 구조 반환 (안전장치)
        parsed = {
          summary: transcript.substring(0, 200) + '...',
          agenda: [],
          decisions: [],
          nextMeeting: null
        }
        console.warn('[voiceAssistant] 기본 구조 반환 (파싱 실패)')
      }
    }

    // 파싱된 결과 검증 및 안전한 반환
    if (!parsed || typeof parsed !== 'object') {
      console.warn('[voiceAssistant] 파싱된 결과가 유효하지 않음, 기본 구조 반환')
      return {
        summary: transcript.substring(0, 200) + '...',
        agenda: [],
        decisions: [],
        nextMeeting: null
      }
    }

    // 안전한 구조로 정규화
    return {
      summary: (typeof parsed.summary === 'string') ? parsed.summary : (transcript.substring(0, 200) + '...'),
      agenda: (Array.isArray(parsed.agenda)) ? parsed.agenda.filter(a => typeof a === 'string') : [],
      decisions: (Array.isArray(parsed.decisions)) ? parsed.decisions.filter(d => typeof d === 'string') : [],
      nextMeeting: (parsed.nextMeeting && typeof parsed.nextMeeting === 'object' && parsed.nextMeeting.date) 
        ? {
            date: (typeof parsed.nextMeeting.date === 'string') ? parsed.nextMeeting.date : null,
            time: (typeof parsed.nextMeeting.time === 'string') ? parsed.nextMeeting.time : null,
            topic: (typeof parsed.nextMeeting.topic === 'string') ? parsed.nextMeeting.topic : null
          }
        : null
    }
  } catch (error) {
    console.error('[voiceAssistant] 회의록 요약 오류:', {
      error: error.message,
      name: error.name,
      stack: error.stack,
      transcriptLength: transcript.length,
      timestamp: new Date().toISOString()
    })
    throw error
  }
}
