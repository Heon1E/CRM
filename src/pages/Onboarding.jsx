import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import {
    Building2, Users, Target, CheckCircle, ArrowRight, ArrowLeft, Sparkles
} from 'lucide-react'

// ─── Steps config ─────────────────────────────────────────────────────────────
const STEPS_EN = [
    { id: 1, title: 'Company Setup', icon: Building2, subtitle: 'Tell us about your business' },
    { id: 2, title: 'Your Team', icon: Users, subtitle: 'How big is your sales team?' },
    { id: 3, title: 'First Client', icon: Target, subtitle: 'Add your first client (optional)' },
]
const STEPS_KO = [
    { id: 1, title: '회사 설정', icon: Building2, subtitle: '비즈니스에 대해 알려주세요' },
    { id: 2, title: '팀 구성', icon: Users, subtitle: '영업팀 규모는 어떻게 되나요?' },
    { id: 3, title: '첫 번째 고객', icon: Target, subtitle: '첫 고객을 추가하세요 (선택)' },
]

const INDUSTRIES_EN = ['Technology', 'Finance', 'Healthcare', 'Manufacturing', 'Retail', 'Real Estate', 'Education', 'Other']
const INDUSTRIES_KO = ['IT/기술', '금융', '의료/헬스케어', '제조업', '유통/리테일', '부동산', '교육', '기타']

const TEAM_SIZES = [
    { label: 'Just me', labelKo: '나 혼자', value: '1' },
    { label: '2–5 people', labelKo: '2–5명', value: '2-5' },
    { label: '6–20 people', labelKo: '6–20명', value: '6-20' },
    { label: '21–50 people', labelKo: '21–50명', value: '21-50' },
    { label: '50+ people', labelKo: '50명 이상', value: '50+' },
]

