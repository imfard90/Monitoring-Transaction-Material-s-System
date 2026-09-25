'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
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

    const [monthsOffset, setMonthsOffset] = useState(0);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMoreData, setHasMoreData] = useState(true);
    const queryClient = useQueryClient();

    const loadMore = async () => {
        if (isLoadingMore || !hasMoreData) return;
        setIsLoadingMore(true);
        try {
            const nextOffset = monthsOffset + 5;
            const res = await getOutMaterials(nextOffset, 5);
            if (!res.success || !res.data || res.data.length === 0) {
                setHasMoreData(false);
            } else {
                queryClient.setQueryData(['outMaterials'], (old: any) => {
                    if (!old) return old;
                    return {
                        ...old,
                        data: [...old.data, ...res.data],
                    };
                });
                setMonthsOffset(nextOffset);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingMore(false);
        }
    };

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

    React.useEffect(() => {
        if (
            searchQuery &&
            filteredData.length === 0 &&
            hasMoreData &&
            !isLoadingMore &&
            !isLoading
        ) {
            const timeout = setTimeout(() => {
                loadMore();
            }, 800);
            return () => clearTimeout(timeout);
        }
    }, [searchQuery, filteredData.length, hasMoreData, isLoadingMore, isLoading]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="flex flex-col flex-1 min-h-0 space-y-6"
        >
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
            >
                <OutMaterialCards
                    counts={counts}
                    activeFilter={filterStatus}
                    onFilterChange={setFilterStatus}
                />
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="flex flex-col flex-1 min-h-0"
            >
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
                    {isLoadingMore && (
                        <div className="text-center text-sm text-gray-500 py-2">
                            Mencari di 5 bulan sebelumnya...
                        </div>
                    )}
                </CardBox>
            </motion.div>

            <OutMaterialDetailModal
                row={detailRow}
                isOpen={detailRow !== null}
                onClose={() => setDetailRow(null)}
            />
        </motion.div>
    );
}
