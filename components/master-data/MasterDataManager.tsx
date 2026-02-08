"use client";

import { useState } from "react";
import CountryTab from "./tabs/CountryTab";
import DioceseTab from "./tabs/DioceseTab";
import ChurchesTab from "./tabs/ChurchesTab";
import SchedulesTab from "./tabs/SchedulesTab";
import BulkImportExport from "./BulkImportExport";

type TabType = 'countries' | 'dioceses' | 'churches' | 'schedules';

export default function MasterDataManager() {
    const [activeTab, setActiveTab] = useState<TabType>('countries');

    const tabs: { id: TabType; label: string }[] = [
        { id: 'countries', label: 'Negara' },
        { id: 'dioceses', label: 'Keuskupan' },
        { id: 'churches', label: 'Paroki' },
        { id: 'schedules', label: '🗓️ Jadwal Misa' },
    ];

    return (
        <div className="space-y-8">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-primary to-action tracking-tight">Master Data Management</h1>
                    <p className="text-slate-500 mt-1">Pusat pengelolaan master data global (Negara, Keuskupan, Paroki).</p>
                </div>
                <BulkImportExport />
            </div>

            {/* Tab Navigation */}
            <div className="border-b border-slate-200 flex gap-8 overflow-x-auto">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`pb-3 text-sm font-medium transition-all whitespace-nowrap px-1 relative ${activeTab === tab.id
                            ? 'text-brand-primary font-bold'
                            : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        {tab.label}
                        {activeTab === tab.id && (
                            <div className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-brand-primary to-action rounded-t-full" />
                        )}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="min-h-[500px] mt-6">
                {activeTab === 'countries' && <CountryTab />}
                {activeTab === 'dioceses' && <DioceseTab />}
                {activeTab === 'churches' && <ChurchesTab />}
                {activeTab === 'schedules' && <SchedulesTab />}
            </div>
        </div>
    );
}
