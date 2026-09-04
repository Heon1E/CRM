import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Phone, UserPlus, Clock, ArrowRight, CheckCircle2 } from 'lucide-react'
import { useData } from '../contexts/DataContext'

const ActionCenter = () => {
    const { clients, activities } = useData()

    // [Logic] Find 'Dormant' Leads (Interest/Proposal stage but no recent activity)
    const dormantLeads = useMemo(() => {
        if (!clients || !activities) return []

        const now = new Date()
        const oneWeekAgo = new Date(now.setDate(now.getDate() - 7))

        // Target Statuses
        const targetStatuses = ['관심', '제안', '협의']

        return clients
            .filter(c => targetStatuses.includes(c.status))
            .filter(c => {
                const clientActivities = activities.filter(a => String(a.clientId) === String(c.id))
                // Sort by date desc
                clientActivities.sort((a, b) => new Date(b.date) - new Date(a.date))
                const lastActivity = clientActivities[0]

                // If no activity at all, or last activity is older than 1 week
                if (!lastActivity) return true
                return new Date(lastActivity.date) < oneWeekAgo
            })
            .slice(0, 3) // Top 3
    }, [clients, activities])

    // [Logic] Upcoming Follow-ups (This is a placeholder for real scheduled tasks if we had them, 
    // for now we can infer 'Sales Pending' clients)
    const hotDeals = useMemo(() => {
        if (!clients) return []
        return clients
            .filter(c => c.status === '계약대기' || c.status === '견적')
            .slice(0, 3)
    }, [clients])

    if (!clients || clients.length === 0) return null

    return (
        <div className="flex flex-col gap-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Attention Needed (Dormant) */}
                {dormantLeads.length > 0 ? (
                    <div className="bg-white border border-oem-border rounded-oem p-5 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3 opacity-5">
                            <AlertCircle className="w-16 h-16 text-orange-500" />
                        </div>
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-1.5 bg-orange-100 text-orange-600 rounded-full">
                                <Clock className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-800">Requires Attention</h3>
                                <p className="text-[10px] text-slate-500">7일 넘게 연락이 없는 곳</p>
                            </div>
                        </div>
                        <div className="space-y-3 relative z-10">
                            {dormantLeads.map(client => (
                                <div key={client.id} className="flex items-center justify-between bg-orange-50/50 p-2 rounded border border-orange-100/50">
                                    <div>
                                        <p className="text-xs font-bold text-slate-700">{client.company}</p>
                                        <p className="text-[10px] text-slate-500">{client.contact_person} · {client.status}</p>
                                    </div>
                                    <Link to={`/clients/${client.id}`} className="p-1.5 bg-white border border-orange-200 text-orange-600 rounded hover:bg-orange-50 transition-colors text-[10px] font-bold flex items-center gap-1">
                                        <Phone className="w-3 h-3" /> Contact
                                    </Link>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="bg-white border border-oem-border rounded-oem p-4 shadow-sm flex items-center justify-between opacity-80 hover:opacity-100 transition-opacity">
                        <div className="flex items-center gap-3">
                            <div className="p-1.5 bg-green-100 text-[color:var(--success)] rounded-full">
                                <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-700">All Leads Active</h3>
                                <p className="text-[10px] text-slate-500">연락이 끊긴 곳이 없습니다.</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. Hot Deals (Closing Phase) */}
                {hotDeals.length > 0 ? (
                    <div className="bg-white border border-oem-border rounded-oem p-5 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3 opacity-5">
                            <UserPlus className="w-16 h-16 text-oem-blue" />
                        </div>
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-1.5 bg-oem-grey-light text-oem-blue rounded-full">
                                <ArrowRight className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-800">Closing Priorities</h3>
                                <p className="text-[10px] text-slate-500">마무리 단계인 기회</p>
                            </div>
                        </div>
                        <div className="space-y-3 relative z-10">
                            {hotDeals.map(client => (
                                <div key={client.id} className="flex items-center justify-between bg-oem-grey-light/50 p-2 rounded border border-oem-border/50">
                                    <div>
                                        <p className="text-xs font-bold text-slate-700">{client.company}</p>
                                        <p className="text-[10px] text-slate-500">{client.contact_person} · <span className="text-oem-blue font-bold">{client.status}</span></p>
                                    </div>
                                    <Link to={`/clients/${client.id}`} className="text-[11px] font-bold text-oem-blue hover:underline">
                                        View Deal →
                                    </Link>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="bg-white border border-oem-border rounded-oem p-4 shadow-sm flex items-center justify-between opacity-80 hover:opacity-100 transition-opacity">
                        <div className="flex items-center gap-3">
                            <div className="p-1.5 bg-gray-100 text-gray-500 rounded-full">
                                <Clock className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-700">No Closing Deals</h3>
                                <p className="text-[10px] text-slate-500">마무리 단계인 기회가 없습니다.</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default ActionCenter
