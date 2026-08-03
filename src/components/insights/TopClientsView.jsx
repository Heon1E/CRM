import React from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { Link } from 'react-router-dom'
import { AlertTriangle, TrendingUp } from 'lucide-react'
import { formatCurrency } from '../../utils/formatters'

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

const TopClientsView = ({ data, stats, advice }) => {
    if (!data || data.length === 0) {
        return (
            <div className="p-8 text-center text-gray-500">
                <p>상위 고객 데이터가 없습니다.</p>
            </div>
        )
    }

    // Prepare chart data
    const chartData = data.slice(0, 5).map((client, idx) => ({
        name: client.company,
        value: client.total,
        percentage: client.percentage
    }))

    const topThreePercentage = data.slice(0, 3).reduce((sum, c) => sum + Number(c.percentage), 0)
    const isHighRisk = topThreePercentage > 70

    return (
        <div className="p-6">
            {/* Warning Banner */}
            {isHighRisk && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                        <div>
                            <h3 className="font-bold text-red-900 mb-1">
                                매출 집중도 리스크 경고
                            </h3>
                            <p className="text-sm text-red-700">
                                상위 3개 고객사가 전체 매출의 {topThreePercentage.toFixed(1)}%를 차지하고 있습니다.
                                고객 다변화를 통해 리스크를 분산하세요.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Chart */}
                <div>
                    <h4 className="font-bold text-gray-700 mb-4">매출 분포</h4>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ percentage }) => `${percentage}%`}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value) => formatCurrency(value)} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Table */}
                <div>
                    <h4 className="font-bold text-gray-700 mb-4">상위 고객사 목록</h4>
                    <div className="space-y-3">
                        {data.slice(0, 10).map((client, idx) => (
                            <div
                                key={client.id}
                                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm"
                                        style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                                    >
                                        {idx + 1}
                                    </div>
                                    <div>
                                        <Link
                                            to={`/clients/${client.id}`}
                                            className="font-semibold text-sm text-blue-600 hover:text-blue-800 hover:underline"
                                        >
                                            {client.company}
                                        </Link>
                                        <p className="text-xs text-gray-500">{client.percentage}% 기여</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-sm text-gray-900">
                                        {formatCurrency(client.total)}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Stats Footer */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                        <p className="text-xs text-gray-500 mb-1">상위 3개 집중도</p>
                        <p className={`text-lg font-bold ${isHighRisk ? 'text-red-600' : 'text-green-600'}`}>
                            {topThreePercentage.toFixed(1)}%
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 mb-1">총 고객사</p>
                        <p className="text-lg font-bold text-gray-900">{data.length}개</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 mb-1">총 매출</p>
                        <p className="text-lg font-bold text-gray-900">
                            {formatCurrency(data.reduce((sum, c) => sum + c.total, 0))}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default TopClientsView
