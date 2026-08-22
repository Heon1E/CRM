import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Globe } from 'lucide-react'
import { useI18n } from '../contexts/I18nContext'

/**
 * 소개 화면 — **로그인으로 들어가는 문 하나다.**
 *
 * 예전에는 마케팅 랜딩 템플릿이 그대로 남아 있었다. 큰 표제("거래처·매출·채권·
 * 견적을 한 곳에서")와 설명 문단, 기능 카드 6장, 요금표, 다시 한 번 권유하는
 * 띠까지. **팔 물건이 아니라 사내 도구다.** 여기 오는 사람은 이미 무엇인지
 * 알고 로그인하러 온 직원이고, 모르는 사람은 계정을 못 만든다.
 * 설명이 길수록 정작 눌러야 할 단추가 멀어진다.
 *
 * 그래서 남긴 것은 넷뿐이다 — 누구인지(로고) · 무엇인지(한 줄) ·
 * 들어가는 곳(로그인) · 계정이 없을 때 무엇을 해야 하는지.
 * 회사 정보는 아래에 조용히 둔다. 사업자 정보는 표시 의무가 있고,
 * 전화·메일은 실제로 걸린다.
 */
const LangToggle = ({ className = '' }) => {
    const { locale, toggleLocale } = useI18n()
    return (
        <button
            onClick={toggleLocale}
            className={`inline-flex items-center gap-1.5 px-3 rounded-full border border-white/15
                text-xs font-bold text-white/60 hover:text-white hover:border-white/30
                transition-colors min-h-[44px] ${className}`}
            title="한국어 / English"
        >
            <Globe className="w-3.5 h-3.5" />
            <span>{locale === 'en' ? 'EN' : 'KO'}</span>
        </button>
    )
}

const Landing = () => {
    const { locale } = useI18n()
    const ko = locale === 'ko'

    return (
        <div className="min-h-screen flex flex-col bg-[#0f172a] text-white">

            {/* 위쪽에는 언어 단추 하나만 둔다. 메뉴가 갈 곳이 없다. */}
            <header className="px-5 sm:px-8 py-4 flex justify-end">
                <LangToggle />
            </header>

            <main className="flex-1 flex items-center justify-center px-6 relative overflow-hidden">
                {/* 초록 번짐 — 이 화면에서 유일한 장식이다. 글씨를 가리지 않는다. */}
                <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                        w-[560px] h-[360px] max-w-[120vw] bg-oem-blue/20 rounded-full blur-3xl" />
                </div>

                <div className="relative z-10 w-full max-w-md text-center animate-in fade-in slide-in-from-bottom-2 duration-500">

                    {/* 로고 — 이 화면의 주인공이다 */}
                    <div className="flex items-baseline justify-center gap-2.5">
                        <span className="text-4xl sm:text-5xl font-black tracking-tight">아이앤디</span>
                        <span
                            className="text-4xl sm:text-5xl font-black tracking-tight text-oem-blue-light"
                            style={{ fontFamily: 'var(--font-brand-en)' }}
                        >
                            CRM
                        </span>
                    </div>

                    {/* 무엇인지 한 줄. 광고 문구가 아니라 이름표다.
                        **한글에는 자간을 넓히지 않는다** — 낱자가 흩어져 보인다.
                        영문은 넓혀야 이 자리에서 정돈돼 보인다. */}
                    <p className={`mt-5 text-sm text-white/60 ${ko ? '' : 'tracking-[0.2em]'}`}>
                        {ko ? '아이앤디 주식회사 영업관리' : 'IND Co., Ltd. Sales'}
                    </p>

                    <div className="mt-10 flex justify-center">
                        <Link
                            to="/login"
                            className="inline-flex items-center justify-center gap-2 min-w-[200px]
                                bg-oem-blue hover:bg-oem-blue-dark text-white font-bold
                                px-8 py-4 rounded-xl text-base transition-colors"
                        >
                            {ko ? '로그인' : 'Sign in'}
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>

                    {/* 계정을 못 만드는 이유를 여기서 알려 준다. 가입 단추를 찾다가
                        없어서 고장으로 읽는 일이 없게. */}
                    <p className="mt-6 text-xs text-white/55">
                        {ko ? '사내 도구입니다 · 계정은 관리자가 만듭니다'
                            : 'Internal tool · Accounts are issued by an administrator'}
                    </p>
                </div>
            </main>

            <footer className="px-6 py-8 border-t border-white/10">
                <div className="max-w-md mx-auto text-center text-[11px] leading-relaxed text-white/55">
                    <p>아이앤디 주식회사 · 대표 이대현 · 142-81-76012</p>
                    <p className="mt-1">경기도 용인시 처인구 백암면 삼백로 367-20</p>
                    {/* 전화·메일은 폰에서 실제로 누르는 것이다 — 누르는 자리를 44px로 둔다 */}
                    <p className="mt-1 flex items-center justify-center gap-2">
                        <a href="tel:031-334-9625"
                           className="inline-flex items-center min-h-[44px] px-2 text-white/75 hover:text-white transition-colors">031-334-9625</a>
                        <span aria-hidden="true">·</span>
                        <a href="mailto:idibc@daum.net"
                           className="inline-flex items-center min-h-[44px] px-2 text-white/75 hover:text-white transition-colors">idibc@daum.net</a>
                    </p>
                </div>
            </footer>
        </div>
    )
}

export default Landing
