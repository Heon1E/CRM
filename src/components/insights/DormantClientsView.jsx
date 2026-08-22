import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Phone, Mail, TrendingUp, Calendar, ExternalLink } from 'lucide-react'
import { formatCurrency } from '../../utils/formatters'

const DormantClientsView = ({ data, advice }) => {
    const [sortBy, setSortBy] = useState('historicalRevenue')

    if (!data || data.length === 0) {
        return (
            <div className="p-8 text-center text-gray-500">
                <p>휴면 고객 데이터가 없습니다.</p>
            </div>
        )
    }

    // Sort data
    const sortedData = [...data].sort((a, b) => {
        if (sortBy === 'historicalRevenue') {
            return b.historicalRevenue - a.historicalRevenue
        } else if (sortBy === 'lastSaleDate') {
            return new Date(b.lastSaleDate) - new Date(a.lastSaleDate)
        }
        return 0
    })

    return (
        <div className="p-6">
            {/* Summary */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                    <TrendingUp className="w-5 h-5 text-amber-600 mt-0.5" />
                    <div>
                        <h3 className="font-bold text-amber-900 mb-1">
                            {data.length}개 휴면 고객사 발견
                        </h3>
                        <p className="text-sm text-amber-700">
                            과거 3-12개월 전에 거래했으나 최근 3개월간 거래가 없는 고객사입니다.
                            과거 매출액이 높은 순서로 정렬되어 있습니다.
                        </p>
                    </div>
                </div>
            </div>

            {/* Sort Controls */}
            <div className="flex justify-between items-center mb-4">
                <h4 className="font-bold text-gray-700">고객사 목록</h4>
                <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-oem-blue"
                >
                    <option value="historicalRevenue">과거 매출액 순</option>
                    <option value="lastSaleDate">최근 거래일 순</option>
                </select>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                순위
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                회사명
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                담당자
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                연락처
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                                과거 매출
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                최근 거래일
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                                액션
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {sortedData.map((client, idx) => (
                            <tr key={client.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm font-bold text-gray-500">
                                    #{idx + 1}
                                </td>
                                <td className="px-4 py-3">
                                    <Link
                                        to={`/clients/${client.id}`}
                                        className="text-sm font-semibold text-oem-blue hover:text-oem-blue-dark hover:underline"
                                    >
                                        {client.company}
                                    </Link>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-700">
                                    {client.contactPerson || '-'}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex flex-col gap-1">
                                        {client.phone && (
                                            <a
                                                href={`tel:${client.phone}`}
                                                className="text-xs text-gray-600 hover:text-oem-blue-dark flex items-center gap-1"
                                            >
                                                <Phone className="w-3 h-3" />
                                                {client.phone}
                                            </a>
                                        )}
                                        {client.email && (
                                            <a
                                                href={`mailto:${client.email}`}
                                                className="text-xs text-gray-600 hover:text-oem-blue-dark flex items-center gap-1"
                                            >
                                                <Mail className="w-3 h-3" />
                                                {client.email}
                                            </a>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-sm font-bold text-right text-gray-900">
                                    {formatCurrency(client.historicalRevenue)}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600">
                                    <div className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        {client.lastSaleDate ? new Date(client.lastSaleDate).toLocaleDateString() : '-'}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <Link
                                        to={`/clients/${client.id}`}
                                        className="inline-flex items-center gap-1 text-xs text-oem-blue hover:text-oem-blue-dark font-medium"
                                    >
                                        상세보기
                                        <ExternalLink className="w-3 h-3" />
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Footer Stats */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                        <p className="text-xs text-gray-500 mb-1">총 고객사</p>
                        <p className="text-lg font-bold text-gray-900">{data.length}개</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 mb-1">총 과거 매출</p>
                        <p className="text-lg font-bold text-gray-900">
                            {formatCurrency(data.reduce((sum, c) => sum + c.historicalRevenue, 0))}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 mb-1">평균 매출</p>
                        <p className="text-lg font-bold text-gray-900">
                            {formatCurrency(data.reduce((sum, c) => sum + c.historicalRevenue, 0) / data.length)}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default DormantClientsView