// ─── Step Indicator ───────────────────────────────────────────────────────────
const StepIndicator = ({ steps, current }) => (
    <div className="flex items-center justify-center gap-0 mb-10">
        {steps.map((step, i) => {
            const done = step.id < current
            const active = step.id === current
            const Icon = step.icon
            return (
                <React.Fragment key={step.id}>
                    <div className="flex flex-col items-center">
                        <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${done ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30' :
                                active ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30 ring-4 ring-blue-100' :
                                    'bg-gray-100 text-gray-400'
                            }`}>
                            {done ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                        </div>
                        <span className={`text-[10px] font-bold mt-1.5 ${active ? 'text-blue-600' : done ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {step.title}
                        </span>
                    </div>
                    {i < steps.length - 1 && (
                        <div className={`h-0.5 w-16 mx-1 mb-5 transition-all ${done ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                    )}
                </React.Fragment>
            )
        })}
    </div>
)

// ─── Step 1: Company Info ─────────────────────────────────────────────────────
const Step1 = ({ data, setData, locale }) => {
    const isEn = locale === 'en'
    const industries = isEn ? INDUSTRIES_EN : INDUSTRIES_KO
    return (
        <div className="space-y-5">
            <div>
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1.5">
                    {isEn ? 'Company Name *' : '회사명 *'}
                </label>
                <input
                    type="text"
                    value={data.companyName}
                    onChange={e => setData(d => ({ ...d, companyName: e.target.value }))}
                    placeholder={isEn ? 'e.g. Acme Corporation' : '예: 주식회사 아크미'}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
            </div>
            <div>
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1.5">
                    {isEn ? 'Industry' : '업종'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                    {industries.map((ind) => (
                        <button
                            key={ind}
                            onClick={() => setData(d => ({ ...d, industry: ind }))}
                            className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all text-left ${data.industry === ind
                                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                                }`}
                        >
                            {ind}
                        </button>
                    ))}
                </div>
            </div>
            <div>
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1.5">
                    {isEn ? 'Website (optional)' : '웹사이트 (선택)'}
                </label>
                <input
                    type="url"
                    value={data.website}
                    onChange={e => setData(d => ({ ...d, website: e.target.value }))}
                    placeholder="https://yourcompany.com"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
            </div>
        </div>
    )
}

// ─── Step 2: Team Size ────────────────────────────────────────────────────────
const Step2 = ({ data, setData, locale }) => {
    const isEn = locale === 'en'
    return (
        <div className="space-y-4">
            <p className="text-sm text-gray-500">
                {isEn
                    ? 'This helps us tailor your CRM experience for your team.'
                    : '팀에 맞는 CRM 경험을 제공하는 데 도움이 됩니다.'}
            </p>
            <div className="space-y-2.5">
                {TEAM_SIZES.map((size) => (
                    <button
                        key={size.value}
                        onClick={() => setData(d => ({ ...d, teamSize: size.value }))}
                        className={`w-full flex items-center justify-between px-5 py-4 rounded-xl border-2 transition-all ${data.teamSize === size.value
                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                    >
                        <span className="text-sm font-bold">{isEn ? size.label : size.labelKo}</span>
                        {data.teamSize === size.value && (
                            <CheckCircle className="w-5 h-5 text-blue-500" />
                        )}
                    </button>
                ))}
            </div>
            <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-black text-blue-700">{isEn ? 'AI-Powered Setup' : 'AI 맞춤 설정'}</span>
                </div>
                <p className="text-xs text-blue-600">
                    {isEn
                        ? 'Based on your team size, we\'ll pre-configure your pipeline stages and KPI targets.'
                        : '팀 규모에 따라 파이프라인 단계와 KPI 목표를 사전 구성해 드립니다.'}
                </p>
            </div>
        </div>
    )
}

// ─── Step 3: First Client ─────────────────────────────────────────────────────
const Step3 = ({ data, setData, locale }) => {
    const isEn = locale === 'en'
    return (
        <div className="space-y-5">
            <p className="text-sm text-gray-500">
                {isEn
                    ? 'Start with your most important client. You can add more after setup.'
                    : '가장 중요한 고객부터 시작하세요. 설정 후 더 추가할 수 있습니다.'}
            </p>
            <div>
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1.5">
                    {isEn ? 'Client / Company Name' : '고객사명'}
                </label>
                <input
                    type="text"
                    value={data.firstClientName}
                    onChange={e => setData(d => ({ ...d, firstClientName: e.target.value }))}
                    placeholder={isEn ? 'e.g. Global Tech Inc.' : '예: 글로벌테크 주식회사'}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
            </div>
            <div>
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1.5">
                    {isEn ? 'Contact Person' : '담당자명'}
                </label>
                <input
                    type="text"
                    value={data.firstClientContact}
                    onChange={e => setData(d => ({ ...d, firstClientContact: e.target.value }))}
                    placeholder={isEn ? 'e.g. John Smith' : '예: 홍길동'}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
            </div>
            <div>
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1.5">
                    {isEn ? 'Email' : '이메일'}
                </label>
                <input
                    type="email"
                    value={data.firstClientEmail}
                    onChange={e => setData(d => ({ ...d, firstClientEmail: e.target.value }))}
                    placeholder="contact@company.com"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
            </div>
            <p className="text-[11px] text-gray-400 text-center">
                {isEn ? '✓ You can skip this step and add clients later from the dashboard.' : '✓ 이 단계를 건너뛰고 나중에 대시보드에서 고객을 추가할 수 있습니다.'}
            </p>
        </div>
    )
}

// ─── Main Onboarding ──────────────────────────────────────────────────────────
const Onboarding = () => {
    const navigate = useNavigate()
    const { user } = useAuth()
    const { locale } = useI18n()
    const isEn = locale === 'en'
    const steps = isEn ? STEPS_EN : STEPS_KO

    const [step, setStep] = useState(1)
    const [saving, setSaving] = useState(false)
    const [data, setData] = useState({
        companyName: '',
        industry: '',
        website: '',
        teamSize: '',
        firstClientName: '',
        firstClientContact: '',
        firstClientEmail: '',
    })

    const canNext = () => {
        if (step === 1) return data.companyName.trim().length > 0
        if (step === 2) return data.teamSize.length > 0
        return true // step 3 optional
    }

    const handleFinish = async () => {
        setSaving(true)
        try {
            // 1. Save company settings to Supabase
            if (data.companyName && user?.id) {
                await supabase.from('settings').upsert({
                    user_id: user.id,
                    company_name: data.companyName,
                    industry: data.industry,
                    team_size: data.teamSize,
                    website: data.website,
                    onboarding_completed: true,
                }, { onConflict: 'user_id' })
            }
            // 2. Save first client if provided
            if (data.firstClientName && user?.id) {
                await supabase.from('clients').insert({
                    user_id: user.id,
                    name: data.firstClientContact || data.firstClientName,
                    company: data.firstClientName,
                    email: data.firstClientEmail || null,
                    status: 'active',
                    created_at: new Date().toISOString(),
                })
            }
        } catch (e) {
            console.error('Onboarding save error:', e)
        } finally {
            setSaving(false)
            navigate('/')
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] flex items-center justify-center p-6 font-['Inter',sans-serif]">

            {/* Background glow */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-blue-600/15 rounded-full blur-3xl"></div>
            </div>

            <div className="w-full max-w-lg relative z-10">

                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-1 mb-2">
                        <span className="text-2xl font-black text-white">Xavian</span>
                        <span className="text-2xl font-black text-blue-400">CRM</span>
                    </div>
                    <p className="text-sm text-gray-400">
                        {isEn ? `Welcome! Let's set up your workspace in 2 minutes.` : `환영합니다! 2분 안에 워크스페이스를 설정해 드릴게요.`}
                    </p>
                </div>

                {/* Card */}
                <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
                    {/* Step header */}
                    <div className="bg-gray-50 border-b border-gray-100 px-8 pt-8 pb-6">
                        <StepIndicator steps={steps} current={step} />
                        <div className="text-center">
                            <h2 className="text-xl font-black text-gray-900">{steps[step - 1].title}</h2>
                            <p className="text-sm text-gray-500 mt-1">{steps[step - 1].subtitle}</p>
                        </div>
                    </div>

                    {/* Step content */}
                    <div className="px-8 py-6">
                        {step === 1 && <Step1 data={data} setData={setData} locale={locale} />}
                        {step === 2 && <Step2 data={data} setData={setData} locale={locale} />}
                        {step === 3 && <Step3 data={data} setData={setData} locale={locale} />}
                    </div>

                    {/* Navigation */}
                    <div className="px-8 pb-8 flex items-center justify-between">
                        {step > 1 ? (
                            <button
                                onClick={() => setStep(s => s - 1)}
                                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 font-bold transition-colors"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                {isEn ? 'Back' : '이전'}
                            </button>
                        ) : (
                            <button
                                onClick={() => navigate('/')}
                                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                {isEn ? 'Skip setup' : '설정 건너뛰기'}
                            </button>
                        )}

                        {step < 3 ? (
                            <button
                                onClick={() => setStep(s => s + 1)}
                                disabled={!canNext()}
                                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold px-7 py-3 rounded-xl text-sm transition-all"
                            >
                                {isEn ? 'Continue' : '계속'}
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        ) : (
                            <button
                                onClick={handleFinish}
                                disabled={saving}
                                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold px-7 py-3 rounded-xl text-sm transition-all shadow-lg shadow-emerald-500/30"
                            >
                                {saving
                                    ? (isEn ? 'Setting up...' : '설정 중...')
                                    : (isEn ? 'Go to Dashboard' : '대시보드로 이동')}
                                <CheckCircle className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Progress dots */}
                <div className="flex justify-center gap-2 mt-6">
                    {steps.map((s) => (
                        <div key={s.id} className={`h-1.5 rounded-full transition-all ${s.id === step ? 'w-8 bg-blue-400' : s.id < step ? 'w-3 bg-emerald-400' : 'w-3 bg-white/20'}`} />
                    ))}
                </div>

            </div>
        </div>
    )
}

export default Onboarding
