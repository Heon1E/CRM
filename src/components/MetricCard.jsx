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
      className={`card card-hover p-3 md:p-5 lg:p-6 w-full ${bgColorClass} ${
        clickable && onClick ? 'cursor-pointer hover:border-brand-blue' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-text-secondary mb-1 md:mb-2">{title}</p>
          <p className="text-xl md:text-2xl lg:text-3xl font-bold text-text-primary break-words mb-1 md:mb-2">{value}</p>
          {trend && trendValue && (
            <div className="flex items-center mt-2 md:mt-3 flex-wrap">
              <span className={`text-xs font-semibold ${trend === 'up' ? 'text-brand-green' : 'text-red-500'}`}>
                {trend === 'up' ? '↑' : '↓'} {trendValue}
              </span>
              <span className="text-xs text-text-secondary ml-2">전월 대비</span>
            </div>
          )}
        </div>
        <div className="w-10 h-10 md:w-12 md:h-12 lg:w-16 lg:h-16 bg-blue-50 rounded-card flex items-center justify-center flex-shrink-0 ml-2 md:ml-4">
          <span className="text-xl md:text-2xl lg:text-3xl">{icon || '📊'}</span>
        </div>
      </div>
    </div>
  )
}

export default MetricCard
