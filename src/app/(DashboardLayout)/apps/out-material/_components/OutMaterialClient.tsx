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

    // Apply filters robustly
    const filteredData = React.useMemo(() => {
        return headers.filter((header) => {
            const matchesStatus = filterStatus === 'all' || header.end_status === filterStatus;

            if (!searchQuery) return matchesStatus;

            const searchLower = searchQuery.toLowerCase();
            const reqId = header.request_id ? String(header.request_id).toLowerCase() : '';
            const resId = header.id_reservasi ? String(header.id_reservasi).toLowerCase() : '';
            const sapNum = header.sap_number ? String(header.sap_number).toLowerCase() : '';

            const matchesSearch =
                reqId.includes(searchLower) ||
                resId.includes(searchLower) ||
                sapNum.includes(searchLower);

            return matchesStatus && matchesSearch;
        });
    }, [headers, filterStatus, searchQuery]);

    return (
        <div className="space-y-6">
            <OutMaterialCards
                counts={counts}
                activeFilter={filterStatus}
                onFilterChange={setFilterStatus}
            />

            <CardBox>
                <OutMaterialTable
                    data={filteredData}
                    isLoading={isLoading}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
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
