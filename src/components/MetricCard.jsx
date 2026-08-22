import React from 'react'

const MetricCard = ({
  title,
  value,
  icon,
  trend,
  trendValue,
  onClick,
  clickable,
  bgColor,
  iconBgClass,
  iconRoundedClass,
  className = '',
  sparkline = false,
}) => {
  // Guard Clause: 필수 props 체크 (.cursorrules 규칙 준수)
  if (!title || value === undefined) {
    return null
  }

  // 배경색 클래스 (기본값: 흰색)
  const bgColorClass = bgColor || 'bg-white'
  const iconBg = iconBgClass || 'bg-slate-100'
  const iconRounded = iconRoundedClass || 'rounded-full'

  const hasIcon = icon !== undefined && icon !== null && icon !== false

  return (
    <div
      onClick={clickable && onClick ? onClick : undefined}
      className={`card w-full relative overflow-hidden ${bgColorClass} ${className} ${
        clickable && onClick ? 'cursor-pointer hover:border-white/20' : ''
      }`}
    >
      {sparkline && (
        <svg
          className="absolute -right-4 -bottom-6 w-36 h-20 text-slate-200 opacity-60 pointer-events-none"
          viewBox="0 0 120 60"
          aria-hidden="true"
        >
          <path
            d="M0 40 C15 20, 30 45, 45 30 C60 15, 75 35, 90 20 C100 12, 110 18, 120 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      )}
      <div className="flex items-start justify-between p-6">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] md:text-xs font-semibold text-slate-500 uppercase tracking-[0.15em]">
            {title}
          </p>
          <p className="text-3xl md:text-4xl font-bold tracking-tight break-words text-oem-blue">
            {value}
          </p>
          {trend && trendValue && (
            <div className="flex items-center mt-2 flex-wrap">
              <span className="text-xs font-medium text-slate-500">
                {trend === 'up' ? '↑' : '↓'} {trendValue}
              </span>
              <span className="text-xs text-slate-500 ml-2">전월 대비</span>
            </div>
          )}
        </div>
        {hasIcon && (
          <div className={`w-10 h-10 ${iconBg} ${iconRounded} flex items-center justify-center flex-shrink-0 ml-3 text-slate-600`}>
            {React.isValidElement(icon) ? icon : <span className="text-lg md:text-xl">{icon}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

export default MetricCard



