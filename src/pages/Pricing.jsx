import React from 'react'
import { Link } from 'react-router-dom'
import { Rocket, Phone, Mail, MapPin, ArrowRight } from 'lucide-react'

/**
 * 도입 문의 (`/pricing`)
 *
 * 여기에는 요금제 세 칸($0 / $35 / 문의)과 FAQ가 있었다. FAQ 내용이 이랬다 —
 * "언제든 해지할 수 있나요", "14일 무료 체험이 있습니다", "신용카드·PayPal을
 * 받습니다", "비영리 단체는 연간 요금 50% 할인". **하나도 사실이 아니다.**
 * 결제 수단도, 무료 체험도, 해지 절차도 없다.
 *
 * 로그인 없이 누구나 볼 수 있는 주소이고 거래처가 볼 수도 있다. 없는 상품을
 * 파는 화면을 띄워 둘 수는 없으므로, 실제로 말할 수 있는 것만 남긴다.
 *
 * 파는 물건이 되면 이 파일을 다시 요금제 화면으로 만들면 된다.
 */
const Pricing = () => (
    <div className="bg-[#F8FAFC] text-slate-900 min-h-screen font-['Inter',sans-serif]">

        <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-[#007538]/10">
            <div className="max-w-5xl mx-auto px-6">
                <div className="flex justify-between h-16 items-center">
                    <Link to="/landing" className="flex items-center gap-2 group min-h-[44px]">
                        <div className="bg-[#007538] rounded-lg p-1">
                            <Rocket className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-bold text-xl tracking-tight text-slate-900 group-hover:text-[#007538] transition-colors">
                            아이앤디 CRM
                        </span>
                    </Link>
                    <Link to="/login"
                        className="inline-flex items-center gap-2 bg-[#007538] hover:bg-[#005C2B] text-white text-sm font-bold px-5 py-2 rounded-lg transition-colors min-h-[44px]">
                        로그인 <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>
        </nav>

        <main className="max-w-3xl mx-auto px-6 py-20">
            <h1 className="text-4xl font-black mb-4">도입 문의</h1>
            <div className="w-16 h-1 bg-[#007538] rounded-full mb-8"></div>

            <p className="text-slate-600 leading-relaxed text-lg mb-6">
                이 프로그램은 <b className="text-slate-900">아이앤디 주식회사가 자기 영업 업무에 맞춰
                만들어 쓰고 있는 도구</b>입니다. 밖에 파는 상품이 아니라 요금제가 없습니다.
            </p>
            <p className="text-slate-600 leading-relaxed mb-12">
                IBC · 드럼 · 제리캔을 다루는 회사의 실제 업무를 그대로 담았습니다 —
                거래처 관리, 매출 대사, 채권 경과월 계산, 견적서 · 발주서 · 거래명세서,
                ERP 화면 판독. 비슷한 일을 하시는 곳이라면 이야기 나눌 수 있습니다.
            </p>

            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-5">아이앤디 주식회사</p>
                <ul className="space-y-4 text-slate-700">
                    <li className="flex items-center gap-3">
                        <Phone className="w-5 h-5 text-[#007538] shrink-0" />
                        <a href="tel:031-334-9625" className="font-bold hover:text-[#007538] transition-colors min-h-[44px] flex items-center">
                            031-334-9625
                        </a>
                    </li>
                    <li className="flex items-center gap-3">
                        <Mail className="w-5 h-5 text-[#007538] shrink-0" />
                        <a href="mailto:idibc@daum.net" className="font-bold hover:text-[#007538] transition-colors min-h-[44px] flex items-center">
                            idibc@daum.net
                        </a>
                    </li>
                    <li className="flex items-start gap-3">
                        <MapPin className="w-5 h-5 text-[#007538] shrink-0 mt-0.5" />
                        <span className="leading-relaxed">
                            경기도 용인시 처인구 백암면 삼백로 367-20<br />
                            <span className="text-sm text-slate-500">대표 이대현 · 사업자등록번호 142-81-76012</span>
                        </span>
                    </li>
                </ul>
            </div>

            <p className="mt-10 text-sm text-slate-500">
                계정이 필요하시면 관리자에게 요청하세요. 스스로 가입할 수는 없습니다.
            </p>
        </main>

        <footer className="border-t border-slate-200 py-8 px-6">
            <p className="max-w-3xl mx-auto text-xs text-slate-500">© 2026 아이앤디 주식회사</p>
        </footer>
    </div>
)

export default Pricing
