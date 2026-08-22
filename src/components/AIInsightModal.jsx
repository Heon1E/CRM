import React from 'react'
import { X } from 'lucide-react'
import DormantClientsView from './insights/DormantClientsView'
import TopClientsView from './insights/TopClientsView'
import RecentActivitiesView from './insights/RecentActivitiesView'

const AIInsightModal = ({ advice, stats, onClose }) => {
    if (!advice) return null

    // Render appropriate view based on advice type
    const renderContent = () => {
        switch (advice.adviceType) {
            case 'DORMANT_CLIENTS':
                return <DormantClientsView data={advice.relatedData} advice={advice} />

            case 'CONCENTRATION_RISK':
                return <TopClientsView data={advice.relatedData} stats={stats} advice={advice} />

            case 'LOW_ACTIVITY':
            case 'HIGH_ACTIVITY':
                return <RecentActivitiesView data={advice.relatedData} advice={advice} />

            default:
                return (
                    <div className="p-8 text-center">
                        <p className="text-lg font-semibold text-gray-700 mb-2">{advice.advice}</p>
                        {advice.reasoning && (
                            <p className="text-sm text-gray-500">{advice.reasoning}</p>
                        )}
                        {advice.actionItems && advice.actionItems.length > 0 && (
                            <div className="mt-6">
                                <h4 className="font-bold text-sm text-gray-700 mb-3">실행 항목</h4>
                                <ul className="text-left space-y-2">
                                    {advice.actionItems.map((item, idx) => (
                                        <li key={idx} className="flex items-start gap-2">
                                            <span className="text-oem-blue font-bold">•</span>
                                            <span className="text-sm text-gray-600">{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )
        }
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-gray-200 flex justify-between items-start">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <h2 className="text-xl font-bold text-gray-900">AI Sales Coach</h2>
                            {advice.isAIGenerated && (
                                <span className="text-xs bg-oem-grey-light text-oem-blue px-2 py-1 rounded-full font-bold border border-oem-border">
                                    AI 분석
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-gray-600">{advice.advice}</p>
                        {advice.reasoning && (
                            <p className="text-xs text-gray-500 mt-1 italic">{advice.reasoning}</p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="ml-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {renderContent()}
                </div>

                {/* Footer with Action Items */}
                {advice.actionItems && advice.actionItems.length > 0 && advice.adviceType !== 'GENERAL' && (
                    <div className="p-4 bg-gray-50 border-t border-gray-200">
                        <h4 className="font-bold text-sm text-gray-700 mb-2">추천 액션</h4>
                        <div className="flex flex-wrap gap-2">
                            {advice.actionItems.map((item, idx) => (
                                <span
                                    key={idx}
                                    className="text-xs bg-oem-grey-light text-oem-blue px-3 py-1 rounded-full font-medium"
                                >
                                    {item}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default AIInsightModal
