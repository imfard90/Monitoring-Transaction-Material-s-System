'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Card } from '@/components/ui/card';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import type { InOutTagItem, InOutTagRow } from '@/lib/types/inventory';
import {
    getInoutTagItemsByHeaderId,
    getReturnMaterialItemsByHeaderId,
} from '../_actions/tag-actions';
import CreateTagModal from './CreateTagModal';
import InOutTagCards from './InOutTagCards';
import InOutTagDetailModal from './InOutTagDetailModal';
import InOutTagTable from './InOutTagTable';
import UpdateTagModal from './UpdateTagModal';

interface InOutTagClientProps {
    canCreateTag: boolean;
    isStaff: boolean;
    warehouseIds: number[];
    initialData: InOutTagRow[];
    counts: {
        requested: number;
        in_transit: number;
        closed: number;
        cancel: number;
    };
    pagination?: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
    toWhOptions: string[];
    initialFilters?: {
        status?: string;
        warehouse?: string;
        search?: string;
        startDate?: string;
        endDate?: string;
    };
}

export default function InOutTagClient({
    canCreateTag,
    isStaff,
    warehouseIds,
    initialData,
    counts,
    pagination,
    toWhOptions,
    initialFilters = { status: 'all', warehouse: 'all', search: '' },
}: InOutTagClientProps) {
    const router = useRouter();

    const [filterStatus, setFilterStatus] = useState<string>(initialFilters?.status ?? 'all');
    const [searchQuery, setSearchQuery] = useState<string>(initialFilters?.search ?? '');
    const [toWhFilter, setToWhFilter] = useState<string>(initialFilters?.warehouse ?? 'all');
    const [dateFilter, setDateFilter] = useState<DateRange | undefined>(() => {
        if (initialFilters?.startDate) {
            return {
                from: new Date(initialFilters.startDate),
                to: initialFilters?.endDate ? new Date(initialFilters.endDate) : undefined,
            };
        }
        return undefined;
    });

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [detailRow, setDetailRow] = useState<InOutTagRow | null>(null);

    const [updateRow, setUpdateRow] = useState<InOutTagRow | null>(null);
    const [updateItems, setUpdateItems] = useState<InOutTagItem[]>([]);

    const applyFilters = useCallback(
        (overrides: {
            page?: number;
            pageSize?: number;
            status?: string;
            warehouse?: string;
            search?: string;
            date?: DateRange | undefined;
        }) => {
            const params = new URLSearchParams();
            const page = overrides.page ?? 1;
            const pageSize = overrides.pageSize ?? pagination?.pageSize ?? 20;
            const status = overrides.status === undefined ? filterStatus : overrides.status;
            const wh = overrides.warehouse === undefined ? toWhFilter : overrides.warehouse;
            const search = overrides.search === undefined ? searchQuery : overrides.search;
            const date = overrides.date === undefined ? dateFilter : overrides.date;

            params.set('page', page.toString());
            params.set('pageSize', pageSize.toString());

            if (status && status !== 'all') params.set('status', status);
            if (wh && wh !== 'all') params.set('warehouse', wh);
            if (search.trim()) params.set('search', search.trim());
            if (date?.from) params.set('startDate', date.from.toISOString());
            if (date?.to) params.set('endDate', date.to.toISOString());

            router.push(`/apps/inout-tag?${params.toString()}`);
        },
        [pagination?.pageSize, filterStatus, toWhFilter, searchQuery, dateFilter, router]
    );

    const handleFilterStatusChange = (status: string) => {
        setFilterStatus(status);
        applyFilters({ status, page: 1 });
    };

    const handleSearchChange = (val: string) => {
        setSearchQuery(val);
        applyFilters({ search: val, page: 1 });
    };

    const handleToWhChange = (wh: string) => {
        setToWhFilter(wh);
        applyFilters({ warehouse: wh, page: 1 });
    };

    const handleDateFilterChange = (range: DateRange | undefined) => {
        setDateFilter(range);
        applyFilters({ date: range, page: 1 });
    };

    const handleClearFilters = () => {
        setFilterStatus('all');
        setSearchQuery('');
        setToWhFilter('all');
        setDateFilter(undefined);
        router.push('/apps/inout-tag?page=1&pageSize=20');
    };

    const handlePaginationChange = (page: number, pageSize: number) => {
        applyFilters({ page, pageSize });
    };

    const handleUpdateClick = async (row: InOutTagRow) => {
        setUpdateRow(row);
        setUpdateItems([]); // Clear stale items immediately
        if (row.type === 'return') {
            const res = await getReturnMaterialItemsByHeaderId(Number(row.id));
            setUpdateItems((res.success ? res.data || [] : []) as unknown as InOutTagItem[]);
        } else {
            const res = await getInoutTagItemsByHeaderId(Number(row.id));
            setUpdateItems((res.success ? res.data || [] : []) as unknown as InOutTagItem[]);
        }
    };

    return (
        <StaggerContainer className="flex flex-col space-y-6 w-full min-w-0 max-w-full">
            <StaggerItem className="w-full min-w-0 max-w-full">
                <InOutTagCards
                    counts={counts}
                    activeFilter={filterStatus}
                    onFilterChange={handleFilterStatusChange}
                />
            </StaggerItem>

            <StaggerItem className="w-full min-w-0 max-w-full">
                <Card className="card border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md p-4 sm:p-5 motion-reduce:transition-none w-full min-w-0 max-w-full overflow-hidden">
                    <InOutTagTable
                        data={initialData}
                        pagination={pagination}
                        onPaginationChange={handlePaginationChange}
                        searchQuery={searchQuery}
                        onSearchChange={handleSearchChange}
                        toWhOptions={toWhOptions}
                        toWhFilter={toWhFilter}
                        onToWhChange={handleToWhChange}
                        dateFilter={dateFilter}
                        onDateFilterChange={handleDateFilterChange}
                        onClearFilters={handleClearFilters}
                        onCreateClick={() => setIsCreateModalOpen(true)}
                        onViewDetail={(row) => setDetailRow(row)}
                        onUpdateClick={handleUpdateClick}
                        canCreateTag={canCreateTag}
                    />
                </Card>
            </StaggerItem>

            {isCreateModalOpen && (
                <CreateTagModal
                    isOpen={isCreateModalOpen}
                    onClose={() => {
                        setIsCreateModalOpen(false);
                        router.refresh();
                    }}
                />
            )}

            {updateRow && (
                <UpdateTagModal
                    isOpen={true}
                    onClose={() => {
                        setUpdateRow(null);
                        router.refresh();
                    }}
                    row={updateRow}
                    items={updateItems}
                    isStaff={isStaff}
                    warehouseIds={warehouseIds}
                />
            )}

            {detailRow && (
                <InOutTagDetailModal
                    row={detailRow}
                    isOpen={true}
                    onClose={() => setDetailRow(null)}
                />
            )}
        </StaggerContainer>
    );
}
