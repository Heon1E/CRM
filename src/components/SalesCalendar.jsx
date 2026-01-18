import React, { useState, useEffect, useMemo, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import googleCalendarPlugin from '@fullcalendar/google-calendar'
import { X, Calendar as CalendarIcon, MapPin, AlignLeft, ChevronDown, ChevronUp } from 'lucide-react'
import { useData } from '../contexts/DataContext'

// ??구�? 캘린???�정
const USER_CALENDAR_ID = 'heoniree@gmail.com'
const GOOGLE_API_KEY = 'AIzaSyDXVuNub5XdidbF93KsOpVS2snr5tQprQM'
const HOLIDAY_CALENDAR_ID = 'ko.south_korea#holiday@group.v.calendar.google.com'

const SalesCalendar = ({ embedded = false, className = '', loading = false, onDateSelect }) => {
  const { activities } = useData() || { activities: [] }
  const calendarRef = useRef(null)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [isMobile, setIsMobile] = useState(false)
  const [isDailySummaryOpen, setIsDailySummaryOpen] = useState(false)
  const [selectedDateEvents, setSelectedDateEvents] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [expandedEventId, setExpandedEventId] = useState(null)

  // 모바???�면 감�? (768px 미만)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // 공휴??& 기념???�별
  const isRedDay = (title) => {
    const redKeywords = ['?�정', '?�해', '?�날', '?�일??, '?�린?�날', '부�?, '?�충??, '광복??, '추석', '개천??, '?��???, '?�리?�마??, '?�탄??, '?�거', '?�체공?�일'];
    return redKeywords && redKeywords.some(keyword => title.includes(keyword));
  }
  const isObservance = (title) => {
    const blackKeywords = ['?�달', '그믐', '?�브', '발렌?�??, '?�버??, '?�승', '?�헌??, '�?��', '빼빼�?, '?��?', '복날'];
    return blackKeywords && blackKeywords.some(keyword => title.includes(keyword));
  }

  // ??[?�심 ?�정] 모달?�서 ?�?�한 변?�명(next_action_date)�??�확???�치?�킴
  const crmEvents = useMemo(() => {
    const events = []
    
    if (activities && Array.isArray(activities)) {
      activities.forEach(activity => {
        // 1. 메인 ?�업 ?�동
        events.push({
          id: `crm-${activity.id}`,
          title: `[?�업] ${activity.clientName || activity.title || '?�동'}`, 
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

        // 2. ?�음 ?�정 (Next Schedule) - 빨간???�시??        // ???�기�?AddActivityModal??변?�명(next_action_date)?�로 ?�정?�습?�다.
        const nextDate = activity.next_action_date; 
        const nextContent = activity.next_action_detail;

        if (nextDate && nextContent) {
          events.push({
            id: `next-${activity.id}`,
            title: `[?�정] ${nextContent}`, 
            start: nextDate,
            extendedProps: {
              description: `[${activity.clientName}] 관???�음 ?�정?�니??\n?�용: ${nextContent}`,
              location: activity.clientName,
              status: '?�정',
              isNextSchedule: true // 빨간???�시 ?�리�?            },
            source: { id: 'crm-source' }
          })
        }
      })
    }
    
    return events
  }, [activities])

  // ?�당 ?�짜??모든 ?�벤?��? 가?�오??공통 ?�수
  const getEventsForDate = (dateStr) => {
    if (!calendarRef.current) return []
    
    const calendarApi = calendarRef.current.getApi()
    const startOfDay = new Date(dateStr + 'T00:00:00')
    const endOfDay = new Date(dateStr + 'T23:59:59')
    
    // FullCalendar??getEvents()�??�당 ?�짜??모든 ?�벤??가?�오�?    const allEvents = calendarApi.getEvents()
    
    // ?�당 ?�짜???�함???�벤???�터�?    const dayEvents = allEvents.filter(event => {
      const eventStart = event.start
      if (!eventStart) return false
      
      return eventStart >= startOfDay && eventStart <= endOfDay
    })
    
    // ?�간?�으�??�렬
    const sortedEvents = dayEvents.sort((a, b) => {
      const timeA = a.start ? a.start.getTime() : 0
      const timeB = b.start ? b.start.getTime() : 0
      return timeA - timeB
    })
    
    // 모달???�시???�식?�로 변??    return sortedEvents.map(event => {
      const sourceId = event.source?.id
      let sourceType = 'User'
      if (sourceId === 'crm-source') {
        sourceType = event.extendedProps?.isNextSchedule ? 'Next' : 'CRM'
      }
      if (sourceId === 'holiday-source' || sourceId === HOLIDAY_CALENDAR_ID) {
        sourceType = 'Holiday'
      }
      
      const eventStart = event.start
      let timeStr = '?�간 미정'
      
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
        status: event.extendedProps?.status || '진행�?,
        source: sourceType,
        isNextSchedule: event.extendedProps?.isNextSchedule || false
      }
    })
  }

  const handleEventClick = (info) => {
    info.jsEvent.preventDefault()
    
    // 모바?? ?�짜 ?�릭�??�일?�게 ?�작 (?�당 ?�짜??모든 ?�정 모달)
    if (isMobile) {
      const clickedDate = info.event.start ? info.event.start.toISOString().split('T')[0] : null
      if (clickedDate) {
        const dayEvents = getEventsForDate(clickedDate)
        setSelectedDateEvents(dayEvents)
        setSelectedDate(clickedDate)
        setExpandedEventId(null) // ?�코?�언 초기??        setIsDailySummaryOpen(true)
      }
      return
    }
    
    // PC: 기존 ?�세 모달 ?��?
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

  // ?�짜 ?�릭 ???�당 ?�짜??모든 ?�벤??가?�오�?  const handleDateClick = (info) => {
    const clickedDate = info.dateStr // YYYY-MM-DD ?�식

    if (typeof onDateSelect === 'function') {
      onDateSelect(clickedDate)
      return
    }

    // FullCalendar??getEvents()�??�용?�여 모든 ?�벤??가?�오�?    const dayEvents = getEventsForDate(clickedDate)
    
    setSelectedDateEvents(dayEvents)
    setSelectedDate(clickedDate)
    setExpandedEventId(null) // ?�코?�언 초기??    setIsDailySummaryOpen(true)
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

  if (loading) {
    return (
      <div className="relative">
        <div
          className={
            embedded
              ? `w-full ${className}`
              : 'card p-3 md:p-6 bg-[#1E1E1E] rounded-xl border border-gray-800'
          }
        >
          <div className="w-full h-full min-h-[320px] bg-white/5 rounded-lg animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <style>{`
        .fc-day-sun a { color: #f87171 !important; text-decoration: none; }
        .fc-day-sat a { color: #60a5fa !important; text-decoration: none; }
        .fc-daygrid-day-number { color: #94a3b8; padding: 4px 8px !important; font-weight: 500; }
        .fc-scrollgrid table { table-layout: fixed !important; }
        .fc-daygrid-day { min-height: 80px !important; }
        .fc-daygrid-day-frame { min-height: 80px !important; }
        .fc-day-today { background-color: #1b2338 !important; }
        .fc-day-today .fc-daygrid-day-number { color: #4a90e2 !important; font-weight: 800; }
        .fc-toolbar-title { font-size: 1rem !important; font-weight: 800; color: #e0e0e0; }
        @media (min-width: 768px) {
          .fc-toolbar-title { font-size: 1.25rem !important; }
        }
        .fc-daygrid-event { background: transparent !important; border: none !important; margin-top: 1px !important; padding: 1px 2px !important; }
        .fc-daygrid-event:hover { background: #1b2338 !important; border-radius: 4px; }
        .calendar-compact .fc { height: 100% !important; }
        .calendar-compact .fc-view-harness,
        .calendar-compact .fc-view-harness-active,
        .calendar-compact .fc-scrollgrid,
        .calendar-compact .fc-daygrid-body {
          height: 100% !important;
          min-height: 220px !important;
        }
        .calendar-compact .fc-scroller {
          height: 100% !important;
        }
        .calendar-compact .fc-daygrid-day,
        .calendar-compact .fc-daygrid-day-frame { min-height: 48px !important; }
        .calendar-compact .fc-daygrid-day-number { font-size: 0.75rem !important; }
        .calendar-compact .fc-daygrid-day-events { min-height: 8px !important; }
        .calendar-compact .fc-toolbar { margin-bottom: 6px !important; padding: 4px 0 !important; }
        .calendar-compact .fc-button { padding: 0.25rem 0.5rem !important; min-height: 28px !important; }
        .calendar-compact .fc-col-header-cell { padding: 0.25rem 0.125rem !important; }
        @media (max-width: 767px) {
          /* 1. ?�중 ?�크�??�거: 모든 고정 ?�이?� ?�크�??�성 ?�거 */
          .fc-dayGridMonth-view { height: auto !important; }
          .fc-scroller { overflow: visible !important; height: auto !important; }
          .fc-scroller-liquid-absolute { position: relative !important; }
          .fc-daygrid-body { height: auto !important; }
          .fc-view-harness { height: auto !important; }
          
          /* 2. ?�력 ?�더(?????�시) ?�백 최소??*/
          .fc-toolbar { padding: 0.5rem 0 !important; margin-bottom: 0.25rem !important; }
          .fc-button { padding: 0.25rem 0.5rem !important; font-size: 0.75rem !important; min-height: 28px !important; }
          .fc-toolbar-chunk { margin: 0 0.2rem !important; }
          .fc-toolbar-title { font-size: 0.875rem !important; line-height: 1.2 !important; margin: 0 !important; }
          
          /* 3. ?�일 ?�시 ??th) ?�백 최소??*/
          .fc-col-header { padding: 0 !important; margin: 0 !important; }
          .fc-col-header-cell { padding: 0.25rem 0.125rem !important; font-size: 0.7rem !important; font-weight: 600 !important; line-height: 1 !important; }
          .fc-col-header-cell-cushion { padding: 0 !important; }
          
          /* 4. ?�짜 ?� ?�이 고정 (h-14 = 56px) �?Flexbox ?�이?�웃 ?�용 */
          .fc-daygrid-day { height: 56px !important; min-height: 56px !important; max-height: 56px !important; }
          .fc-daygrid-day-frame { 
            min-height: 56px !important; 
            max-height: 56px !important; 
            height: 56px !important;
            padding: 2px 4px !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: flex-start !important;
          }
          .fc-daygrid-day-top { 
            padding-top: 4px !important;  /* pt-1�??�사???�백 */
            padding-bottom: 0 !important;
            width: 100% !important;
            display: flex !important;
            justify-content: flex-start !important;
            align-items: center !important;
          }
          .fc-daygrid-day-number { 
            padding: 0 4px !important; 
            font-size: 0.7rem !important; 
            line-height: 1.2 !important;
            align-self: flex-start !important;
            font-weight: 500 !important;
          }
          
          /* 5. ?�벤???�역: ?�짜 ?�래???�들??가�?중앙 ?�렬 (mt-1�??�사???�백) */
          .fc-daygrid-day-events { 
            margin-top: 4px !important;  /* mt-1�??�사???�백 */
            margin-bottom: 0 !important;
            display: flex !important;
            flex-wrap: wrap !important;
            justify-content: center !important;
            align-items: center !important;
            gap: 2px !important;  /* gap-0.5?� ?�사??간격 */
            width: 100% !important;
            min-height: 6px !important;
            max-height: 12px !important;
          }
          .fc-daygrid-event-harness { 
            margin: 0 !important;
            flex-shrink: 0 !important;
          }
          .fc-daygrid-event { 
            margin: 0 !important; 
            padding: 0 !important; 
            height: auto !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
          }
          .fc-daygrid-event-dot { 
            width: 6px !important; 
            height: 6px !important; 
            border-radius: 50% !important;
            margin: 0 auto !important;
          }
          
          /* 6. �?week) ???�백 고정 */
          .fc-daygrid-week { min-height: 56px !important; max-height: 56px !important; }
          .fc-daygrid-week-numbers { display: none !important; }
          
          /* 7. ?�력 ?�체 컨테?�너 ?�연?�러???�이 */
          .fc { height: auto !important; }
          .fc-view-harness-active > .fc-dayGridMonth-view { height: auto !important; }
        }
      `}</style>

      <div
        className={
          embedded
            ? `w-full ${className}`
            : 'card p-3 md:p-6 bg-[#1E1E1E] rounded-xl border border-gray-800'
        }
      >
        {/* 모바?? ?�중 ?�크�??�거�??�해 ?�퍼 ?�거, ?�연?�러???�이 ?�용 */}
        <div className="w-full">
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
            height={embedded ? '100%' : 'auto'}
            contentHeight={embedded ? '100%' : 'auto'}
            expandRows={embedded}
            googleCalendarApiKey={GOOGLE_API_KEY}
            dateClick={handleDateClick}
            dayCellClassNames={() => (onDateSelect ? ['cursor-pointer', 'hover:bg-white/5'] : [])}
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

            // 모바?? ?�만 ?�시 (?�기 �??�렬 개선)
            if (isMobile) {
              // A. 공휴??              if (sourceId === 'holiday-source' || sourceId === HOLIDAY_CALENDAR_ID) {
                if (isRedDay(title)) {
                  return <div className="w-1.5 h-1.5 rounded-full bg-rose-400 mx-auto flex-shrink-0"></div>
                }
                if (isObservance(title)) {
                  return <div className="w-1.5 h-1.5 rounded-full bg-white/30 mx-auto flex-shrink-0"></div>
                }
                return <div className="w-1.5 h-1.5 rounded-full bg-white/40 mx-auto flex-shrink-0"></div>
              }

              // B. CRM ?�이??              if (sourceId === 'crm-source') {
                // 1. [?�음 ?�정] - 빨간????                if (props.isNextSchedule) {
                  return <div className="w-1.5 h-1.5 rounded-full bg-rose-400 mx-auto flex-shrink-0"></div>
                }
                // 2. [?�료???�동] - ?�색 ??                if (props.status === '?�료') {
                  return <div className="w-1.5 h-1.5 rounded-full bg-white/40 mx-auto opacity-60 flex-shrink-0"></div>
                }
                // 3. [진행�? - 초록????                return <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mx-auto flex-shrink-0"></div>
              }

              // C. 구�? ???�정 (?��?????
              return <div className="w-1.5 h-1.5 rounded-full bg-white/40 mx-auto flex-shrink-0"></div>
            }

            // PC: 기존 ?�스??+ ???�태
            // A. 공휴??            if (sourceId === 'holiday-source' || sourceId === HOLIDAY_CALENDAR_ID) {
              if (isRedDay(title)) return <div className="text-xs font-bold text-rose-400 truncate">{title}</div>
              if (isObservance(title)) return <div className="text-xs text-gray-300 truncate">{title}</div>
              return <div className="text-xs text-gray-300 truncate">{title}</div>
            }

            // B. CRM ?�이??            if (sourceId === 'crm-source') {
              // 1. [?�음 ?�정] - 빨간???�시
              if (props.isNextSchedule) {
                return (
                  <div className="flex items-center w-full overflow-hidden">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mr-1 shrink-0"></span>
                    <div className="text-xs font-bold text-rose-400 truncate">
                      {title}
                    </div>
                  </div>
                )
              }

              // 2. [?�료???�동] - ?�색
              if (props.status === '?�료') {
                return (
                  <div className="flex items-center w-full overflow-hidden opacity-60">
                     <span className="w-1.5 h-1.5 rounded-full bg-white/40 mr-1 shrink-0"></span>
                    <div className="text-xs text-gray-300 truncate line-through decoration-white/30">
                      {title}
                    </div>
                  </div>
                )
              }

              // 3. [진행�? - 초록??              return (
                <div className="flex items-center w-full overflow-hidden">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 shrink-0"></span>
                  <div className="text-xs font-semibold text-emerald-200 truncate">
                    {title}
                  </div>
                </div>
              )
            }

            // C. 구�? ???�정 (?��???
            return (
              <div className="flex items-center w-full overflow-hidden">
                <span className="w-1.5 h-1.5 rounded-full bg-white/40 mr-1 shrink-0"></span>
                <div className="text-xs font-semibold text-gray-300 truncate">
                  {title || "?�목 ?�음"}
                </div>
              </div>
            )
          }}
        />
        </div>
      </div>

      {/* ?�일 ?�정 ?�약 모달 */}
      {isDailySummaryOpen && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 transition-opacity duration-200"
          onClick={closeDailySummary}
        >
          <div 
            className="bg-[#1E1E1E] border border-gray-800 rounded-2xl w-full max-w-md overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 md:px-6 md:py-4 border-b border-gray-800 flex justify-between items-center bg-white/5">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {selectedDate ? new Date(selectedDate).toLocaleDateString('ko-KR', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric',
                    weekday: 'long'
                  }) : '?�정 ?�약'}
                </h3>
                <p className="text-xs text-gray-300 mt-1">
                  {selectedDateEvents.length}개의 ?�정
                </p>
              </div>
              <button 
                onClick={closeDailySummary} 
                className="text-gray-300 hover:text-white p-1 hover:bg-white/5 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-4 md:p-5">
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
                            ? 'bg-rose-400/10 border-rose-400/30' 
                            : isHoliday
                            ? isRedHoliday
                              ? 'bg-rose-400/10 border-rose-400/30'
                              : 'bg-white/5 border-gray-800'
                            : event.status === '?�료'
                            ? 'bg-white/5 border-gray-800 opacity-60'
                            : event.source === 'User'
                            ? 'bg-white/5 border-gray-800'
                            : 'bg-emerald-400/10 border-emerald-400/30'
                        } ${isExpanded ? 'shadow-soft' : ''}`}
                      >
                        {/* ?�목 ?�릭 ?�역 */}
                        <button
                          onClick={() => toggleEventExpand(event.id)}
                          className="w-full p-3 flex items-center justify-between gap-2 hover:bg-white/5 transition-colors rounded-lg"
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${
                              event.source === 'Next' 
                                ? 'bg-rose-400' 
                                : isHoliday
                                ? isRedHoliday
                                  ? 'bg-rose-400'
                                  : 'bg-white/40'
                                : event.status === '?�료'
                                ? 'bg-white/40'
                                : event.source === 'User'
                                ? 'bg-white/40'
                                : 'bg-emerald-400'
                            }`}></span>
                            <p className={`text-sm font-medium text-left truncate ${
                              event.status === '?�료' 
                                ? 'text-gray-300 line-through' 
                                : isHoliday && isRedHoliday
                                ? 'text-rose-200 font-bold'
                                : isHoliday
                                ? 'text-gray-300'
                                : 'text-white'
                            }`}>
                              {event.title}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {event.time !== '?�간 미정' && (
                              <span className={`text-xs font-semibold ${
                                event.source === 'Next' 
                                  ? 'text-rose-200' 
                                  : event.status === '?�료'
                                  ? 'text-gray-300'
                                  : event.source === 'User'
                                  ? 'text-gray-300'
                                  : 'text-emerald-200'
                              }`}>
                                {event.time}
                              </span>
                            )}
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-gray-300" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-gray-300" />
                            )}
                          </div>
                        </button>

                        {/* ?�코?�언 ?�세 ?�용 */}
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-0 border-t border-gray-800 mt-2 animate-in slide-in-from-top-2 duration-200">
                            <div className="pt-3 space-y-3">
                              {/* ?�간 */}
                              {event.time !== '?�간 미정' && (
                                <div className="flex items-start gap-3">
                                  <CalendarIcon className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" />
                                  <div className="flex-1">
                                    <p className="text-xs text-gray-300 mb-0.5">?�시</p>
                                    <p className="text-sm font-semibold text-white">
                                      {event.start?.toLocaleDateString('ko-KR', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric',
                                        weekday: 'short'
                                      })}
                                      {event.time !== '?�간 미정' && ` ${event.time}`}
                                    </p>
                                  </div>
                                </div>
                              )}
                              
                              {/* ?�소 */}
                              {event.location && (
                                <div className="flex items-start gap-3">
                                  <MapPin className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" />
                                  <div className="flex-1">
                                    <p className="text-xs text-gray-300 mb-0.5">?�소/거래�?/p>
                                    <p className="text-sm text-gray-300">{event.location}</p>
                                  </div>
                                </div>
                              )}
                              
                              {/* ?�명 */}
                              {event.description && (
                                <div className="flex items-start gap-3">
                                  <AlignLeft className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" />
                                  <div className="flex-1">
                                    <p className="text-xs text-gray-300 mb-0.5">?�세 ?�용</p>
                                    <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                                      {event.description}
                                    </p>
                                  </div>
                                </div>
                              )}
                              
                              {/* ?�태 (CRM??경우?�만) */}
                              {event.source === 'CRM' && event.status && (
                                <div className="flex items-center gap-2 pt-1">
                                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                    event.status === '?�료'
                                      ? 'bg-white/10 text-gray-300'
                                      : event.status === '진행�?
                                      ? 'bg-emerald-400/20 text-emerald-200'
                                      : 'bg-amber-400/20 text-amber-200'
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
                <div className="text-center py-8 text-gray-300 text-sm">
                  ?�당 ?�짜???�록???�정???�습?�다.
                </div>
              )}
            </div>

            <div className="px-4 py-3 md:px-6 md:py-4 bg-white/5 flex justify-end border-t border-gray-800">
              <button 
                onClick={closeDailySummary} 
                className="btn-secondary px-4 py-2 text-sm font-medium"
              >
                ?�기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ?�벤???�세 모달 ?�업 */}
      {isViewModalOpen && selectedEvent && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 transition-opacity duration-200"
          onClick={closeModal}
        >
          <div 
            className="bg-[#1E1E1E] border border-gray-800 rounded-2xl w-full max-w-md overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`px-4 py-3 md:px-6 md:py-4 border-b border-gray-800 flex justify-between items-start 
              ${selectedEvent.source === 'Holiday' ? 'bg-rose-400/10' : 
                selectedEvent.source === 'Next' ? 'bg-rose-400/10' :
                selectedEvent.status === '?�료' ? 'bg-white/5' :
                selectedEvent.source === 'CRM' ? 'bg-emerald-400/10' : 'bg-white/5'}`}>
              
              <h3 className={`text-lg font-semibold flex items-center gap-2 
                ${selectedEvent.source === 'Holiday' || selectedEvent.source === 'Next' ? 'text-rose-200' : 
                  selectedEvent.status === '?�료' ? 'text-gray-300' :
                  selectedEvent.source === 'CRM' ? 'text-emerald-200' : 'text-gray-300'}`}>
                
                {selectedEvent.source === 'Next' && <span className="text-xs border border-rose-500/40 bg-white/5 px-1.5 rounded">?�음 ?�정</span>}
                {selectedEvent.status === '?�료' && <span className="text-xs border border-gray-800 bg-white/5 px-1.5 rounded">?�료??/span>}
                {selectedEvent.source === 'User' && <span className="text-xs border border-gray-800 bg-white/5 px-1.5 rounded">구�??�정</span>}
                {selectedEvent.title}
              </h3>
              <button onClick={closeModal} className="text-gray-300 hover:text-white p-1 hover:bg-white/5 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 md:p-6 space-y-5">
              <div className="flex items-start gap-3">
                <CalendarIcon className="w-5 h-5 text-gray-300 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-white">
                    {selectedEvent.start?.toLocaleDateString()}
                    {!selectedEvent.start?.toString().includes('00:00:00') && 
                     selectedEvent.start?.getHours() !== 0 &&
                     ` ${selectedEvent.start?.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`}
                  </p>
                  <p className="text-xs text-gray-300 mt-0.5">?�정 ?�시</p>
                </div>
              </div>
              
              {selectedEvent.description && (
                <div className="flex items-start gap-3">
                  <AlignLeft className="w-5 h-5 text-gray-300 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{selectedEvent.description}</p>
                    <p className="text-xs text-gray-300 mt-1">?�세 ?�용</p>
                  </div>
                </div>
              )}

              {selectedEvent.location && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-gray-300 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-300">{selectedEvent.location}</p>
                    <p className="text-xs text-gray-300 mt-1">?�소/거래�?/p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-4 py-3 md:px-6 md:py-4 bg-white/5 flex justify-end border-t border-gray-800">
              <button onClick={closeModal} className="btn-secondary px-4 py-2 text-sm font-medium">
                ?�기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SalesCalendar





