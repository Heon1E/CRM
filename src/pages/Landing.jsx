import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import {
    TrendingUp, Users, BarChart2, Activity, Globe, Smartphone,
    CheckCircle, Star, ArrowRight, Play, Zap
} from 'lucide-react'
import { useI18n } from '../contexts/I18nContext'

// ─── Language Toggle Button ───────────────────────────────────────────────────
const LangToggle = () => {
    const { locale, toggleLocale } = useI18n()
    return (
        <button
            onClick={toggleLocale}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/20 text-xs font-bold text-white/80 hover:text-white hover:border-white/40 hover:bg-white/10 transition-all min-h-[44px]"
            title="Toggle language"
        >
            <Globe className="w-3.5 h-3.5" />
            <span>{locale === 'en' ? '🇺🇸 EN' : '🇰🇷 KO'}</span>
        </button>
    )
}

// ─── Feature Card ─────────────────────────────────────────────────────────────
const FeatureCard = ({ icon: Icon, title, desc }) => (
    <div className="group bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-100 transition-all duration-200">
        <div className="w-11 h-11 bg-blue-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
            <Icon className="w-5 h-5 text-blue-600" />
        </div>
        <h3 className="text-sm font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
    </div>
)

// ─── Pricing Card ─────────────────────────────────────────────────────────────
// ─── Testimonial Card ─────────────────────────────────────────────────────────

