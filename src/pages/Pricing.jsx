import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Check, ChevronDown, Rocket } from 'lucide-react'

const Pricing = () => {
    const [isAnnual, setIsAnnual] = useState(false)
    const [openFaq, setOpenFaq] = useState(null)

    const toggleFaq = (index) => {
        if (openFaq === index) setOpenFaq(null)
        else setOpenFaq(index)
    }

    const faqs = [
        {
            question: "Can I cancel anytime?",
            answer: "Yes, you can cancel your subscription at any time from your account settings. If you cancel, your access will continue until the end of your current billing period."
        },
        {
            question: "Is there a free trial?",
            answer: "Absolutely. We offer a 14-day free trial on our Pro plan so you can experience all the advanced features before committing."
        },
        {
            question: "What payment methods do you accept?",
            answer: "We accept all major credit cards, PayPal, and for Enterprise plans, we also support bank transfers and invoicing."
        },
        {
            question: "Do you offer discounts for non-profits?",
            answer: "Yes, we love supporting great causes. Non-profits are eligible for a 50% discount on all our annual plans. Contact our support team to apply."
        }
    ]

    return (
        <div className="bg-[#F8FAFC] text-slate-900 min-h-screen font-['Inter',sans-serif]">
            {/* Navigation */}
            <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-[#833CF6]/10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        <Link to="/landing" className="flex items-center gap-2 group">
                            <div className="bg-[#833CF6] rounded-lg p-1">
                                <Rocket className="w-5 h-5 text-white" />
                            </div>
                            <span className="font-bold text-xl tracking-tight text-slate-900 group-hover:text-[#833CF6] transition-colors">Xavian CRM</span>
                        </Link>
                        <div className="hidden md:flex items-center space-x-8">
                            <Link to="/landing" className="text-sm font-medium text-slate-600 hover:text-[#833CF6] transition-colors">Product</Link>
                            <Link to="/landing" className="text-sm font-medium text-slate-600 hover:text-[#833CF6] transition-colors">Features</Link>
                            <Link to="/pricing" className="text-sm font-bold text-[#833CF6] transition-colors">Pricing</Link>
                        </div>
                        <div className="flex items-center gap-3">
                            <Link to="/login" className="text-sm font-medium text-slate-600 px-4 py-2 hover:text-[#833CF6]">Sign In</Link>
                            <Link to="/login" className="bg-[#833CF6] text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-[#722EE0] transition-all shadow-lg shadow-[#833CF6]/20">
                                Get Started
                            </Link>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Header Section */}
            <section className="py-16 px-4">
                <div className="max-w-4xl mx-auto text-center space-y-6">
                    <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900">Simple, transparent pricing</h1>
                    <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                        Everything you need to scale your sales without the complexity. Choose the plan that fits your growth.
                    </p>
                    <div className="flex items-center justify-center gap-4 mt-10">
                        <span className={`text-sm font-medium ${!isAnnual ? 'text-slate-900' : 'text-slate-500'}`}>Monthly</span>
                        <button
                            onClick={() => setIsAnnual(!isAnnual)}
                            className="relative inline-flex h-8 w-16 items-center rounded-full bg-[#833CF6]/10 cursor-pointer focus:outline-none"
                        >
                            <div className={`h-6 w-6 rounded-full bg-[#833CF6] shadow-sm transform transition-transform duration-200 ease-in-out ${isAnnual ? 'translate-x-9' : 'translate-x-1'}`} />
                        </button>
                        <span className={`text-sm font-medium flex items-center gap-2 ${isAnnual ? 'text-slate-900' : 'text-slate-500'}`}>
                            Annually
                            <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Save 20%</span>
                        </span>
                    </div>
                </div>
            </section>

            {/* Pricing Cards */}
            <section className="max-w-7xl mx-auto px-4 pb-24">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

                    {/* Starter Plan */}
                    <div className="bg-white border border-slate-200 rounded-xl p-8 flex flex-col shadow-sm hover:shadow-md transition-shadow">
                        <div className="mb-6">
                            <h3 className="text-lg font-bold text-slate-900">Starter</h3>
                            <p className="text-sm text-slate-500 mt-1">For growing teams</p>
                        </div>
                        <div className="mb-8">
                            <span className="text-4xl font-black">${isAnnual ? '23' : '29'}</span>
                            <span className="text-slate-500 font-medium">/mo</span>
                        </div>
                        <Link to="/login" className="w-full py-3 rounded-lg border-2 border-slate-100 text-slate-900 font-bold text-sm hover:bg-slate-50 transition-colors mb-8 text-center flex items-center justify-center">
                            Get Started
                        </Link>
                        <div className="space-y-4">
                            {['5 Core features', 'Basic CRM', 'Email tracking', 'Mobile app', 'Standard support'].map((feature, i) => (
                                <div key={i} className="flex items-center gap-3 text-sm text-slate-600">
                                    <CheckCircle2 className="text-[#833CF6] w-5 h-5 flex-shrink-0" />
                                    {feature}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Pro Plan */}
                    <div className="bg-white border-2 border-[#833CF6] rounded-xl p-8 flex flex-col relative shadow-xl shadow-[#833CF6]/10 transform md:-translate-y-4">
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#833CF6] text-white text-xs font-bold px-4 py-1.5 rounded-full">MOST POPULAR</div>
                        <div className="mb-6">
                            <h3 className="text-lg font-bold text-slate-900">Pro</h3>
                            <p className="text-sm text-slate-500 mt-1">Advanced sales tools</p>
                        </div>
                        <div className="mb-8">
                            <span className="text-4xl font-black">${isAnnual ? '63' : '79'}</span>
                            <span className="text-slate-500 font-medium">/mo</span>
                        </div>
                        <Link to="/login" className="w-full py-3 rounded-lg bg-[#833CF6] text-white font-bold text-sm hover:bg-[#722EE0] transition-all shadow-lg shadow-[#833CF6]/20 mb-8 text-center flex items-center justify-center">
                            Start Free Trial
                        </Link>
                        <div className="space-y-4">
                            {['Everything in Starter', 'Unlimited clients', 'Advanced reporting', 'Custom automations', 'Priority support'].map((feature, i) => (
                                <div key={i} className="flex items-center gap-3 text-sm text-slate-900 font-medium">
                                    <CheckCircle2 className="text-[#833CF6] w-5 h-5 flex-shrink-0" />
                                    {feature}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Enterprise Plan */}
                    <div className="bg-white border border-slate-200 rounded-xl p-8 flex flex-col shadow-sm hover:shadow-md transition-shadow">
                        <div className="mb-6">
                            <h3 className="text-lg font-bold text-slate-900">Enterprise</h3>
                            <p className="text-sm text-slate-500 mt-1">For large organizations</p>
                        </div>
                        <div className="mb-8">
                            <span className="text-4xl font-black">Custom</span>
                            <span className="text-slate-500 font-medium">/year</span>
                        </div>
                        <Link to="/login" className="w-full py-3 rounded-lg border-2 border-[#833CF6]/20 text-[#833CF6] font-bold text-sm hover:bg-[#833CF6]/5 transition-colors mb-8 text-center flex items-center justify-center">
                            Contact Sales
                        </Link>
                        <div className="space-y-4">
                            {['Custom integrations', 'SSO & SAML', 'Dedicated manager', '99.9% Uptime SLA', 'Security compliance'].map((feature, i) => (
                                <div key={i} className="flex items-center gap-3 text-sm text-slate-600">
                                    <CheckCircle2 className="text-[#833CF6] w-5 h-5 flex-shrink-0" />
                                    {feature}
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </section>

            {/* Feature Comparison */}
            <section className="max-w-7xl mx-auto px-4 py-24 border-t border-slate-200">
                <h2 className="text-3xl font-black text-center mb-16">Compare features</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                        <thead>
                            <tr className="border-b border-slate-200">
                                <th className="py-4 px-6 text-sm font-bold text-slate-900">Feature</th>
                                <th className="py-4 px-6 text-sm font-bold text-slate-600 text-center w-[15%]">Starter</th>
                                <th className="py-4 px-6 text-sm font-bold text-[#833CF6] text-center w-[15%]">Pro</th>
                                <th className="py-4 px-6 text-sm font-bold text-slate-600 text-center w-[15%]">Enterprise</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Sales Category */}
                            <tr className="bg-slate-50/50">
                                <td className="py-3 px-6 text-xs font-bold uppercase tracking-wider text-slate-500" colSpan="4">Sales</td>
                            </tr>
                            <tr className="border-b border-slate-100">
                                <td className="py-4 px-6 text-sm">Lead Management</td>
                                <td className="text-center py-4"><Check className="text-[#833CF6] w-5 h-5 mx-auto" /></td>
                                <td className="text-center py-4"><Check className="text-[#833CF6] w-5 h-5 mx-auto" /></td>
                                <td className="text-center py-4"><Check className="text-[#833CF6] w-5 h-5 mx-auto" /></td>
                            </tr>
                            <tr className="border-b border-slate-100">
                                <td className="py-4 px-6 text-sm">Opportunity Tracking</td>
                                <td className="text-center py-4"><Check className="text-[#833CF6] w-5 h-5 mx-auto" /></td>
                                <td className="text-center py-4"><Check className="text-[#833CF6] w-5 h-5 mx-auto" /></td>
                                <td className="text-center py-4"><Check className="text-[#833CF6] w-5 h-5 mx-auto" /></td>
                            </tr>
                            <tr className="border-b border-slate-100">
                                <td className="py-4 px-6 text-sm">Productivity Tools</td>
                                <td className="text-center py-4 text-slate-300">—</td>
                                <td className="text-center py-4"><Check className="text-[#833CF6] w-5 h-5 mx-auto" /></td>
                                <td className="text-center py-4"><Check className="text-[#833CF6] w-5 h-5 mx-auto" /></td>
                            </tr>

                            {/* Automation Category */}
                            <tr className="bg-slate-50/50">
                                <td className="py-3 px-6 text-xs font-bold uppercase tracking-wider text-slate-500" colSpan="4">Automation</td>
                            </tr>
                            <tr className="border-b border-slate-100">
                                <td className="py-4 px-6 text-sm">Email Templates</td>
                                <td className="text-center py-4 text-sm font-medium">5</td>
                                <td className="text-center py-4 text-sm font-medium">Unlimited</td>
                                <td className="text-center py-4 text-sm font-medium">Unlimited</td>
                            </tr>
                            <tr className="border-b border-slate-100">
                                <td className="py-4 px-6 text-sm">Custom Workflows</td>
                                <td className="text-center py-4 text-slate-300">—</td>
                                <td className="text-center py-4 text-sm font-medium">Up to 20</td>
                                <td className="text-center py-4 text-sm font-medium">Unlimited</td>
                            </tr>
                            <tr className="border-b border-slate-100">
                                <td className="py-4 px-6 text-sm">AI Lead Scoring</td>
                                <td className="text-center py-4 text-slate-300">—</td>
                                <td className="text-center py-4 text-slate-300">—</td>
                                <td className="text-center py-4"><Check className="text-[#833CF6] w-5 h-5 mx-auto" /></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            {/* FAQ Section */}
            <section className="max-w-4xl mx-auto px-4 py-24">
                <h2 className="text-3xl font-black text-center mb-12">Frequently Asked Questions</h2>
                <div className="space-y-4">
                    {faqs.map((faq, index) => (
                        <div key={index} className="bg-white border border-slate-200 rounded-lg p-6 hover:border-slate-300 transition-colors cursor-pointer" onClick={() => toggleFaq(index)}>
                            <div className="flex justify-between items-center w-full text-left font-bold text-slate-900 group">
                                <span className="group-hover:text-[#833CF6] transition-colors">{faq.question}</span>
                                <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${openFaq === index ? 'rotate-180' : ''}`} />
                            </div>
                            {openFaq === index && (
                                <p className="mt-4 text-slate-600 text-sm leading-relaxed animate-fade-in-down">
                                    {faq.answer}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-white border-t border-slate-200 py-12">
                <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-8">
                    <div className="flex items-center gap-2">
                        <div className="bg-[#833CF6]/20 rounded-lg p-1">
                            <Rocket className="w-5 h-5 text-[#833CF6]" />
                        </div>
                        <span className="font-bold text-lg tracking-tight text-slate-900">Xavian CRM</span>
                    </div>
                    <div className="flex gap-8">
                        <a href="#" className="text-sm text-slate-500 hover:text-[#833CF6] transition-colors">Terms</a>
                        <a href="#" className="text-sm text-slate-500 hover:text-[#833CF6] transition-colors">Privacy</a>
                        <a href="#" className="text-sm text-slate-500 hover:text-[#833CF6] transition-colors">Help</a>
                        <a href="#" className="text-sm text-slate-500 hover:text-[#833CF6] transition-colors">Status</a>
                    </div>
                    <p className="text-sm text-slate-400">© 2024 Xavian CRM Inc. All rights reserved.</p>
                </div>
            </footer>
        </div>
    )
}

export default Pricing
