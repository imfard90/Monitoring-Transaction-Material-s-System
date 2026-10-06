'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { endOfDay, isWithinInterval, startOfDay } from 'date-fns';
import React, { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import CardBox from '@/app/components/shared/CardBox';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import type { InOutTagItem, InOutTagRow } from '@/lib/types/inventory';
import {
    getInOutTags,
    getInoutTagItemsByHeaderId,
    getReturnMaterialItemsByHeaderId,
} from '../_actions/tag-actions';
import CreateTagModal from './CreateTagModal';
import InOutTagCards from './InOutTagCards';
import InOutTagDetailModal from './InOutTagDetailModal';
import InOutTagTable from './InOutTagTable';
import UpdateTagModal from './UpdateTagModal';

export default function InOutTagClient() {
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [toWhFilter, setToWhFilter] = useState<string>('all');
    const [dateFilter, setDateFilter] = useState<DateRange | undefined>();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [detailRow, setDetailRow] = useState<InOutTagRow | null>(null);

    const [updateRow, setUpdateRow] = useState<InOutTagRow | null>(null);
    const [updateItems, setUpdateItems] = useState<InOutTagItem[]>([]);

    const handleUpdateClick = async (row: InOutTagRow) => {
        setUpdateRow(row);
        // Fetch items from correct table based on row type
        if (row.type === 'return') {
            const res = await getReturnMaterialItemsByHeaderId(Number(row.id));
            setUpdateItems((res.success ? res.data || [] : []) as unknown as InOutTagItem[]);
        } else {
            const res = await getInoutTagItemsByHeaderId(Number(row.id));
            setUpdateItems((res.success ? res.data || [] : []) as unknown as InOutTagItem[]);
        }
    };

    const { data, isLoading } = useQuery({
        queryKey: ['inoutTags'],
        queryFn: async () => {
            const res = await getInOutTags();
            if (!res.success) throw new Error('Failed to fetch tags');
            return res;
        },
        staleTime: 1000 * 60, // 1 minute
    });

    const tags = data?.data || [];
    const counts = data?.counts || { requested: 0, in_transit: 0, closed: 0, cancel: 0 };

    // Get unique To WH list for the dropdown
    const uniqueToWh = React.useMemo(() => {
        const set = new Set(tags.map((t) => t.to_wh_name).filter((t): t is string => Boolean(t)));
        return Array.from(set).sort();
    }, [tags]);

    const [monthsOffset, setMonthsOffset] = useState(0);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMoreData, setHasMoreData] = useState(true);
    const queryClient = useQueryClient();

    const loadMore = React.useCallback(async () => {
        if (isLoadingMore || !hasMoreData) return;
        setIsLoadingMore(true);
        try {
            const nextOffset = monthsOffset + 5;
            const res = await getInOutTags(nextOffset, 5);
            if (!res.success || !res.data || res.data.length === 0) {
                setHasMoreData(false);
            } else {
                queryClient.setQueryData(
                    ['inoutTags'],
                    (old: { data: InOutTagRow[] } | undefined) => {
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

    const filteredTags = React.useMemo(() => {
        return tags.filter((tag) => {
            const matchesStatus = filterStatus === 'all' || tag.end_status === filterStatus;
            const matchesToWh = toWhFilter === 'all' || tag.to_wh_name === toWhFilter;

            const searchLower = searchQuery.toLowerCase();
            const reqId = tag.request_id ? String(tag.request_id).toLowerCase() : '';
            const sendId = tag.send_id ? String(tag.send_id).toLowerCase() : '';
            const accId = tag.accept_id ? String(tag.accept_id).toLowerCase() : '';

            const matchesSearch =
                !searchQuery ||
                reqId.includes(searchLower) ||
                sendId.includes(searchLower) ||
                accId.includes(searchLower);

            let matchesDate = true;
            if (dateFilter?.from && tag.request_time) {
                const tagDate = new Date(tag.request_time);
                if (dateFilter.to) {
                    matchesDate = isWithinInterval(tagDate, {
                        start: startOfDay(dateFilter.from),
                        end: endOfDay(dateFilter.to),
                    });
                } else {
                    matchesDate = isWithinInterval(tagDate, {
                        start: startOfDay(dateFilter.from),
                        end: endOfDay(dateFilter.from),
                    });
                }
            }

            return matchesStatus && matchesToWh && matchesSearch && matchesDate;
        });
    }, [tags, filterStatus, searchQuery, toWhFilter, dateFilter]);

    React.useEffect(() => {
        if (
            searchQuery &&
            filteredTags.length === 0 &&
            hasMoreData &&
            !isLoadingMore &&
            !isLoading
        ) {
            const timeout = setTimeout(() => {
                loadMore();
            }, 800);
            return () => clearTimeout(timeout);
        }
    }, [searchQuery, filteredTags.length, hasMoreData, isLoadingMore, isLoading, loadMore]);

    const handleClearFilters = () => {
        setFilterStatus('all');
        setSearchQuery('');
        setToWhFilter('all');
        setDateFilter(undefined);
    };

    return (
        <StaggerContainer className="flex flex-col space-y-6">
            <StaggerItem>
                <InOutTagCards
                    counts={counts}
                    activeFilter={filterStatus}
                    onFilterChange={setFilterStatus}
                />
            </StaggerItem>

            <StaggerItem>
                <CardBox className="p-4 w-full overflow-hidden">
                    <InOutTagTable
                        data={filteredTags as InOutTagRow[]}
                        isLoading={isLoading}
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        toWhOptions={uniqueToWh}
                        toWhFilter={toWhFilter}
                        onToWhChange={setToWhFilter}
                        dateFilter={dateFilter}
                        onDateFilterChange={setDateFilter}
                        onClearFilters={handleClearFilters}
                        onCreateClick={() => setIsCreateModalOpen(true)}
                        onViewDetail={(row) => setDetailRow(row)}
                        onUpdateClick={handleUpdateClick}
                    />
                    {isLoadingMore && (
                        <div className="text-center text-sm text-gray-500 py-2">
                            Mencari di 5 bulan sebelumnya...
                        </div>
                    )}
                </CardBox>
            </StaggerItem>

            <CreateTagModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
            />

            <InOutTagDetailModal
                row={detailRow}
                isOpen={detailRow !== null}
                onClose={() => setDetailRow(null)}
            />

            <UpdateTagModal
                row={updateRow}
                items={updateItems}
                isOpen={updateRow !== null}
                onClose={() => setUpdateRow(null)}
            />
        </StaggerContainer>
    );
}
