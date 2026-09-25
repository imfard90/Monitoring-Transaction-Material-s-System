'use client';

import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import CardBox from '@/app/components/shared/CardBox';
import { getOutMaterials } from '../_actions/out-material-actions';
import OutMaterialCards from './OutMaterialCards';
import OutMaterialDetailModal from './OutMaterialDetailModal';
import OutMaterialTable from './OutMaterialTable';

export default function OutMaterialClient() {
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [whFilter, setWhFilter] = useState<string>('all');
    const [detailRow, setDetailRow] = useState<any | null>(null);

    const { data, isLoading, error } = useQuery({
        queryKey: ['outMaterials'],
        queryFn: async () => {
            const res = await getOutMaterials();
            if (!res.success) throw new Error('Failed to fetch out materials');
            return res;
        },
        staleTime: 1000 * 60, // 1 minute
    });

    const headers = data?.data || [];
    const counts = data?.counts || { wait_approve: 0, request: 0, intech: 0, close: 0 };

    const whOptions = React.useMemo(() => {
        const set = new Set(headers.map((h: any) => h.nama_gudang).filter(Boolean));
        return Array.from(set).sort() as string[];
    }, [headers]);

    // Apply filters robustly
    const filteredData = React.useMemo(() => {
        return headers.filter((header: any) => {
            const matchesStatus = filterStatus === 'all' || header.end_status === filterStatus;
            const matchesWh = whFilter === 'all' || header.nama_gudang === whFilter;

            if (!searchQuery) return matchesStatus && matchesWh;

            const searchLower = searchQuery.toLowerCase();
            const reqId = header.request_id ? String(header.request_id).toLowerCase() : '';
            const resId = header.id_reservasi ? String(header.id_reservasi).toLowerCase() : '';
            const sapNum = header.sap_number ? String(header.sap_number).toLowerCase() : '';

            const matchesSearch =
                reqId.includes(searchLower) ||
                resId.includes(searchLower) ||
                sapNum.includes(searchLower);

            return matchesStatus && matchesWh && matchesSearch;
        });
    }, [headers, filterStatus, whFilter, searchQuery]);

    return (
        <div className="flex flex-col flex-1 min-h-0  space-y-6">
            <OutMaterialCards
                counts={counts}
                activeFilter={filterStatus}
                onFilterChange={setFilterStatus}
            />

            <CardBox className="flex flex-col flex-1 min-h-0">
                <OutMaterialTable
                    data={filteredData}
                    isLoading={isLoading}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    whOptions={whOptions}
                    whFilter={whFilter}
                    onWhChange={setWhFilter}
                    onViewDetail={(row) => setDetailRow(row)}
                />
            </CardBox>

            <OutMaterialDetailModal
                row={detailRow}
                isOpen={detailRow !== null}
                onClose={() => setDetailRow(null)}
            />
        </div>
    );
}
