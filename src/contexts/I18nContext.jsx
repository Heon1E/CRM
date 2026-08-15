import React, { createContext, useContext, useState, useCallback } from 'react'

const I18nContext = createContext(null)

// Translation strings
const translations = {
    en: {
        // Navigation
        nav: {
            features: 'What it does',
            pricing: 'Contact',
            about: 'About',
            getStarted: 'Sign in',
            signIn: 'Sign In',
            dashboard: 'Dashboard',
        },
        // Landing page
        landing: {
            heroTitle: 'Clients, revenue, receivables, quotes',
            heroTitleHighlight: 'in one place.',
            heroSubtitle: 'The sales tool IND Co., Ltd. built for its own team. It reads the ERP screen, watches the numbers, and tells you what to do today.',
            ctaPrimary: 'Sign in',
            ctaSecondary: 'What it does',
            trustBadge: 'Internal tool · Accounts are issued by an administrator',
            socialProof: '',
            featuresTitle: 'What it actually does',
            pricingTitle: '',
            testimonialsTitle: '',
            ctaBannerTitle: 'Sign in to get started',
            ctaBannerSub: 'Built and used at IND Co., Ltd.',
            footerCopy: '© 2026 IND Co., Ltd.',
        },
        features: {
            pipeline: { title: 'Pipeline', desc: 'One opportunity per deal, with amount and expected close. A quote creates one automatically, so nothing has to be typed twice.' },
            ai: { title: 'Sales coach', desc: 'Flags accounts whose revenue dropped, accounts that went quiet, and accounts growing while nobody is calling. Rules, not guesswork — every number is shown.' },
            analytics: { title: 'Revenue forecast', desc: 'Projects the year from four years of history, segment by segment, normalised for working days and Korean holidays.' },
            activity: { title: 'Morning briefing', desc: "Every morning at 7, Telegram sends today's schedule, what you promised, what is overdue, and what is stalled." },
            team: { title: 'Documents', desc: 'Quotes, purchase orders and statements print to PDF with the company catalogue design and a proper filename.' },
            mobile: { title: 'Paper in, data out', desc: 'Excel files, ERP screenshots and phone photos become records — reviewed on screen first, never written blind.' },
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
            features: '무엇을 하는가',
            pricing: '도입 문의',
            about: '소개',
            getStarted: '로그인',
            signIn: '로그인',
            dashboard: '대시보드',
        },
        landing: {
            heroTitle: '거래처 · 매출 · 채권 · 견적을',
            heroTitleHighlight: '한 곳에서.',
            heroSubtitle: '아이앤디 주식회사가 자기 영업팀을 위해 만든 도구입니다. ERP 화면을 읽고, 숫자를 지켜보고, 오늘 무엇을 할지 알려 줍니다.',
            ctaPrimary: '로그인',
            ctaSecondary: '무엇을 하는가',
            trustBadge: '사내 도구입니다 · 계정은 관리자가 만듭니다',
            socialProof: '',
            featuresTitle: '실제로 하는 일',
            pricingTitle: '',
            testimonialsTitle: '',
            ctaBannerTitle: '로그인하고 시작하세요',
            ctaBannerSub: '아이앤디 주식회사가 직접 만들어 쓰고 있습니다',
            footerCopy: '© 2026 아이앤디 주식회사',
        },
        features: {
            pipeline: { title: '파이프라인', desc: '건마다 금액과 예상 마감을 달아 세우고, 견적서를 내면 기회가 자동으로 잡힙니다. 두 번 적을 일이 없습니다.' },
            ai: { title: '영업 코치', desc: '매출이 꺾인 곳, 연락이 끊긴 곳, 크는데 방치된 곳을 짚어 줍니다. 규칙으로 찾고 근거 숫자를 그대로 보여 줍니다.' },
            analytics: { title: '매출 추정', desc: '최근 4년 실적을 고객 유형별로 나눠 연말까지 내다봅니다. 영업일수와 공휴일을 감안합니다.' },
            activity: { title: '아침 브리핑', desc: '매일 아침 7시, 오늘 일정·하기로 한 것·기한 지난 것·멈춰 있는 것을 텔레그램으로 보냅니다.' },
            team: { title: '문서', desc: '견적서·발주서·거래명세서를 회사 카달로그 디자인 그대로 PDF로 냅니다. 파일 이름까지 붙여 줍니다.' },
            mobile: { title: '종이를 자료로', desc: '엑셀·ERP 화면 사진·휴대폰 사진을 읽어 기록으로 만듭니다. 바로 저장하지 않고 화면에서 확인한 뒤에 들어갑니다.' },
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
