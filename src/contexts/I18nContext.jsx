import React, { createContext, useContext, useState, useCallback } from 'react'

const I18nContext = createContext(null)

// Translation strings
const translations = {
    en: {
        // Navigation
        nav: {
            features: 'Features',
            pricing: 'Pricing',
            about: 'About',
            getStarted: 'Get Started Free',
            signIn: 'Sign In',
            dashboard: 'Dashboard',
        },
        // Landing page
        landing: {
            heroTitle: 'Close More Deals,',
            heroTitleHighlight: 'Grow Faster.',
            heroSubtitle: 'The all-in-one CRM built for modern sales teams. Track clients, manage pipelines, and hit your targets — all in one beautiful workspace.',
            ctaPrimary: 'Start Free Trial',
            ctaSecondary: 'Watch Demo',
            trustBadge: 'No credit card required • 14-day free trial • Cancel anytime',
            socialProof: '',   // 없는 고객 수를 적지 않는다
            featuresTitle: 'Everything your sales team needs',
            pricingTitle: 'Simple, Transparent Pricing',
            testimonialsTitle: 'What our customers say',
            ctaBannerTitle: 'Ready to transform your sales?',
            ctaBannerSub: 'Built and used at IND Co., Ltd.',
            footerCopy: '© 2025 Xavian CRM. All rights reserved.',
        },
        // Features
        features: {
            pipeline: { title: 'Pipeline Management', desc: 'Visualize and manage your entire sales process with an intuitive Kanban board.' },
            ai: { title: 'AI Intelligence', desc: 'Get smart insights and forecasts powered by AI to close deals faster.' },
            analytics: { title: 'Sales Analytics', desc: 'Track revenue trends, team performance, and growth metrics in real-time.' },
            activity: { title: 'Activity Tracking', desc: 'Log calls, meetings, and follow-ups to never miss a beat with your clients.' },
            team: { title: 'Team Collaboration', desc: 'Share notes, assign tasks, and collaborate across your entire sales team.' },
            mobile: { title: 'Mobile Ready', desc: 'Access your CRM anywhere with our fully responsive mobile experience.' },
        },
        // Pricing
        pricing: {
            monthly: 'Monthly',
            annual: 'Annual',
            annualDiscount: 'Save 20%',
            mostPopular: 'Most Popular',
            free: { name: 'Free', desc: 'Perfect for individuals and small teams just getting started.', cta: 'Get Started Free' },
            pro: { name: 'Pro', desc: 'For growing sales teams who need advanced features and insights.', cta: 'Start Free Trial' },
            enterprise: { name: 'Enterprise', desc: 'For large organizations needing custom solutions and dedicated support.', cta: 'Contact Sales', price: 'Custom' },
            perMonth: '/mo',
            perUser: 'per user',
        },
        // Plan features
        planFeatures: {
            free: ['1 user', '100 contacts', 'Basic pipeline', 'Email support', '2GB storage'],
            pro: ['5 users', 'Unlimited contacts', 'Advanced pipeline', 'Priority support', '50GB storage'],
            enterprise: ['Unlimited users', 'Unlimited contacts', 'Custom pipeline stages', 'Dedicated support', 'Unlimited storage'],
        },
        // Testimonials
        testimonials: [
            ],
        // Dashboard
        dashboard: {
            title: 'Executive Dashboard',
            subtitle: 'XAVIAN CRM MANAGEMENT SYSTEM',
            totalCustomers: 'Total Customers',
            activeCustomers: 'Active Customers',
            monthlyRevenue: 'Monthly Revenue',
            sevenDayTrend: '7-Day Trend',
            revenueAnalysis: 'REVENUE ANALYSIS',
            monthlyPerformance: 'Monthly Performance vs Target',
            fastestGrowing: 'FASTEST GROWING CLIENTS',
            topPerformers: 'Top Performers by Growth Rate',
            priorityIssues: 'PRIORITY ISSUES',
            pendingActions: 'Pending Actions & Alerts',
            recentActivities: 'RECENT ACTIVITIES',
            timeline: 'Timeline of Interactions',
            keyAccounts: 'KEY ACCOUNTS',
            topRevenue: 'Top Revenue Contributors',
            viewFull: 'View Full Timeline',
            manageAll: 'Manage All Accounts',
            vsLastYear: 'vs last year',
            lastUpdated: 'Last Updated',
        },
    },
    ko: {
        nav: {
            features: '기능',
            pricing: '요금제',
            about: '소개',
            getStarted: '무료로 시작하기',
            signIn: '로그인',
            dashboard: '대시보드',
        },
        landing: {
            heroTitle: '더 많은 거래를 성사시키고,',
            heroTitleHighlight: '더 빠르게 성장하세요.',
            heroSubtitle: '현대 영업팀을 위한 올인원 CRM. 고객 관리, 파이프라인 운영, 목표 달성 — 모든 것을 하나의 워크스페이스에서.',
            ctaPrimary: '무료 체험 시작',
            ctaSecondary: '데모 보기',
            trustBadge: '신용카드 불필요 • 14일 무료 체험 • 언제든 취소 가능',
            socialProof: '전 세계 500개 이상의 영업팀이 신뢰합니다',
            featuresTitle: '영업팀에 필요한 모든 것',
            pricingTitle: '심플하고 투명한 요금제',
            testimonialsTitle: '고객들의 이야기',
            ctaBannerTitle: '영업을 혁신할 준비가 됐나요?',
            ctaBannerSub: '아이앤디 주식회사가 직접 만들어 쓰고 있습니다',
            footerCopy: '© 2025 Xavian CRM. 모든 권리 보유.',
        },
        features: {
            pipeline: { title: '파이프라인 관리', desc: '직관적인 칸반 보드로 전체 영업 프로세스를 시각화하고 관리하세요.' },
            ai: { title: 'AI 인텔리전스', desc: 'AI 기반 스마트 인사이트와 예측으로 거래를 더 빠르게 성사시키세요.' },
            analytics: { title: '매출 분석', desc: '실시간으로 수익 트렌드, 팀 성과, 성장 지표를 추적하세요.' },
            activity: { title: '활동 추적', desc: '통화, 미팅, 후속 조치를 기록해 고객과의 모든 접점을 놓치지 마세요.' },
            team: { title: '팀 협업', desc: '메모 공유, 업무 배정, 영업팀 전체와의 협업을 하세요.' },
            mobile: { title: '모바일 지원', desc: '완전한 반응형 모바일 환경으로 언제 어디서나 CRM에 접근하세요.' },
        },
        pricing: {
            monthly: '월간',
            annual: '연간',
            annualDiscount: '20% 절약',
            mostPopular: '가장 인기',
            free: { name: '무료', desc: '시작하는 개인 및 소규모 팀을 위한 플랜.', cta: '무료로 시작하기' },
            pro: { name: '프로', desc: '고급 기능과 인사이트가 필요한 성장하는 영업팀을 위한 플랜.', cta: '무료 체험 시작' },
            enterprise: { name: '엔터프라이즈', desc: '맞춤 솔루션과 전담 지원이 필요한 대기업을 위한 플랜.', cta: '문의하기', price: '문의' },
            perMonth: '/월',
            perUser: '사용자당',
        },
        planFeatures: {
            free: ['사용자 1명', '연락처 100개', '기본 파이프라인', '이메일 지원', '2GB 저장공간'],
            pro: ['사용자 5명', '무제한 연락처', '고급 파이프라인', '우선 지원', '50GB 저장공간'],
            enterprise: ['무제한 사용자', '무제한 연락처', '맞춤 파이프라인 단계', '전담 지원', '무제한 저장공간'],
        },
        testimonials: [
            ],
        dashboard: {
            title: '경영 대시보드',
            subtitle: 'XAVIAN CRM 관리 시스템',
            totalCustomers: '전체 고객',
            activeCustomers: '활성 고객',
            monthlyRevenue: '월 매출',
            sevenDayTrend: '7일 트렌드',
            revenueAnalysis: '매출 분석',
            monthlyPerformance: '월별 실적 vs 목표',
            fastestGrowing: '고성장 고객사',
            topPerformers: '성장률 상위 실적',
            priorityIssues: '우선 이슈',
            pendingActions: '보류 중인 작업 및 알림',
            recentActivities: '최근 활동',
            timeline: '인터랙션 타임라인',
            keyAccounts: '핵심 거래처',
            topRevenue: '상위 매출 기여 고객',
            viewFull: '전체 타임라인 보기',
            manageAll: '전체 거래처 관리',
            vsLastYear: '전년도 대비',
            lastUpdated: '마지막 업데이트',
        },
    },
}

