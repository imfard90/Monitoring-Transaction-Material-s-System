'use client';

import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import CardBox from '@/app/components/shared/CardBox';
import { getInOutTags, getInoutTagItemsByHeaderId, getReturnMaterialItemsByHeaderId } from '../_actions/tag-actions';
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
            setUpdateItems(res.success ? (res.data || []) : []);
        } else {
            const res = await getInoutTagItemsByHeaderId(row.id);
            setUpdateItems(res.success ? (res.data || []) : []);
        }
    };

    const { data, isLoading, error } = useQuery({
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

    // Apply filters robustly
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

    return (
        <div className="space-y-6">
            <InOutTagCards
                counts={counts}
                activeFilter={filterStatus}
                onFilterChange={setFilterStatus}
            />

            <CardBox>
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
            </CardBox>

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
        </div>
    );
}
