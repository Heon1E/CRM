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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/20 text-xs font-bold text-white/80 hover:text-white hover:border-white/40 hover:bg-white/10 transition-all"
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
const PricingCard = ({ plan, price, desc, features, cta, popular, ctaStyle, annual }) => {
    const { t } = useI18n()
    return (
        <div className={`relative rounded-2xl p-8 flex flex-col ${popular
            ? 'bg-blue-600 text-white shadow-2xl shadow-blue-500/30 scale-105'
            : 'bg-white text-gray-900 border border-gray-200 shadow-sm'
            }`}>
            {popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-gradient-to-r from-orange-400 to-pink-500 text-white text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-lg">
                        {t('pricing.mostPopular')}
                    </span>
                </div>
            )}
            <div className="mb-6">
                <h3 className={`text-lg font-black mb-1.5 ${popular ? 'text-white' : 'text-gray-900'}`}>{plan}</h3>
                <p className={`text-xs leading-relaxed ${popular ? 'text-blue-100' : 'text-gray-500'}`}>{desc}</p>
            </div>
            <div className="mb-6">
                {price === 'custom' || price === 'contact' ? (
                    <span className={`text-3xl font-black ${popular ? 'text-white' : 'text-gray-900'}`}>
                        {t('pricing.enterprise.price')}
                    </span>
                ) : (
                    <div>
                        <span className={`text-4xl font-black ${popular ? 'text-white' : 'text-gray-900'}`}>{price}</span>
                        <span className={`text-sm ml-1 ${popular ? 'text-blue-200' : 'text-gray-500'}`}>
                            {t('pricing.perMonth')}
                        </span>
                        {annual && price !== '$0' && price !== '₩0' && (
                            <div className={`text-[10px] mt-1 font-bold ${popular ? 'text-blue-200' : 'text-emerald-600'}`}>
                                {t('pricing.annualDiscount')} with annual billing
                            </div>
                        )}
                    </div>
                )}
            </div>
            <ul className="space-y-3 mb-8 flex-1">
                {features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2.5 text-xs">
                        <CheckCircle className={`w-4 h-4 flex-shrink-0 ${popular ? 'text-blue-200' : 'text-emerald-500'}`} />
                        <span className={popular ? 'text-blue-50' : 'text-gray-600'}>{f}</span>
                    </li>
                ))}
            </ul>
            <Link
                to="/login"
                className={`block text-center py-3 rounded-xl text-sm font-bold transition-all ${popular
                        ? 'bg-white text-blue-600 hover:bg-blue-50'
                        : ctaStyle === 'dark'
                            ? 'bg-gray-900 text-white hover:bg-gray-800'
                            : 'border-2 border-gray-200 text-gray-700 hover:border-blue-300 hover:text-blue-600'
                    }`}
            >
                {cta}
            </Link>
        </div>
    )
}

// ─── Testimonial Card ─────────────────────────────────────────────────────────

