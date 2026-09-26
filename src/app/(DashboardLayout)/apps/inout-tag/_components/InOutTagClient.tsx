'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import React, { useState } from 'react';
import CardBox from '@/app/components/shared/CardBox';
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
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [detailRow, setDetailRow] = useState<any | null>(null);

    const [updateRow, setUpdateRow] = useState<any | null>(null);
    const [updateItems, setUpdateItems] = useState<any[]>([]);

    const handleUpdateClick = async (row: any) => {
        setUpdateRow(row);
        // Fetch items from correct table based on row type
        if (row.type === 'return') {
            const res = await getReturnMaterialItemsByHeaderId(row.id);
            setUpdateItems(res.success ? res.data || [] : []);
        } else {
            const res = await getInoutTagItemsByHeaderId(row.id);
            setUpdateItems(res.success ? res.data || [] : []);
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
                    (old: { data: any[] } | undefined) => {
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

            if (!searchQuery) return matchesStatus && matchesToWh;

            const searchLower = searchQuery.toLowerCase();
            const reqId = tag.request_id ? String(tag.request_id).toLowerCase() : '';
            const sendId = tag.send_id ? String(tag.send_id).toLowerCase() : '';
            const accId = tag.accept_id ? String(tag.accept_id).toLowerCase() : '';

            const matchesSearch =
                reqId.includes(searchLower) ||
                sendId.includes(searchLower) ||
                accId.includes(searchLower);

            return matchesStatus && matchesToWh && matchesSearch;
        });
    }, [tags, filterStatus, searchQuery, toWhFilter]);

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

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="flex flex-col space-y-6"
        >
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
            >
                <InOutTagCards
                    counts={counts}
                    activeFilter={filterStatus}
                    onFilterChange={setFilterStatus}
                />
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
            >
                <CardBox className="p-4 w-full overflow-hidden">
                    <InOutTagTable
                        data={filteredTags}
                        isLoading={isLoading}
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        toWhOptions={uniqueToWh}
                        toWhFilter={toWhFilter}
                        onToWhChange={setToWhFilter}
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
            </motion.div>

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
        </motion.div>
    );
}
