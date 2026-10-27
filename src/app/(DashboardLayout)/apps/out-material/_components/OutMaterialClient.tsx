'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Card } from '@/components/ui/card';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import type { OutMaterialRow } from '@/lib/types/inventory';
import OutMaterialCards from './OutMaterialCards';
import OutMaterialDetailModal from './OutMaterialDetailModal';
import OutMaterialTable from './OutMaterialTable';

interface OutMaterialClientProps {
    initialData: OutMaterialRow[];
    counts: {
        wait_approve: number;
        request: number;
        intech: number;
        close: number;
    };
    pagination?: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
    whOptions: string[];
    initialFilters?: {
        status?: string;
        warehouse?: string;
        search?: string;
        startDate?: string;
        endDate?: string;
    };
}

export default function OutMaterialClient({
    initialData,
    counts,
    pagination,
    whOptions,
    initialFilters = { status: 'all', warehouse: 'all', search: '' },
}: OutMaterialClientProps) {
    const router = useRouter();

    const [filterStatus, setFilterStatus] = useState<string>(initialFilters?.status ?? 'all');
    const [searchQuery, setSearchQuery] = useState<string>(initialFilters?.search ?? '');
    const [whFilter, setWhFilter] = useState<string>(initialFilters?.warehouse ?? 'all');
    const [dateFilter, setDateFilter] = useState<DateRange | undefined>(() => {
        if (initialFilters?.startDate) {
            return {
                from: new Date(initialFilters.startDate),
                to: initialFilters?.endDate ? new Date(initialFilters.endDate) : undefined,
            };
        }
        return undefined;
    });
    const [detailRow, setDetailRow] = useState<OutMaterialRow | null>(null);

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
            const wh = overrides.warehouse === undefined ? whFilter : overrides.warehouse;
            const search = overrides.search === undefined ? searchQuery : overrides.search;
            const date = overrides.date === undefined ? dateFilter : overrides.date;

            params.set('page', page.toString());
            params.set('pageSize', pageSize.toString());

            if (status && status !== 'all') params.set('status', status);
            if (wh && wh !== 'all') params.set('warehouse', wh);
            if (search.trim()) params.set('search', search.trim());
            if (date?.from) params.set('startDate', date.from.toISOString());
            if (date?.to) params.set('endDate', date.to.toISOString());

            router.push(`/apps/out-material?${params.toString()}`);
        },
        [pagination?.pageSize, filterStatus, whFilter, searchQuery, dateFilter, router]
    );

    const handleFilterStatusChange = (status: string) => {
        setFilterStatus(status);
        applyFilters({ status, page: 1 });
    };

    const handleSearchChange = (val: string) => {
        setSearchQuery(val);
        applyFilters({ search: val, page: 1 });
    };

    const handleWhChange = (wh: string) => {
        setWhFilter(wh);
        applyFilters({ warehouse: wh, page: 1 });
    };

    const handleDateFilterChange = (range: DateRange | undefined) => {
        setDateFilter(range);
        applyFilters({ date: range, page: 1 });
    };

    const handleClearFilters = () => {
        setFilterStatus('all');
        setSearchQuery('');
        setWhFilter('all');
        setDateFilter(undefined);
        router.push('/apps/out-material?page=1&pageSize=20');
    };

    const handlePaginationChange = (page: number, pageSize: number) => {
        applyFilters({ page, pageSize });
    };

    return (
        <StaggerContainer className="flex flex-col space-y-6">
            <StaggerItem>
                <OutMaterialCards
                    counts={counts}
                    activeFilter={filterStatus}
                    onFilterChange={handleFilterStatusChange}
                />
            </StaggerItem>

            <StaggerItem>
                <Card className="card border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md p-4 sm:p-5 motion-reduce:transition-none w-full">
                    <OutMaterialTable
                        data={initialData}
                        pagination={pagination}
                        onPaginationChange={handlePaginationChange}
                        searchQuery={searchQuery}
                        onSearchChange={handleSearchChange}
                        whOptions={whOptions}
                        whFilter={whFilter}
                        onWhChange={handleWhChange}
                        dateFilter={dateFilter}
                        onDateFilterChange={handleDateFilterChange}
                        onViewDetail={(row) => setDetailRow(row)}
                        onClearFilters={handleClearFilters}
                    />
                </Card>
            </StaggerItem>

            <OutMaterialDetailModal
                row={detailRow as OutMaterialRow}
                isOpen={detailRow !== null}
                onClose={() => setDetailRow(null)}
            />
        </StaggerContainer>
    );
}