// ─── Main Landing Page ────────────────────────────────────────────────────────
const Landing = () => {
    const { t, locale, toggleLocale, pricing } = useI18n()
    const [billingAnnual, setBillingAnnual] = useState(false)

    const features = [
        { icon: TrendingUp, key: 'pipeline' },
        { icon: Zap, key: 'ai' },
        { icon: BarChart2, key: 'analytics' },
        { icon: Activity, key: 'activity' },
        { icon: Users, key: 'team' },
        { icon: Smartphone, key: 'mobile' },
    ]

    const planFeatures = t('planFeatures')

    const getPrice = (plan) => {
        if (plan === 'enterprise') return 'contact'
        return billingAnnual ? pricing[plan].annual : pricing[plan].monthly
    }

    return (
        <div className="min-h-screen bg-white font-['Inter',sans-serif]">

            {/* ── NAVBAR ── */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0f172a]/95 backdrop-blur-md border-b border-white/10">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    {/* Logo */}
                    <Link to="/landing" className="flex items-center gap-2">
                        <span className="text-xl font-black text-white">Xavian</span>
                        <span className="text-xl font-black text-blue-400">CRM</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 ml-0.5 mt-1"></div>
                    </Link>
                    {/* Menu */}
                    <div className="hidden md:flex items-center gap-8">
                        <a href="#features" className="text-sm text-gray-500 hover:text-white transition-colors">{t('nav.features')}</a>
                        <a href="#pricing" className="text-sm text-gray-500 hover:text-white transition-colors">{t('nav.pricing')}</a>
                        <Link to="/login" className="text-sm text-gray-500 hover:text-white transition-colors">{t('nav.signIn')}</Link>
                    </div>
                    {/* Right actions */}
                    <div className="flex items-center gap-3">
                        <LangToggle />
                        <Link
                            to="/login"
                            className="hidden md:inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold px-5 py-2 rounded-lg transition-colors"
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
                        <span className="text-blue-300 text-xs font-bold tracking-widest uppercase">New: AI-Powered Forecasting</span>
                    </div>
                    <h1 className="text-5xl md:text-6xl font-black text-white leading-tight mb-6">
                        {t('landing.heroTitle')}<br />
                        <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                            {t('landing.heroTitleHighlight')}
                        </span>
                    </h1>
                    <p className="text-lg text-gray-500 leading-relaxed max-w-2xl mx-auto mb-10">
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
                        <button className="inline-flex items-center justify-center gap-2 border border-white/20 hover:border-white/40 text-white font-bold px-8 py-4 rounded-xl text-base transition-all hover:bg-white/5">
                            <Play className="w-4 h-4 text-blue-400" />
                            {t('landing.ctaSecondary')}
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 font-medium">{t('landing.trustBadge')}</p>
                </div>

                {/* Dashboard Preview */}
                <div className="max-w-5xl mx-auto mt-16 relative z-10">
                    <div className="bg-[#1e293b] rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
                            <div className="w-3 h-3 rounded-full bg-red-500/70"></div>
                            <div className="w-3 h-3 rounded-full bg-yellow-500/70"></div>
                            <div className="w-3 h-3 rounded-full bg-green-500/70"></div>
                            {/* 'app.xavian.io/dashboard' 라고 적혀 있었다. 우리 주소가 아니다. */}
                            <span className="ml-3 text-xs text-gray-500 font-mono">아이앤디 CRM · 대시보드</span>
                        </div>
                        <div className="p-6 grid grid-cols-4 gap-4">
                            {[
                                { label: 'Total Clients', value: '1,247', color: 'text-emerald-400', growth: '+12.4%' },
                                { label: 'Monthly Revenue', value: locale === 'ko' ? '₩247M' : '$247K', color: 'text-blue-400', growth: '+28.3%' },
                                { label: 'Active Deals', value: '89', color: 'text-purple-400', growth: '+5.7%' },
                                { label: 'Win Rate', value: '73%', color: 'text-amber-400', growth: '+8.2%' },
                            ].map((stat, i) => (
                                <div key={i} className="bg-white/5 rounded-xl p-4">
                                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">{stat.label}</p>
                                    <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
                                    <p className="text-[10px] text-emerald-400 font-bold mt-1">{stat.growth}</p>
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

            {/* ── PRICING ── */}
            <section id="pricing" className="py-24 px-6 bg-gray-50">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-12">
                        <h2 className="text-4xl font-black text-gray-900 mb-4">{t('landing.pricingTitle')}</h2>
                        <div className="w-16 h-1 bg-blue-600 rounded-full mx-auto mb-8"></div>
                        {/* Toggle */}
                        <div className="inline-flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-2 py-2 shadow-sm">
                            <button
                                onClick={() => setBillingAnnual(false)}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${!billingAnnual ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {t('pricing.monthly')}
                            </button>
                            <button
                                onClick={() => setBillingAnnual(true)}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${billingAnnual ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {t('pricing.annual')}
                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${billingAnnual ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                                    {t('pricing.annualDiscount')}
                                </span>
                            </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                        <PricingCard
                            plan={t('pricing.free.name')}
                            price={getPrice('free')}
                            desc={t('pricing.free.desc')}
                            features={planFeatures.free}
                            cta={t('pricing.free.cta')}
                            popular={false}
                            annual={billingAnnual}
                        />
                        <PricingCard
                            plan={t('pricing.pro.name')}
                            price={getPrice('pro')}
                            desc={t('pricing.pro.desc')}
                            features={planFeatures.pro}
                            cta={t('pricing.pro.cta')}
                            popular={true}
                            annual={billingAnnual}
                        />
                        <PricingCard
                            plan={t('pricing.enterprise.name')}
                            price="contact"
                            desc={t('pricing.enterprise.desc')}
                            features={planFeatures.enterprise}
                            cta={t('pricing.enterprise.cta')}
                            popular={false}
                            ctaStyle="dark"
                            annual={billingAnnual}
                        />
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
                    <p className="text-gray-500 mb-8">{t('landing.ctaBannerSub')}</p>
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
                        {/* Brand */}
                        <div className="col-span-2">
                            <div className="flex items-center gap-1 mb-4">
                                <span className="text-lg font-black text-white">Xavian</span>
                                <span className="text-lg font-black text-blue-400">CRM</span>
                            </div>
                            <p className="text-xs text-gray-500 leading-relaxed max-w-xs">
                                The modern CRM for global sales teams. Close more deals, grow faster.
                            </p>
                        </div>
                        {/* Links */}
                        {[
                            { title: 'Product', links: ['Features', 'Pricing', 'Changelog', 'Roadmap'] },
                            { title: 'Company', links: ['About', 'Blog', 'Careers', 'Press'] },
                            { title: 'Legal', links: ['Privacy', 'Terms', 'Security', 'Cookies'] },
                        ].map(col => (
                            <div key={col.title}>
                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">{col.title}</p>
                                <ul className="space-y-2">
                                    {col.links.map(link => (
                                        <li key={link}>
                                            <a href="#" className="text-xs text-gray-500 hover:text-gray-500 transition-colors">{link}</a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                    <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
                        <p className="text-[10px] text-gray-600">{t('landing.footerCopy')}</p>
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
