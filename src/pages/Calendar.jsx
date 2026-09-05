import React, { useMemo } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import { Calendar as CalendarIcon, MapPin, Phone } from 'lucide-react'
import koLocale from '@fullcalendar/core/locales/ko'
import { useData } from '../contexts/DataContext'
import { getHolidays } from '../utils/koreanHolidays'

const Calendar = () => {
    const { activities, loading } = useData()

    const events = useMemo(() => {
        // 1. Process Activities
        /*
         * **모든 일정이 `미팅 - No Title`로 떴다.**
         *
         * `activity.summary`를 제목으로 썼는데 `activities`에 그런 칸이 없다
         * (실제 컬럼은 `description`이다). 그래서 전부 'No Title'이 됐다.
         * 달력에서 정작 알아야 할 것은 **어느 거래처인지**다.
         *
         * 색 구분도 `'call'`·`'email'` 같은 영어로 보고 있었는데 저장된 값은
         * `미팅`·`전화`·`이메일`이라 **하나도 걸리지 않아 전부 파란색**이었다.
         */
        // 대시보드 달력(`ScheduleCalendar`)과 같은 계열로 맞춘다.
        // 예전에는 미팅·방문이 파랑이었다 — 브랜드와 상관없는 색이다.
        const COLOR = { 미팅: '#3e3a39', 방문: '#007538', 전화: '#8a6b00', 이메일: '#6b7280' }
        const activityEvents = activities?.map((activity) => {
            const color = COLOR[activity.type] || '#6b7280'
            const who = activity.clientName || activity.client_name || '거래처 없음'
            const memo = String(activity.description || '').replace(/\s+/g, ' ').trim()
            return {
                id: activity.id,
                title: `${who}${activity.type ? ` · ${activity.type}` : ''}`,
                date: String(activity.activity_date || activity.date || '').split('T')[0],
                backgroundColor: color,
                borderColor: color,
                // 마우스를 올리면 메모를 보여준다 (달력 칸에는 다 안 들어간다)
                extendedProps: { ...activity, memo: memo.slice(0, 300) },
            }
        }).filter((e) => e.date) || []

        // 2. Process Holidays
        const years = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1]
        const holidayEvents = years.flatMap(year =>
            getHolidays(year).map(holiday => ({
                id: `holiday-${holiday.date}`,
                title: holiday.name,
                date: holiday.date,
                display: 'block',
                backgroundColor: '#c81e1e', // 공휴일 빨강 — 흰 글씨가 4.5:1을 넘도록 #ef4444에서 한 단계 눌렀다
                borderColor: '#c81e1e',
                classNames: ['holiday-event']
            }))
        )

        return [...activityEvents, ...holidayEvents]
    }, [activities])

    return (
        <div className="p-6 bg-oem-bg-app font-['Noto_Sans_KR',sans-serif] text-oem-text-primary">
            <div className="max-w-[1600px] mx-auto bg-white rounded-lg shadow-sm border border-oem-border p-6">
                <div className="flex items-center gap-2 mb-6">
                    <CalendarIcon className="w-6 h-6 text-oem-blue" />
                    <h1 className="text-xl font-bold text-oem-text-primary">일정 · 공휴일</h1>
                </div>

                <div className="h-[800px]">
                    <FullCalendar
                        plugins={[dayGridPlugin, listPlugin, interactionPlugin]}
                        locale={koLocale}
                        initialView="dayGridMonth"
                        headerToolbar={{
                            left: 'prev,next today',
                            center: 'title',
                            right: 'dayGridMonth,listWeek'
                        }}
                        events={events} // Pass events directly
                        eventContent={(arg) => {
                            const isHoliday = arg.event.backgroundColor === '#c81e1e'
                            const memo = arg.event.extendedProps?.memo
                            return (
                                <div className={`text-xs px-1 overflow-hidden truncate ${isHoliday ? 'font-bold' : ''}`}
                                    title={memo ? `${arg.event.title}

${memo}` : arg.event.title}>
                                    {isHoliday ? '🇰🇷 ' : ''}{arg.event.title}
                                </div>
                            )
                        }}
                        height="100%"
                        dayMaxEvents={true}
                        weekends={true}
                    />
                </div>
            </div>
        </div>
    )
}

export default Calendar
