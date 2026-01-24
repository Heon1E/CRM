import React, { useState } from 'react';
import OracleInput from '../components/common/OracleInput';
import { Save, Plus, Trash2, Search } from 'lucide-react';

const OrderEntry = () => {
    const [formData, setFormData] = useState({
        orderNum: 'ORD-2024-001',
        clientName: '',
    });

    return (
        <div className="oracle-window-container max-w-4xl mx-auto mt-4 oracle-raised">
            {/* Window Title Bar */}
            <div className="oracle-title-bar">
                <span className="text-[11px] font-bold">FORM: ORDER_ENTRY_SYSTEM - [INSERT]</span>
                <div className="flex gap-1">
                    <button className="w-5 h-4 bg-gray-300 border border-white font-bold text-[9px] text-black">_</button>
                    <button className="w-5 h-4 bg-gray-300 border border-white font-bold text-[9px] text-black">X</button>
                </div>
            </div>

            {/* Toolbar Section */}
            <div className="oracle-toolbar bg-[#d0d0d0] p-1 border-b border-gray-400 flex gap-1">
                <button className="oracle-raised flex items-center gap-1 px-2 py-1 hover:bg-gray-100">
                    <Save className="w-3 h-3" /> <span className="text-[10px] font-bold">SAVE</span>
                </button>
                <button className="oracle-raised flex items-center gap-1 px-2 py-1 hover:bg-gray-100">
                    <Plus className="w-3 h-3" /> <span className="text-[10px] font-bold">INSERT</span>
                </button>
                <button className="oracle-raised flex items-center gap-1 px-2 py-1 hover:bg-gray-100 text-red-700">
                    <Trash2 className="w-3 h-3" /> <span className="text-[10px] font-bold">DELETE</span>
                </button>
                <div className="flex-1"></div>
                <button className="oracle-raised flex items-center gap-1 px-2 py-1 hover:bg-gray-100 italic">
                    <span className="text-[10px] font-bold">EXIT</span>
                </button>
            </div>

            {/* Main Content (Canvas) */}
            <div className="bg-[#c0c0c0] p-4 space-y-3">
                {/* Row 1: Order Number */}
                <div className="flex items-center">
                    <OracleInput
                        label="ORDER_ID"
                        value={formData.orderNum}
                        onChange={(e) => setFormData({ ...formData, orderNum: e.target.value })}
                        labelWidth="100px"
                        className="flex-1"
                    />
                </div>

                {/* Row 2: Client with LOV button */}
                <div className="flex items-center gap-1">
                    <OracleInput
                        label="CLIENT_NAME"
                        value={formData.clientName}
                        onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                        labelWidth="100px"
                        className="flex-1"
                    />
                    <button className="oracle-raised w-10 h-[22px] flex items-center justify-center bg-gray-200 hover:bg-gray-100" title="List of Values">
                        <Search className="w-3 h-3" />
                        <span className="text-[9px] font-bold ml-1">LOV</span>
                    </button>
                </div>

                {/* Dense Grid Example - Information Section */}
                <div className="oracle-raised bg-[#e0e0e0] p-2 mt-4 space-y-2">
                    <label className="text-[10px] font-bold border-b border-gray-400 block mb-2">SYSTEM_INFORMATION</label>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <div className="flex gap-2">
                            <label className="text-[10px] font-bold w-20">CREATED_BY:</label>
                            <div className="oracle-sunken px-2 bg-gray-100 w-full h-[18px] text-[10px]">ADMIN_SYS</div>
                        </div>
                        <div className="flex gap-2">
                            <label className="text-[10px] font-bold w-20">LOG_DATE:</label>
                            <div className="oracle-sunken px-2 bg-gray-100 w-full h-[18px] text-[10px]">2024-01-24</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Status Bar */}
            <div className="bg-[#c0c0c0] h-6 border-t border-white px-2 mt-4 flex items-center">
                <span className="text-[9px] font-bold text-gray-600">STATE: EDITING... RECORD 1/1</span>
            </div>
        </div>
    );
};

export default OrderEntry;