// ─── Main Landing Page ────────────────────────────────────────────────────────
const Landing = () => {
    const { t, locale, toggleLocale } = useI18n()

    const features = [
        { icon: TrendingUp, key: 'pipeline' },
        { icon: Zap, key: 'ai' },
        { icon: BarChart2, key: 'analytics' },
        { icon: Activity, key: 'activity' },
        { icon: Users, key: 'team' },
        { icon: Smartphone, key: 'mobile' },
    ]

    return (
        <div className="min-h-screen bg-white font-['Inter',sans-serif]">

            {/* ── NAVBAR ── */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0f172a]/95 backdrop-blur-md border-b border-white/10">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    {/* Logo */}
                    <Link to="/landing" className="flex items-center gap-2 min-h-[44px]">
                        <span className="text-xl font-black text-white">아이앤디</span>
                        <span className="text-xl font-black text-blue-400">CRM</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 ml-0.5 mt-1"></div>
                    </Link>
                    {/* Menu */}
                    <div className="hidden md:flex items-center gap-8">
                        <a href="#features" className="text-sm text-gray-400 hover:text-white transition-colors inline-flex items-center min-h-[44px]">{t('nav.features')}</a>
                        <a href="#pricing" className="text-sm text-gray-400 hover:text-white transition-colors inline-flex items-center min-h-[44px]">{t('nav.pricing')}</a>
                        <Link to="/login" className="text-sm text-gray-400 hover:text-white transition-colors inline-flex items-center min-h-[44px]">{t('nav.signIn')}</Link>
                    </div>
                    {/* Right actions */}
                    <div className="flex items-center gap-3">
                        <LangToggle />
                        <Link
                            to="/login"
                            className="hidden md:inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold px-5 py-2 rounded-lg transition-colors min-h-[44px]"
                        >
                            {t('nav.getStarted')}
                        </Link>
                    </div>
                </div>
            </nav>

            {/* ── HERO ── */}
            <section className="bg-[#0f172a] pt-32 pb-24 px-6 relative overflow-hidden">
                {/* Glow effect */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-blue-600/20 rounded-full blur-3xl"></div>
                    <div className="absolute top-1/2 left-1/4 w-[300px] h-[200px] bg-indigo-600/10 rounded-full blur-3xl"></div>
                </div>
                <div className="max-w-4xl mx-auto text-center relative z-10">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 bg-blue-600/20 border border-blue-500/30 rounded-full px-4 py-1.5 mb-8">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                        {/* 'New: AI-Powered Forecasting' 이라고 붙어 있었다.
                            매출 추정은 실제로 있지만 AI가 아니라 규칙 기반 계산이다
                            (revenueForecastEngine). 하는 일 그대로 적는다. */}
                        <span className="text-blue-300 text-xs font-bold tracking-widest">
                            {locale === 'ko' ? '최근 4년 실적으로 연말까지 내다봅니다' : 'Year-end projection from four years of history'}
                        </span>
                    </div>
                    <h1 className="text-5xl md:text-6xl font-black text-white leading-tight mb-6">
                        {t('landing.heroTitle')}<br />
                        <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                            {t('landing.heroTitleHighlight')}
                        </span>
                    </h1>
                    <p className="text-lg text-gray-400 leading-relaxed max-w-2xl mx-auto mb-10">
                        {t('landing.heroSubtitle')}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
                        <Link
                            to="/login"
                            className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-4 rounded-xl text-base transition-all hover:shadow-lg hover:shadow-blue-500/30 hover:-translate-y-0.5"
                        >
                            {t('landing.ctaPrimary')}
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                        {/* '데모 보기' 버튼이었는데 누르면 아무 일도 없다. 볼 데모가
                            없기 때문이다. 아래 기능 설명으로 내려가게 한다. */}
                        <a href="#features"
                           className="inline-flex items-center justify-center gap-2 border border-white/20 hover:border-white/40 text-white font-bold px-8 py-4 rounded-xl text-base transition-all hover:bg-white/5">
                            <Play className="w-4 h-4 text-blue-400" />
                            {t('landing.ctaSecondary')}
                        </a>
                    </div>
                    <p className="text-xs text-gray-400 font-medium">{t('landing.trustBadge')}</p>
                </div>

                {/* Dashboard Preview */}
                <div className="max-w-5xl mx-auto mt-16 relative z-10">
                    <div className="bg-[#1e293b] rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
                            <div className="w-3 h-3 rounded-full bg-red-500/70"></div>
                            <div className="w-3 h-3 rounded-full bg-yellow-500/70"></div>
                            <div className="w-3 h-3 rounded-full bg-green-500/70"></div>
                            {/* 'app.xavian.io/dashboard' 라고 적혀 있었다. 우리 주소가 아니다. */}
                            <span className="ml-3 text-xs text-gray-400 font-mono">아이앤디 CRM · 대시보드</span>
                        </div>
                        {/*
                          여기에 1,247곳 · $247K · 89건 · 승률 73% 와 성장률까지
                          박혀 있었다. **전부 지어낸 값이다.** 실제 화면처럼 보이는
                          자리에 가짜 실적을 넣으면 그것이 우리 숫자로 읽힌다.
                          반대로 진짜 숫자를 넣으면 회사 매출이 공개된다.
                          그래서 무엇을 보는 화면인지만 남긴다.
                        */}
                        <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {[
                                { label: locale === 'ko' ? '거래처' : 'Clients', color: 'text-emerald-400' },
                                { label: locale === 'ko' ? '이번 달 매출' : 'Revenue', color: 'text-blue-400' },
                                { label: locale === 'ko' ? '진행 중 기회' : 'Open deals', color: 'text-purple-400' },
                                { label: locale === 'ko' ? '연체 채권' : 'Overdue', color: 'text-amber-400' },
                            ].map((stat, i) => (
                                <div key={i} className="bg-white/5 rounded-xl p-4">
                                    <p className="text-xs text-gray-400 font-bold uppercase mb-1">{stat.label}</p>
                                    <p className={`text-2xl font-black ${stat.color}`}>&mdash;</p>
                                </div>
                            ))}
                        </div>
                        <div className="px-6 pb-6">
                            <div className="bg-white/5 rounded-xl p-4 h-32 flex items-center justify-center">
                                <div className="w-full flex items-end gap-2 h-20">
                                    {[40, 65, 50, 80, 60, 90, 75, 95, 70, 85, 92, 88].map((h, i) => (
                                        <div
                                            key={i}
                                            className="flex-1 bg-blue-500/40 hover:bg-blue-400/60 rounded-t transition-all"
                                            style={{ height: `${h}%` }}
                                        ></div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/*
              여기에 'TRUSTED BY 500+ SALES TEAMS WORLDWIDE'와 함께
              Accenture · Deloitte · Samsung · LG Corp · Kakao 가 우리 고객처럼
              적혀 있었다. **한 곳도 우리 고객이 아니다.** 남의 상호를 보증인처럼
              쓰는 것은 사실이 아닐 뿐 아니라 상표·부당표시 문제가 된다.
              템플릿에 딸려 온 자리이므로 통째로 뺀다. 실제 고객이 생기면
              그때 허락을 받아 적는다.
            */}

            {/* ── FEATURES ── */}
            <section id="features" className="py-24 px-6 bg-white">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-black text-gray-900 mb-4">{t('landing.featuresTitle')}</h2>
                        <div className="w-16 h-1 bg-blue-600 rounded-full mx-auto"></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {features.map(({ icon, key }) => (
                            <FeatureCard
                                key={key}
                                icon={icon}
                                title={t(`features.${key}.title`)}
                                desc={t(`features.${key}.desc`)}
                            />
                        ))}
                    </div>
                </div>
            </section>

            {/*
              요금제 세 칸($0 / $35 / 문의)과 '월간·연간 20% 절약' 토글이
              있었다. **팔고 있는 물건이 아니다.** 요금제가 정해지지 않은 채
              '무료 체험 시작'을 띄워 두면 없는 상품을 파는 셈이 된다.
              지금은 사내 도구이므로 도입 문의만 받는다.
            */}
            <section id="pricing" className="py-24 px-6 bg-gray-50">
                <div className="max-w-3xl mx-auto text-center">
                    <h2 className="text-3xl font-black text-gray-900 mb-4">지금은 사내에서 쓰고 있습니다</h2>
                    <div className="w-16 h-1 bg-blue-600 rounded-full mx-auto mb-8"></div>
                    <p className="text-gray-600 leading-relaxed mb-10">
                        아이앤디 주식회사의 영업 업무에 맞춰 만들었고, 저희가 매일 쓰고 있습니다.<br />
                        밖에 파는 상품이 아니라 요금제가 없습니다. 관심이 있으시면 연락 주세요.
                    </p>
                    <div className="inline-flex flex-col sm:flex-row items-center gap-3">
                        <a href="tel:031-334-9625"
                           className="inline-flex items-center justify-center gap-2 bg-[#007538] hover:bg-[#005C2B] text-white font-bold px-8 py-4 rounded-xl transition-all min-h-[44px]">
                            031-334-9625
                        </a>
                        <a href="mailto:idibc@daum.net"
                           className="inline-flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 font-bold px-8 py-4 rounded-xl transition-all min-h-[44px]">
                            idibc@daum.net
                        </a>
                    </div>
                </div>
            </section>

            {/*
              지어낸 고객 후기 세 건이 있었다 — Sarah Chen(TechVenture),
              Mark Williams(GrowthLab), Priya Sharma(ScaleUp Co.).
              **셋 다 없는 사람이다.** 없는 사람의 말을 지어 붙일 수는 없다.
              실제 후기가 생기면 그때 넣는다.
            */}

            {/* ── CTA BANNER ── */}
            <section className="bg-[#0f172a] py-24 px-6 relative overflow-hidden">
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-blue-600/20 rounded-full blur-3xl"></div>
                </div>
                <div className="max-w-3xl mx-auto text-center relative z-10">
                    <h2 className="text-4xl font-black text-white mb-4">{t('landing.ctaBannerTitle')}</h2>
                    <p className="text-gray-400 mb-8">{t('landing.ctaBannerSub')}</p>
                    <Link
                        to="/login"
                        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-10 py-4 rounded-xl text-base transition-all hover:shadow-lg hover:shadow-blue-500/30 hover:-translate-y-0.5"
                    >
                        {t('landing.ctaPrimary')}
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </section>

            {/* ── FOOTER ── */}
            <footer className="bg-[#0f172a] border-t border-white/10 py-12 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-10">
                        {/*
                          Changelog · Roadmap · About · Blog · Careers · Press ·
                          Privacy · Terms · Security · Cookies — 열두 개가 전부
                          href="#" 였다. 없는 페이지를 링크로 걸어 두면 눌러 보고
                          고장으로 읽는다. 실제로 있는 것만 남긴다.
                        */}
                        <div className="col-span-2">
                            <div className="flex items-center gap-1 mb-4">
                                <span className="text-lg font-black text-white">아이앤디</span>
                                <span className="text-lg font-black text-blue-400">CRM</span>
                            </div>
                            <p className="text-xs text-gray-400 leading-relaxed max-w-xs">
                                아이앤디 주식회사의 영업관리 도구입니다.<br />
                                IBC · 드럼 · 제리캔을 만듭니다.
                            </p>
                        </div>
                        <div className="col-span-2">
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">아이앤디 주식회사</p>
                            <ul className="space-y-2 text-xs text-gray-400 leading-relaxed">
                                <li>대표 이대현 · 142-81-76012</li>
                                <li>경기도 용인시 처인구 백암면 삼백로 367-20</li>
                                <li><a href="tel:031-334-9625" className="text-gray-400 hover:text-gray-300 transition-colors inline-flex items-center min-h-[44px]">031-334-9625</a></li>
                                <li><a href="mailto:idibc@daum.net" className="text-gray-400 hover:text-gray-300 transition-colors inline-flex items-center min-h-[44px]">idibc@daum.net</a></li>
                            </ul>
                        </div>
                        <div>
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">바로가기</p>
                            <ul className="space-y-2">
                                <li><a href="#features" className="text-xs text-gray-400 hover:text-gray-300 transition-colors inline-flex items-center min-h-[44px]">무엇을 하는가</a></li>
                                <li><a href="#pricing" className="text-xs text-gray-400 hover:text-gray-300 transition-colors inline-flex items-center min-h-[44px]">도입 문의</a></li>
                                <li><Link to="/login" className="text-xs text-gray-400 hover:text-gray-300 transition-colors inline-flex items-center min-h-[44px]">로그인</Link></li>
                            </ul>
                        </div>
                    </div>
                    <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
                        <p className="text-xs text-gray-400">{t('landing.footerCopy')}</p>
                        <div className="flex items-center gap-3">
                            <LangToggle />
                        </div>
                    </div>
                </div>
            </footer>

        </div>
    )
}

export default Landing
