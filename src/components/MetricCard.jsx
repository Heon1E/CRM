import React from 'react'

const MetricCard = ({ title, value, icon, trend, trendValue, onClick, clickable }) => {
  // Guard Clause: 필수 props 체크 (.cursorrules 규칙 준수)
  if (!title || value === undefined) {
    return null
  }

  return (
    <div
      onClick={clickable && onClick ? onClick : undefined}
      className={`card card-hover p-5 md:p-6 w-full ${
        clickable && onClick ? 'cursor-pointer hover:border-brand-blue' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs md:text-sm font-medium text-text-secondary mb-2">{title}</p>
          <p className="text-2xl md:text-3xl font-bold text-text-primary break-words mb-2">{value}</p>
          {trend && trendValue && (
            <div className="flex items-center mt-3 flex-wrap">
              <span className={`text-xs md:text-sm font-semibold ${trend === 'up' ? 'text-brand-green' : 'text-red-500'}`}>
                {trend === 'up' ? '↑' : '↓'} {trendValue}
              </span>
              <span className="text-xs md:text-sm text-text-secondary ml-2">전월 대비</span>
            </div>
          )}
        </div>
        <div className="w-12 h-12 md:w-16 md:h-16 bg-blue-50 rounded-card flex items-center justify-center flex-shrink-0 ml-4">
          <span className="text-2xl md:text-3xl">{icon || '📊'}</span>
        </div>
      </div>
    </div>
  )
}

export default MetricCard
