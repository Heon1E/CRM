import React from 'react';

/**
 * OracleInput - Oracle Forms 스타일의 공용 입력 필드
 * 
 * @param {string} label - 입력 필드 옆에 표시될 라벨 텍스트
 * @param {string} value - 입력 값
 * @param {function} onChange - 값 변경 핸들러
 * @param {string} type - input 타입 (text, password, number 등)
 * @param {string} placeholder - 플레이스홀더
 * @param {boolean} disabled - 비활성화 여부
 * @param {string} className - 추가 스타일 클래스
 * @param {string} labelWidth - 라벨 너비 (기본값: 80px)
 */
const OracleInput = ({
    label,
    value,
    onChange,
    type = 'text',
    placeholder = '',
    disabled = false,
    className = '',
    labelWidth = '80px',
    ...props
}) => {
    return (
        <div className={`flex items-center gap-2 ${className}`}>
            {label && (
                <label
                    className="font-bold text-black uppercase tracking-tight whitespace-nowrap"
                    style={{ width: labelWidth, fontSize: '11px' }}
                >
                    {label}:
                </label>
            )}
            <input
                type={type}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                disabled={disabled}
                className="oracle-sunken px-2 bg-white text-black outline-none w-full"
                style={{
                    height: '22px',
                    fontSize: '12px',
                    fontWeight: '400'
                }}
                {...props}
            />
        </div>
    );
};

export default OracleInput;
