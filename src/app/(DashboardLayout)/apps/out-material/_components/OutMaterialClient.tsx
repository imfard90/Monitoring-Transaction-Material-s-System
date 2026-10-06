'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { endOfDay, isWithinInterval, startOfDay } from 'date-fns';
import React, { useCallback, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import CardBox from '@/app/components/shared/CardBox';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import type { OutMaterialRow } from '@/lib/types/inventory';
import { getOutMaterials } from '../_actions/out-material-actions';
import OutMaterialCards from './OutMaterialCards';
import OutMaterialDetailModal from './OutMaterialDetailModal';
import OutMaterialTable from './OutMaterialTable';

export default function OutMaterialClient() {
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [whFilter, setWhFilter] = useState<string>('all');
    const [dateFilter, setDateFilter] = useState<DateRange | undefined>();
    const [detailRow, setDetailRow] = useState<OutMaterialRow | null>(null);

    const { data, isLoading } = useQuery({
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
        const set = new Set(headers.map((h: OutMaterialRow) => h.nama_gudang).filter(Boolean));
        return Array.from(set).sort() as string[];
    }, [headers]);

    const [monthsOffset, setMonthsOffset] = useState(0);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMoreData, setHasMoreData] = useState(true);
    const queryClient = useQueryClient();

    const loadMore = useCallback(async () => {
        if (isLoadingMore || !hasMoreData) return;
        setIsLoadingMore(true);
        try {
            const nextOffset = monthsOffset + 5;
            const res = await getOutMaterials(nextOffset, 5);
            if (!res.success || !res.data || res.data.length === 0) {
                setHasMoreData(false);
            } else {
                queryClient.setQueryData(
                    ['outMaterials'],
                    (old: { data: OutMaterialRow[] } | undefined) => {
                        if (!old) return old;
                        return {
                            ...old,
                            data: [...old.data, ...res.data],
                        };
                    }
                );
                setMonthsOffset(nextOffset);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingMore(false);
        }
    }, [isLoadingMore, hasMoreData, monthsOffset, queryClient]);

    const filteredData = React.useMemo(() => {
        return headers.filter((header: OutMaterialRow) => {
            const matchesStatus = filterStatus === 'all' || header.end_status === filterStatus;
            const matchesWh = whFilter === 'all' || header.nama_gudang === whFilter;

            const searchLower = searchQuery.toLowerCase();
            const reqId = header.request_id ? String(header.request_id).toLowerCase() : '';
            const resId = header.id_reservasi ? String(header.id_reservasi).toLowerCase() : '';
            const sapNum = header.sap_number ? String(header.sap_number).toLowerCase() : '';
            const nik = header.nik_teknisi ? String(header.nik_teknisi).toLowerCase() : '';

            const matchesSearch =
                !searchQuery ||
                reqId.includes(searchLower) ||
                resId.includes(searchLower) ||
                sapNum.includes(searchLower) ||
                nik.includes(searchLower);

            let matchesDate = true;
            if (dateFilter?.from && header.request_time) {
                const rowDate = new Date(header.request_time);
                if (dateFilter.to) {
                    matchesDate = isWithinInterval(rowDate, {
                        start: startOfDay(dateFilter.from),
                        end: endOfDay(dateFilter.to),
                    });
                } else {
                    matchesDate = isWithinInterval(rowDate, {
                        start: startOfDay(dateFilter.from),
                        end: endOfDay(dateFilter.from),
                    });
                }
            }

            return matchesStatus && matchesWh && matchesSearch && matchesDate;
        });
    }, [headers, filterStatus, whFilter, searchQuery, dateFilter]);

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
    }, [searchQuery, filteredData.length, hasMoreData, isLoadingMore, isLoading, loadMore]);

    const handleClearFilters = () => {
        setFilterStatus('all');
        setSearchQuery('');
        setWhFilter('all');
        setDateFilter(undefined);
    };

    return (
        <StaggerContainer className="flex flex-col space-y-6">
            <StaggerItem>
                <OutMaterialCards
                    counts={counts}
                    activeFilter={filterStatus}
                    onFilterChange={setFilterStatus}
                />
            </StaggerItem>

            <StaggerItem>
                <CardBox className="p-4 w-full overflow-hidden">
                    <OutMaterialTable
                        data={filteredData}
                        isLoading={isLoading}
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        whOptions={whOptions}
                        whFilter={whFilter}
                        onWhChange={setWhFilter}
                        dateFilter={dateFilter}
                        onDateFilterChange={setDateFilter}
                        onViewDetail={(row) => setDetailRow(row)}
                        onClearFilters={handleClearFilters}
                    />
                    {isLoadingMore && (
                        <div className="text-center text-sm text-gray-500 py-2">
                            Mencari di 5 bulan sebelumnya...
                        </div>
                    )}
                </CardBox>
            </StaggerItem>

            <OutMaterialDetailModal
                row={detailRow as OutMaterialRow}
                isOpen={detailRow !== null}
                onClose={() => setDetailRow(null)}
            />
        </StaggerContainer>
    );
}
