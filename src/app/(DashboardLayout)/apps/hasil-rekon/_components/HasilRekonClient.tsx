'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import CardBox from '@/app/components/shared/CardBox';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import type { HasilRekonData } from '../_actions/rekon-actions';
import EditRekonModal from './EditRekonModal';
import HasilRekonTable from './HasilRekonTable';

interface HasilRekonClientProps {
    initialData: HasilRekonData[];
    pagination?: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
    filterOptions: {
        warehouses: string[];
        materials: string[];
        types: string[];
    };
    initialFilters?: {
        search?: string;
        warehouse?: string;
        type?: string;
        material?: string;
        startDate?: string;
        endDate?: string;
    };
}

export default function HasilRekonClient({
    initialData,
    pagination,
    filterOptions,
    initialFilters = { search: '', warehouse: 'all', type: 'all', material: 'all' },
}: HasilRekonClientProps) {
    const router = useRouter();

    const [editRowData, setEditRowData] = useState<HasilRekonData | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    const [searchQuery, setSearchQuery] = useState(initialFilters?.search ?? '');
    const [warehouseFilter, setWarehouseFilter] = useState(initialFilters?.warehouse ?? 'all');
    const [typeFilter, setTypeFilter] = useState(initialFilters?.type ?? 'all');
    const [materialFilter, setMaterialFilter] = useState(initialFilters?.material ?? 'all');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
        if (initialFilters?.startDate) {
            return {
                from: new Date(initialFilters.startDate),
                to: initialFilters?.endDate ? new Date(initialFilters.endDate) : undefined,
            };
        }
        return undefined;
    });

    const applyFilters = useCallback(
        (overrides: {
            page?: number;
            pageSize?: number;
            search?: string;
            warehouse?: string;
            type?: string;
            material?: string;
            date?: DateRange | undefined;
        }) => {
            const params = new URLSearchParams();
            const page = overrides.page ?? 1;
            const pageSize = overrides.pageSize ?? pagination?.pageSize ?? 20;
            const search = overrides.search !== undefined ? overrides.search : searchQuery;
            const wh = overrides.warehouse !== undefined ? overrides.warehouse : warehouseFilter;
            const tp = overrides.type !== undefined ? overrides.type : typeFilter;
            const mat = overrides.material !== undefined ? overrides.material : materialFilter;
            const date = overrides.date !== undefined ? overrides.date : dateRange;

            params.set('page', page.toString());
            params.set('pageSize', pageSize.toString());

            if (search.trim()) params.set('search', search.trim());
            if (wh && wh !== 'all') params.set('warehouse', wh);
            if (tp && tp !== 'all') params.set('type', tp);
            if (mat && mat !== 'all') params.set('material', mat);
            if (date?.from) params.set('startDate', date.from.toISOString());
            if (date?.to) params.set('endDate', date.to.toISOString());

            router.push(`/apps/hasil-rekon?${params.toString()}`);
        },
        [
            pagination?.pageSize,
            searchQuery,
            warehouseFilter,
            typeFilter,
            materialFilter,
            dateRange,
            router,
        ]
    );

    const handleSearchChange = (val: string) => {
        setSearchQuery(val);
        applyFilters({ search: val, page: 1 });
    };

    const handleWarehouseChange = (val: string) => {
        setWarehouseFilter(val);
        applyFilters({ warehouse: val, page: 1 });
    };

    const handleTypeChange = (val: string) => {
        setTypeFilter(val);
        applyFilters({ type: val, page: 1 });
    };

    const handleMaterialChange = (val: string) => {
        setMaterialFilter(val);
        applyFilters({ material: val, page: 1 });
    };

    const handleDateRangeChange = (range: DateRange | undefined) => {
        setDateRange(range);
        applyFilters({ date: range, page: 1 });
    };

    const handleClearFilters = () => {
        setSearchQuery('');
        setDateRange(undefined);
        setWarehouseFilter('all');
        setTypeFilter('all');
        setMaterialFilter('all');
        router.push('/apps/hasil-rekon?page=1&pageSize=20');
    };

    const handlePaginationChange = (page: number, pageSize: number) => {
        applyFilters({ page, pageSize });
    };

    return (
        <StaggerContainer className="flex flex-col flex-1 md:h-full md:min-h-0 md:overflow-hidden">
            <StaggerItem className="flex flex-col flex-1 md:h-full md:min-h-0 md:overflow-hidden">
                <CardBox className="flex flex-col flex-1 p-6 md:h-full md:min-h-0 md:overflow-hidden">
                    <HasilRekonTable
                        data={initialData}
                        pagination={pagination}
                        onPaginationChange={handlePaginationChange}
                        searchQuery={searchQuery}
                        onSearchChange={handleSearchChange}
                        dateRange={dateRange}
                        onDateRangeChange={handleDateRangeChange}
                        warehouseFilter={warehouseFilter}
                        onWarehouseFilterChange={handleWarehouseChange}
                        typeFilter={typeFilter}
                        onTypeFilterChange={handleTypeChange}
                        materialFilter={materialFilter}
                        onMaterialFilterChange={handleMaterialChange}
                        uniqueWarehouses={filterOptions.warehouses}
                        uniqueTypes={filterOptions.types}
                        uniqueMaterials={filterOptions.materials}
                        onClearFilters={handleClearFilters}
                        onEditClick={(row) => {
                            setEditRowData(row);
                            setIsEditModalOpen(true);
                        }}
                    />
                </CardBox>
            </StaggerItem>

            {editRowData && (
                <EditRekonModal
                    isOpen={isEditModalOpen}
                    onClose={() => {
                        setIsEditModalOpen(false);
                        setEditRowData(null);
                        router.refresh();
                    }}
                    rowData={editRowData}
                />
            )}
        </StaggerContainer>
    );
}
