import React, { useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import googleCalendarPlugin from '@fullcalendar/google-calendar'
import { X, Calendar as CalendarIcon, MapPin, AlignLeft } from 'lucide-react'
import { useData } from '../contexts/DataContext'

// ★ 구글 캘린더 설정
const USER_CALENDAR_ID = 'heoniree@gmail.com'
const GOOGLE_API_KEY = 'AIzaSyDXVuNub5XdidbF93KsOpVS2snr5tQprQM'
const HOLIDAY_CALENDAR_ID = 'ko.south_korea#holiday@group.v.calendar.google.com'

const SalesCalendar = () => {
  const { activities } = useData() || { activities: [] }
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)

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
  const crmEvents = []
  
  if (activities && Array.isArray(activities)) {
    activities.forEach(activity => {
      // 1. 메인 영업 활동
      crmEvents.push({
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
        crmEvents.push({
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

  const handleEventClick = (info) => {
    info.jsEvent.preventDefault()
    
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

  const handleDateClick = (info) => {
    // 여기에 일정 추가 모달 연결 가능
    // props.onAddActivity(info.dateStr); 
  }

  const closeModal = () => {
    setIsViewModalOpen(false)
    setSelectedEvent(null)
  }

  return (
    <div className="relative">
      <style>{`
        .fc-day-sun a { color: #e11d48 !important; text-decoration: none; }
        .fc-day-sat a { color: #2563eb !important; text-decoration: none; }
        .fc-daygrid-day-number { color: #374151; padding: 4px 8px !important; font-weight: 500; }
        .fc-day-today { background-color: #f0f9ff !important; }
        .fc-day-today .fc-daygrid-day-number { color: #0284c7 !important; font-weight: 800; }
        .fc-toolbar-title { font-size: 1.25rem !important; font-weight: 800; color: #111827; }
        .fc-daygrid-event { background: transparent !important; border: none !important; margin-top: 1px !important; padding: 1px 2px !important; }
        .fc-daygrid-event:hover { background: #f3f4f6 !important; border-radius: 4px; }
      `}</style>

      <div className="card p-6 bg-white rounded-xl shadow-sm border border-gray-100">
        <FullCalendar
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

      {/* 모달 팝업 */}
      {isViewModalOpen && selectedEvent && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
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