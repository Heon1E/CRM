import React, { useMemo } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import { Calendar as CalendarIcon, MapPin, Phone } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { getHolidays } from '../utils/koreanHolidays'

const Calendar = () => {
    const { activities, loading } = useData()

    const events = useMemo(() => {
        // 1. Process Activities
        const activityEvents = activities?.map((activity) => {
            let color = '#3b82f6' // blue default
            if (String(activity.type).toLowerCase().includes('call')) color = '#10b981' // green
            if (String(activity.type).toLowerCase().includes('email')) color = '#f59e0b' // yellow

            return {
                id: activity.id,
                title: `${activity.type?.toUpperCase() || 'ACTIVITY'} - ${activity.summary || 'No Title'}`,
                date: activity.activity_date?.split('T')[0],
                backgroundColor: color,
                borderColor: color,
                extendedProps: { ...activity }
            }
        }) || []

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
        <div className="p-6 bg-oem-bg-app font-['Noto_Sans_KR',sans-serif] text-oem-text-primary mt-[50px] min-h-screen">
            <div className="max-w-[1600px] mx-auto bg-white rounded-lg shadow-sm border border-oem-border p-6">
                <div className="flex items-center gap-2 mb-6">
                    <CalendarIcon className="w-6 h-6 text-oem-blue" />
                    <h1 className="text-xl font-bold text-oem-text-primary">Schedule & Holidays</h1>
                </div>

                <div className="h-[800px]">
                    <FullCalendar
                        plugins={[dayGridPlugin, listPlugin, interactionPlugin]}
                        initialView="dayGridMonth"
                        headerToolbar={{
                            left: 'prev,next today',
                            center: 'title',
                            right: 'dayGridMonth,listWeek'
                        }}
                        events={events} // Pass events directly
                        eventContent={(arg) => {
                            const isHoliday = arg.event.backgroundColor === '#c81e1e'
                            return (
                                <div className={`text-xs px-1 overflow-hidden truncate ${isHoliday ? 'font-bold' : ''}`}>
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
