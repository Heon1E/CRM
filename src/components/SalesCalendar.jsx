import React, { useState, useEffect, useMemo, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import googleCalendarPlugin from '@fullcalendar/google-calendar'
import { X, Calendar as CalendarIcon, MapPin, AlignLeft, ChevronDown, ChevronUp } from 'lucide-react'
import { useData } from '../contexts/DataContext'

// ★ 구글 캘린더 설정
const USER_CALENDAR_ID = 'heoniree@gmail.com'
const GOOGLE_API_KEY = 'AIzaSyDXVuNub5XdidbF93KsOpVS2snr5tQprQM'
const HOLIDAY_CALENDAR_ID = 'ko.south_korea#holiday@group.v.calendar.google.com'

const SalesCalendar = () => {
  const { activities } = useData() || { activities: [] }
  const calendarRef = useRef(null)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [isMobile, setIsMobile] = useState(false)
  const [isDailySummaryOpen, setIsDailySummaryOpen] = useState(false)
  const [selectedDateEvents, setSelectedDateEvents] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [expandedEventId, setExpandedEventId] = useState(null)

  // 모바일 화면 감지 (768px 미만)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // 공휴일 & 기념일 판별
  const isRedDay = (title) => {
    const redKeywords = ['신정', '새해', '설날', '삼일절', '어린이날', '부처', '현충일', '광복절', '추석', '개천절', '한글날', '크리스마스', '성탄절', '선거', '대체공휴일'];
    return redKeywords && redKeywords.some(keyword => title.includes(keyword));
  }
  const isObservance = (title) => {
    const blackKeywords = ['섣달', '그믐', '이브', '발렌타인', '어버이', '스승', '제헌절', '국군', '빼빼로', '동지', '복날'];
    return blackKeywords && blackKeywords.some(keyword => title.includes(keyword));
  }

  // ★ [핵심 수정] 모달에서 저장한 변수명(next_action_date)과 정확히 일치시킴
  const crmEvents = useMemo(() => {
    const events = []
    
    if (activities && Array.isArray(activities)) {
      activities.forEach(activity => {
        // 1. 메인 영업 활동
        events.push({
          id: `crm-${activity.id}`,
          title: `[영업] ${activity.clientName || activity.title || '활동'}`, 
          start: activity.date || activity.activity_date,
          extendedProps: {
            description: activity.description || activity.notes,
            type: activity.type,
            location: activity.clientName,
            status: activity.status,
            isNextSchedule: false
          },
          source: { id: 'crm-source' }
        })

        // 2. 다음 일정 (Next Schedule) - 빨간색 표시용
        // ★ 여기를 AddActivityModal의 변수명(next_action_date)으로 수정했습니다.
        const nextDate = activity.next_action_date; 
        const nextContent = activity.next_action_detail;

        if (nextDate && nextContent) {
          events.push({
            id: `next-${activity.id}`,
            title: `[예정] ${nextContent}`, 
            start: nextDate,
            extendedProps: {
              description: `[${activity.clientName}] 관련 다음 일정입니다.\n내용: ${nextContent}`,
              location: activity.clientName,
              status: '예정',
              isNextSchedule: true // 빨간색 표시 트리거
            },
            source: { id: 'crm-source' }
          })
        }
      })
    }
    
    return events
  }, [activities])

  // 해당 날짜의 모든 이벤트를 가져오는 공통 함수
  const getEventsForDate = (dateStr) => {
    if (!calendarRef.current) return []
    
    const calendarApi = calendarRef.current.getApi()
    const startOfDay = new Date(dateStr + 'T00:00:00')
    const endOfDay = new Date(dateStr + 'T23:59:59')
    
    // FullCalendar의 getEvents()로 해당 날짜의 모든 이벤트 가져오기
    const allEvents = calendarApi.getEvents()
    
    // 해당 날짜에 포함된 이벤트 필터링
    const dayEvents = allEvents.filter(event => {
      const eventStart = event.start
      if (!eventStart) return false
      
      return eventStart >= startOfDay && eventStart <= endOfDay
    })
    
    // 시간순으로 정렬
    const sortedEvents = dayEvents.sort((a, b) => {
      const timeA = a.start ? a.start.getTime() : 0
      const timeB = b.start ? b.start.getTime() : 0
      return timeA - timeB
    })
    
    // 모달에 표시할 형식으로 변환
    return sortedEvents.map(event => {
      const sourceId = event.source?.id
      let sourceType = 'User'
      if (sourceId === 'crm-source') {
        sourceType = event.extendedProps?.isNextSchedule ? 'Next' : 'CRM'
      }
      if (sourceId === 'holiday-source' || sourceId === HOLIDAY_CALENDAR_ID) {
        sourceType = 'Holiday'
      }
      
      const eventStart = event.start
      let timeStr = '시간 미정'
      
      if (eventStart) {
        const hours = eventStart.getHours()
        const minutes = eventStart.getMinutes()
        
        if (hours !== 0 || minutes !== 0) {
          timeStr = eventStart.toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          })
        }
      }
      
      return {
        id: event.id,
        title: event.title,
        time: timeStr,
        start: eventStart,
        end: event.end,
        description: event.extendedProps?.description || '',
        location: event.extendedProps?.location || '',
        status: event.extendedProps?.status || '진행중',
        source: sourceType,
        isNextSchedule: event.extendedProps?.isNextSchedule || false
      }
    })
  }

  const handleEventClick = (info) => {
    info.jsEvent.preventDefault()
    
    // 모바일: 날짜 클릭과 동일하게 동작 (해당 날짜의 모든 일정 모달)
    if (isMobile) {
      const clickedDate = info.event.start ? info.event.start.toISOString().split('T')[0] : null
      if (clickedDate) {
        const dayEvents = getEventsForDate(clickedDate)
        setSelectedDateEvents(dayEvents)
        setSelectedDate(clickedDate)
        setExpandedEventId(null) // 아코디언 초기화
        setIsDailySummaryOpen(true)
      }
      return
    }
    
    // PC: 기존 상세 모달 유지
    const sourceId = info.event.source?.id;
    let sourceType = 'User'; 
    if (sourceId === 'crm-source') {
      sourceType = info.event.extendedProps.isNextSchedule ? 'Next' : 'CRM';
    }
    if (sourceId === 'holiday-source' || sourceId === HOLIDAY_CALENDAR_ID) sourceType = 'Holiday';

    setSelectedEvent({
      title: info.event.title,
      start: info.event.start,
      end: info.event.end,
      description: info.event.extendedProps.description,
      location: info.event.extendedProps.location,
      status: info.event.extendedProps.status,
      source: sourceType
    })
    setIsViewModalOpen(true)
  }

  // 날짜 클릭 시 해당 날짜의 모든 이벤트 가져오기
  const handleDateClick = (info) => {
    const clickedDate = info.dateStr // YYYY-MM-DD 형식
    
    // FullCalendar의 getEvents()를 사용하여 모든 이벤트 가져오기
    const dayEvents = getEventsForDate(clickedDate)
    
    setSelectedDateEvents(dayEvents)
    setSelectedDate(clickedDate)
    setExpandedEventId(null) // 아코디언 초기화
    setIsDailySummaryOpen(true)
  }

  const closeModal = () => {
    setIsViewModalOpen(false)
    setSelectedEvent(null)
  }

  const closeDailySummary = () => {
    setIsDailySummaryOpen(false)
    setSelectedDateEvents([])
    setSelectedDate(null)
    setExpandedEventId(null)
  }

  const toggleEventExpand = (eventId) => {
    setExpandedEventId(expandedEventId === eventId ? null : eventId)
  }

  return (
    <div className="relative">
      <style>{`
        .fc-day-sun a { color: #e11d48 !important; text-decoration: none; }
        .fc-day-sat a { color: #2563eb !important; text-decoration: none; }
        .fc-daygrid-day-number { color: #374151; padding: 4px 8px !important; font-weight: 500; }
        .fc-day-today { background-color: #f0f9ff !important; }
        .fc-day-today .fc-daygrid-day-number { color: #0284c7 !important; font-weight: 800; }
        .fc-toolbar-title { font-size: 1rem !important; font-weight: 800; color: #111827; }
        @media (min-width: 768px) {
          .fc-toolbar-title { font-size: 1.25rem !important; }
        }
        .fc-daygrid-event { background: transparent !important; border: none !important; margin-top: 1px !important; padding: 1px 2px !important; }
        .fc-daygrid-event:hover { background: #f3f4f6 !important; border-radius: 4px; }
        @media (max-width: 767px) {
          .fc-toolbar { padding: 0.5rem 0 !important; }
          .fc-button { padding: 0.25rem 0.5rem !important; font-size: 0.75rem !important; }
          .fc-toolbar-chunk { margin: 0 0.25rem !important; }
          /* 모바일에서 날짜 셀 높이 줄이기 */
          .fc-daygrid-day-frame { min-height: 60px !important; }
          .fc-daygrid-day { height: auto !important; min-height: 60px !important; }
          .fc-daygrid-day-number { padding: 2px 4px !important; font-size: 0.75rem !important; }
          .fc-col-header-cell { padding: 4px 2px !important; font-size: 0.75rem !important; }
          .fc-col-header-cell-cushion { padding: 2px !important; }
          /* 모바일 이벤트 점만 표시 */
          .fc-daygrid-event-harness { margin: 0 !important; }
          .fc-daygrid-event { margin: 1px 0 !important; padding: 0 !important; height: auto !important; }
        }
      `}</style>

      <div className="card p-4 md:p-6 bg-white rounded-xl shadow-sm border border-gray-100">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, interactionPlugin, googleCalendarPlugin]}
          initialView="dayGridMonth"
          locale="ko"
          headerToolbar={{
            left: 'prev',
            center: 'title',
            right: 'next today'
          }}
          height="auto"
          googleCalendarApiKey={GOOGLE_API_KEY}
          dateClick={handleDateClick}
          eventSources={[
            { events: crmEvents, id: 'crm-source' },
            { googleCalendarId: USER_CALENDAR_ID, id: 'user-source' },
            { googleCalendarId: HOLIDAY_CALENDAR_ID, id: 'holiday-source', editable: false }
          ]}
          eventClick={handleEventClick}
          
          eventContent={(arg) => {
            const sourceId = arg.event.source?.id;
            const title = arg.event.title;
            const props = arg.event.extendedProps;

            // 모바일: 점만 표시
            if (isMobile) {
              // A. 공휴일
              if (sourceId === 'holiday-source' || sourceId === HOLIDAY_CALENDAR_ID) {
                if (isRedDay(title)) return <div className="w-2 h-2 rounded-full bg-rose-500 mx-auto"></div>
                if (isObservance(title)) return <div className="w-2 h-2 rounded-full bg-gray-300 mx-auto"></div>
                return <div className="w-2 h-2 rounded-full bg-gray-400 mx-auto"></div>
              }

              // B. CRM 데이터
              if (sourceId === 'crm-source') {
                // 1. [다음 일정] - 빨간색 점
                if (props.isNextSchedule) {
                  return <div className="w-2 h-2 rounded-full bg-rose-500 mx-auto"></div>
                }
                // 2. [완료된 활동] - 회색 점
                if (props.status === '완료') {
                  return <div className="w-2 h-2 rounded-full bg-gray-400 mx-auto opacity-60"></div>
                }
                // 3. [진행중] - 초록색 점
                return <div className="w-2 h-2 rounded-full bg-emerald-500 mx-auto"></div>
              }

              // C. 구글 내 일정 (파란색 점)
              return <div className="w-2 h-2 rounded-full bg-blue-500 mx-auto"></div>
            }

            // PC: 기존 텍스트 + 점 형태
            // A. 공휴일
            if (sourceId === 'holiday-source' || sourceId === HOLIDAY_CALENDAR_ID) {
              if (isRedDay(title)) return <div className="text-xs font-bold text-rose-600 truncate">{title}</div>
              if (isObservance(title)) return <div className="text-xs text-gray-400 truncate">{title}</div>
              return <div className="text-xs text-gray-500 truncate">{title}</div>
            }

            // B. CRM 데이터
            if (sourceId === 'crm-source') {
              // 1. [다음 일정] - 빨간색 표시
              if (props.isNextSchedule) {
                return (
                  <div className="flex items-center w-full overflow-hidden">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1 shrink-0"></span>
                    <div className="text-xs font-bold text-rose-600 truncate">
                      {title}
                    </div>
                  </div>
                )
              }

              // 2. [완료된 활동] - 회색
              if (props.status === '완료') {
                return (
                  <div className="flex items-center w-full overflow-hidden opacity-60">
                     <span className="w-1.5 h-1.5 rounded-full bg-gray-400 mr-1 shrink-0"></span>
                    <div className="text-xs text-gray-400 truncate line-through decoration-gray-300">
                      {title}
                    </div>
                  </div>
                )
              }

              // 3. [진행중] - 초록색
              return (
                <div className="flex items-center w-full overflow-hidden">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 shrink-0"></span>
                  <div className="text-xs font-semibold text-emerald-700 truncate">
                    {title}
                  </div>
                </div>
              )
            }

            // C. 구글 내 일정 (파란색)
            return (
              <div className="flex items-center w-full overflow-hidden">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1 shrink-0"></span>
                <div className="text-xs font-semibold text-blue-600 truncate">
                  {title || "제목 없음"}
                </div>
              </div>
            )
          }}
        />
      </div>

      {/* 일일 일정 요약 모달 */}
      {isDailySummaryOpen && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 transition-opacity duration-200"
          onClick={closeDailySummary}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-blue-50 to-purple-50">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {selectedDate ? new Date(selectedDate).toLocaleDateString('ko-KR', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric',
                    weekday: 'long'
                  }) : '일정 요약'}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {selectedDateEvents.length}개의 일정
                </p>
              </div>
              <button 
                onClick={closeDailySummary} 
                className="text-gray-400 hover:text-gray-600 p-1 hover:bg-white/50 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-4">
              {selectedDateEvents.length > 0 ? (
                <div className="space-y-2">
                  {selectedDateEvents.map((event) => {
                    const isExpanded = expandedEventId === event.id
                    const isHoliday = event.source === 'Holiday'
                    const isRedHoliday = isHoliday && isRedDay(event.title)
                    
                    return (
                      <div
                        key={event.id}
                        className={`rounded-lg border transition-all duration-200 ${
                          event.source === 'Next' 
                            ? 'bg-rose-50 border-rose-200' 
                            : isHoliday
                            ? isRedHoliday
                              ? 'bg-rose-50 border-rose-200'
                              : 'bg-gray-50 border-gray-200'
                            : event.status === '완료'
                            ? 'bg-gray-50 border-gray-200 opacity-60'
                            : event.source === 'User'
                            ? 'bg-blue-50 border-blue-200'
                            : 'bg-emerald-50 border-emerald-200'
                        } ${isExpanded ? 'shadow-md' : ''}`}
                      >
                        {/* 제목 클릭 영역 */}
                        <button
                          onClick={() => toggleEventExpand(event.id)}
                          className="w-full p-3 flex items-center justify-between gap-2 hover:bg-white/50 transition-colors rounded-lg"
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${
                              event.source === 'Next' 
                                ? 'bg-rose-500' 
                                : isHoliday
                                ? isRedHoliday
                                  ? 'bg-rose-500'
                                  : 'bg-gray-400'
                                : event.status === '완료'
                                ? 'bg-gray-400'
                                : event.source === 'User'
                                ? 'bg-blue-500'
                                : 'bg-emerald-500'
                            }`}></span>
                            <p className={`text-sm font-medium text-left truncate ${
                              event.status === '완료' 
                                ? 'text-gray-400 line-through' 
                                : isHoliday && isRedHoliday
                                ? 'text-rose-600 font-bold'
                                : isHoliday
                                ? 'text-gray-600'
                                : 'text-gray-900'
                            }`}>
                              {event.title}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {event.time !== '시간 미정' && (
                              <span className={`text-xs font-semibold ${
                                event.source === 'Next' 
                                  ? 'text-rose-700' 
                                  : event.status === '완료'
                                  ? 'text-gray-500'
                                  : event.source === 'User'
                                  ? 'text-blue-700'
                                  : 'text-emerald-700'
                              }`}>
                                {event.time}
                              </span>
                            )}
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-gray-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-gray-400" />
                            )}
                          </div>
                        </button>

                        {/* 아코디언 상세 내용 */}
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-0 border-t border-gray-200/50 mt-2 animate-in slide-in-from-top-2 duration-200">
                            <div className="pt-3 space-y-3">
                              {/* 시간 */}
                              {event.time !== '시간 미정' && (
                                <div className="flex items-start gap-3">
                                  <CalendarIcon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                                  <div className="flex-1">
                                    <p className="text-xs text-gray-500 mb-0.5">일시</p>
                                    <p className="text-sm font-semibold text-gray-900">
                                      {event.start?.toLocaleDateString('ko-KR', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric',
                                        weekday: 'short'
                                      })}
                                      {event.time !== '시간 미정' && ` ${event.time}`}
                                    </p>
                                  </div>
                                </div>
                              )}
                              
                              {/* 장소 */}
                              {event.location && (
                                <div className="flex items-start gap-3">
                                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                                  <div className="flex-1">
                                    <p className="text-xs text-gray-500 mb-0.5">장소/거래처</p>
                                    <p className="text-sm text-gray-700">{event.location}</p>
                                  </div>
                                </div>
                              )}
                              
                              {/* 설명 */}
                              {event.description && (
                                <div className="flex items-start gap-3">
                                  <AlignLeft className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                                  <div className="flex-1">
                                    <p className="text-xs text-gray-500 mb-0.5">상세 내용</p>
                                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                                      {event.description}
                                    </p>
                                  </div>
                                </div>
                              )}
                              
                              {/* 상태 (CRM일 경우에만) */}
                              {event.source === 'CRM' && event.status && (
                                <div className="flex items-center gap-2 pt-1">
                                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                    event.status === '완료'
                                      ? 'bg-gray-200 text-gray-600'
                                      : event.status === '진행중'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-amber-100 text-amber-700'
                                  }`}>
                                    {event.status}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 text-sm">
                  해당 날짜에 등록된 일정이 없습니다.
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 flex justify-end border-t border-gray-100">
              <button 
                onClick={closeDailySummary} 
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 이벤트 상세 모달 팝업 */}
      {isViewModalOpen && selectedEvent && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 transition-opacity duration-200"
          onClick={closeModal}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`px-6 py-4 border-b border-gray-100 flex justify-between items-start 
              ${selectedEvent.source === 'Holiday' ? 'bg-rose-50' : 
                selectedEvent.source === 'Next' ? 'bg-rose-50' :
                selectedEvent.status === '완료' ? 'bg-gray-50' :
                selectedEvent.source === 'CRM' ? 'bg-emerald-50' : 'bg-blue-50'}`}>
              
              <h3 className={`text-lg font-bold flex items-center gap-2 
                ${selectedEvent.source === 'Holiday' || selectedEvent.source === 'Next' ? 'text-rose-600' : 
                  selectedEvent.status === '완료' ? 'text-gray-500' :
                  selectedEvent.source === 'CRM' ? 'text-emerald-700' : 'text-blue-700'}`}>
                
                {selectedEvent.source === 'Next' && <span className="text-xs border border-rose-200 bg-white px-1.5 rounded">다음 일정</span>}
                {selectedEvent.status === '완료' && <span className="text-xs border border-gray-200 bg-white px-1.5 rounded">완료됨</span>}
                {selectedEvent.source === 'User' && <span className="text-xs border border-blue-200 bg-white px-1.5 rounded">구글일정</span>}
                {selectedEvent.title}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-black/5 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex items-start gap-3">
                <CalendarIcon className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {selectedEvent.start?.toLocaleDateString()}
                    {!selectedEvent.start?.toString().includes('00:00:00') && 
                     selectedEvent.start?.getHours() !== 0 &&
                     ` ${selectedEvent.start?.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">일정 일시</p>
                </div>
              </div>
              
              {selectedEvent.description && (
                <div className="flex items-start gap-3">
                  <AlignLeft className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{selectedEvent.description}</p>
                    <p className="text-xs text-gray-500 mt-1">상세 내용</p>
                  </div>
                </div>
              )}

              {selectedEvent.location && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-700">{selectedEvent.location}</p>
                    <p className="text-xs text-gray-500 mt-1">장소/거래처</p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 flex justify-end border-t border-gray-100">
              <button onClick={closeModal} className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SalesCalendar