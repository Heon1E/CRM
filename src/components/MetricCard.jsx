import React from 'react'

const MetricCard = ({ title, value, icon, trend, trendValue, onClick, clickable, bgColor }) => {
  // Guard Clause: 필수 props 체크 (.cursorrules 규칙 준수)
  if (!title || value === undefined) {
    return null
  }

  // 배경색 클래스 (기본값: 흰색)
  const bgColorClass = bgColor || 'bg-white'

  return (
    <div
      onClick={clickable && onClick ? onClick : undefined}
      className={`card w-full ${bgColorClass} ${
        clickable && onClick ? 'cursor-pointer hover:border-brand-blue' : ''
      }`}
    >
      <div className="flex items-start justify-between p-4 md:p-5">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] md:text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">
            {title}
          </p>
          <p className="text-2xl md:text-3xl font-semibold text-text-primary break-words">
            {value}
          </p>
          {trend && trendValue && (
            <div className="flex items-center mt-2 flex-wrap">
              <span className={`text-xs font-semibold ${trend === 'up' ? 'text-brand-green' : 'text-red-500'}`}>
                {trend === 'up' ? '↑' : '↓'} {trendValue}
              </span>
              <span className="text-xs text-text-secondary ml-2">전월 대비</span>
            </div>
          )}
        </div>
        <div className="w-9 h-9 md:w-10 md:h-10 bg-indigo-50 rounded-full flex items-center justify-center flex-shrink-0 ml-3">
          <span className="text-lg md:text-xl">{icon || '📊'}</span>
        </div>
      </div>
    </div>
  )
}

export default MetricCard
