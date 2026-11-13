'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Card } from '@/components/ui/card';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { useDebouncedCallback } from '@/hooks/use-debounce';
import { useTableFilterNavigation } from '@/hooks/use-table-filters';
import type { OutMaterialRow } from '@/lib/types/inventory';
import OutMaterialCards from './OutMaterialCards';
import OutMaterialTable from './OutMaterialTable';

const OutMaterialDetailModal = dynamic(() => import('./OutMaterialDetailModal'), {
    ssr: false,
});

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

    const { navigate } = useTableFilterNavigation({
        basePath: '/apps/out-material',
        currentState: {
            search: searchQuery,
            warehouse: whFilter,
            page: 1,
            pageSize: pagination?.pageSize ?? 20,
        },
        extraParams: {
            status: filterStatus,
            startDate: dateFilter?.from?.toISOString(),
            endDate: dateFilter?.to?.toISOString(),
        },
    });

    const applyFilters = useCallback(
        (overrides: {
            page?: number;
            pageSize?: number;
            status?: string;
            warehouse?: string;
            search?: string;
            date?: DateRange | undefined;
        }) => {
            const date = overrides.date === undefined ? dateFilter : overrides.date;
            navigate(
                {
                    page: overrides.page ?? 1,
                    pageSize: overrides.pageSize ?? pagination?.pageSize ?? 20,
                    search: overrides.search === undefined ? searchQuery : overrides.search,
                    warehouse: overrides.warehouse === undefined ? whFilter : overrides.warehouse,
                },
                {
                    status: overrides.status === undefined ? filterStatus : overrides.status,
                    startDate: date?.from?.toISOString(),
                    endDate: date?.to?.toISOString(),
                }
            );
        },
        [navigate, pagination?.pageSize, searchQuery, whFilter, filterStatus, dateFilter]
    );

    const debouncedApplySearch = useDebouncedCallback((val: string) => {
        applyFilters({ search: val, page: 1 });
    }, 350);

    const handleFilterStatusChange = (status: string) => {
        setFilterStatus(status);
        applyFilters({ status, page: 1 });
    };

    const handleSearchChange = (val: string) => {
        setSearchQuery(val);
        debouncedApplySearch(val);
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
        debouncedApplySearch.cancel();
        setFilterStatus('all');
        setSearchQuery('');
        setWhFilter('all');
        setDateFilter(undefined);
        navigate(
            { page: 1, pageSize: pagination?.pageSize ?? 20, search: '', warehouse: 'all' },
            { status: 'all', startDate: undefined, endDate: undefined }
        );
    };

    const handlePaginationChange = (page: number, pageSize: number) => {
        applyFilters({ page, pageSize });
    };

    return (
        <StaggerContainer className="flex flex-col space-y-6 w-full min-w-0 max-w-full">
            <StaggerItem className="w-full min-w-0 max-w-full">
                <OutMaterialCards
                    counts={counts}
                    activeFilter={filterStatus}
                    onFilterChange={handleFilterStatusChange}
                />
            </StaggerItem>

            <StaggerItem className="w-full min-w-0 max-w-full">
                <Card className="border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md p-4 sm:p-5 motion-reduce:transition-none w-full min-w-0 max-w-full overflow-hidden">
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
