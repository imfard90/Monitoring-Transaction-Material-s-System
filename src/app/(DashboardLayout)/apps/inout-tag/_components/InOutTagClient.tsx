'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Card } from '@/components/ui/card';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { useDebouncedCallback } from '@/hooks/use-debounce';
import { useTableFilterNavigation } from '@/hooks/use-table-filters';
import type { InOutTagItem, InOutTagRow } from '@/lib/types/inventory';
import {
    getInoutTagItemsByHeaderId,
    getReturnMaterialItemsByHeaderId,
} from '../_actions/tag-actions';
import InOutTagCards from './InOutTagCards';
import InOutTagTable from './InOutTagTable';

const CreateTagModal = dynamic(() => import('./CreateTagModal'), { ssr: false });
const UpdateTagModal = dynamic(() => import('./UpdateTagModal'), { ssr: false });
const InOutTagDetailModal = dynamic(() => import('./InOutTagDetailModal'), { ssr: false });

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

    const { navigate } = useTableFilterNavigation({
        basePath: '/apps/inout-tag',
        currentState: {
            search: searchQuery,
            warehouse: toWhFilter,
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
                    warehouse: overrides.warehouse === undefined ? toWhFilter : overrides.warehouse,
                },
                {
                    status: overrides.status === undefined ? filterStatus : overrides.status,
                    startDate: date?.from?.toISOString(),
                    endDate: date?.to?.toISOString(),
                }
            );
        },
        [navigate, pagination?.pageSize, searchQuery, toWhFilter, filterStatus, dateFilter]
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

    const handleToWhChange = (wh: string) => {
        setToWhFilter(wh);
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
        setToWhFilter('all');
        setDateFilter(undefined);
        navigate(
            { page: 1, pageSize: pagination?.pageSize ?? 20, search: '', warehouse: 'all' },
            { status: 'all', startDate: undefined, endDate: undefined }
        );
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
                <Card className="border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md p-4 sm:p-5 motion-reduce:transition-none w-full min-w-0 max-w-full overflow-hidden">
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