// Pricing data (amounts in display units)
const pricingData = {
    en: {
        free: { monthly: '$0', annual: '$0' },
        pro: { monthly: '$35', annual: '$28' },
    },
    ko: {
        free: { monthly: '₩0', annual: '₩0' },
        pro: { monthly: '₩49,000', annual: '₩39,000' },
    },
}

export const I18nProvider = ({ children }) => {
    const [locale, setLocale] = useState('en') // Default: English

    const t = useCallback((key) => {
        const keys = key.split('.')
        let value = translations[locale]
        for (const k of keys) {
            value = value?.[k]
            if (value === undefined) {
                // Fallback to English
                let fallback = translations['en']
                for (const fk of keys) fallback = fallback?.[fk]
                return fallback ?? key
            }
        }
        return value
    }, [locale])

    const toggleLocale = useCallback(() => {
        setLocale(prev => prev === 'en' ? 'ko' : 'en')
    }, [])

    const pricing = pricingData[locale]

    // Currency formatter based on locale
    const formatMoney = useCallback((amount) => {
        if (locale === 'ko') {
            if (!amount || amount === 0) return '₩0'
            const num = Number(amount)
            if (num >= 100000000) {
                const eok = Math.floor(num / 100000000)
                const man = Math.floor((num % 100000000) / 10000)
                return man > 0 ? `${eok}억 ${man.toLocaleString('ko-KR')}만원` : `${eok}억원`
            }
            if (num >= 10000) {
                return `${Math.floor(num / 10000).toLocaleString('ko-KR')}만원`
            }
            return `${num.toLocaleString('ko-KR')}원`
        }
        // USD
        if (!amount || amount === 0) return '$0'
        const num = Number(amount)
        if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`
        if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`
        return `$${num.toLocaleString('en-US')}`
    }, [locale])

    return (
        <I18nContext.Provider value={{ locale, t, toggleLocale, pricing, formatMoney }}>
            {children}
        </I18nContext.Provider>
    )
}

export const useI18n = () => {
    const ctx = useContext(I18nContext)
    if (!ctx) throw new Error('useI18n must be used within I18nProvider')
    return ctx
}
