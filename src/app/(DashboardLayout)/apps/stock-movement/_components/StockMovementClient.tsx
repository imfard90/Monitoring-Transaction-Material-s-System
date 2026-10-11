'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import CardBox from '@/app/components/shared/CardBox';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import type { StockMovementItem } from './MovementTable';
import MovementTable from './MovementTable';

interface StockMovementClientProps {
    initialData: StockMovementItem[];
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
        material?: string;
        types?: string[];
        startDate?: string;
        endDate?: string;
    };
}

export default function StockMovementClient({
    initialData,
    pagination,
    filterOptions,
    initialFilters = { search: '', warehouse: 'all', material: 'all', types: [] },
}: StockMovementClientProps) {
    const router = useRouter();

    const [searchQuery, setSearchQuery] = useState(initialFilters?.search ?? '');
    const [warehouseFilter, setWarehouseFilter] = useState(initialFilters?.warehouse ?? 'all');
    const [materialFilter, setMaterialFilter] = useState(initialFilters?.material ?? 'all');
    const [typeFilter, setTypeFilter] = useState<string[]>(initialFilters?.types ?? []);
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
            material?: string;
            types?: string[];
            date?: DateRange | undefined;
        }) => {
            const params = new URLSearchParams();
            const page = overrides.page ?? 1;
            const pageSize = overrides.pageSize ?? pagination?.pageSize ?? 20;
            const search = overrides.search === undefined ? searchQuery : overrides.search;
            const wh = overrides.warehouse === undefined ? warehouseFilter : overrides.warehouse;
            const mat = overrides.material === undefined ? materialFilter : overrides.material;
            const types = overrides.types === undefined ? typeFilter : overrides.types;
            const date = overrides.date === undefined ? dateRange : overrides.date;

            params.set('page', page.toString());
            params.set('pageSize', pageSize.toString());

            if (search.trim()) params.set('search', search.trim());
            if (wh && wh !== 'all') params.set('warehouse', wh);
            if (mat && mat !== 'all') params.set('material', mat);
            if (types && types.length > 0) params.set('type', types.join(','));
            if (date?.from) params.set('startDate', date.from.toISOString());
            if (date?.to) params.set('endDate', date.to.toISOString());

            router.push(`/apps/stock-movement?${params.toString()}`);
        },
        [
            pagination?.pageSize,
            searchQuery,
            warehouseFilter,
            materialFilter,
            typeFilter,
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

    const handleMaterialChange = (val: string) => {
        setMaterialFilter(val);
        applyFilters({ material: val, page: 1 });
    };

    const handleTypeChange = (types: string[]) => {
        setTypeFilter(types);
        applyFilters({ types, page: 1 });
    };

    const handleDateRangeChange = (range: DateRange | undefined) => {
        setDateRange(range);
        applyFilters({ date: range, page: 1 });
    };

    const handleClearFilters = () => {
        setSearchQuery('');
        setDateRange(undefined);
        setWarehouseFilter('all');
        setMaterialFilter('all');
        setTypeFilter([]);
        router.push('/apps/stock-movement?page=1&pageSize=20');
    };

    const handlePaginationChange = (page: number, pageSize: number) => {
        applyFilters({ page, pageSize });
    };

    return (
        <StaggerContainer className="flex flex-col flex-1 md:h-full md:min-h-0 md:overflow-hidden">
            <StaggerItem className="flex flex-col flex-1 md:h-full md:min-h-0 md:overflow-hidden">
                <CardBox className="flex flex-col flex-1 p-6 md:h-full md:min-h-0 md:overflow-hidden">
                    <MovementTable
                        data={initialData}
                        pagination={pagination}
                        onPaginationChange={handlePaginationChange}
                        searchQuery={searchQuery}
                        onSearchChange={handleSearchChange}
                        dateRange={dateRange}
                        onDateRangeChange={handleDateRangeChange}
                        warehouseFilter={warehouseFilter}
                        onWarehouseFilterChange={handleWarehouseChange}
                        materialFilter={materialFilter}
                        onMaterialFilterChange={handleMaterialChange}
                        typeFilter={typeFilter}
                        onTypeFilterChange={handleTypeChange}
                        uniqueWarehouses={filterOptions.warehouses}
                        uniqueMaterials={filterOptions.materials}
                        uniqueTypes={filterOptions.types}
                        onClearFilters={handleClearFilters}
                    />
                </CardBox>
            </StaggerItem>
        </StaggerContainer>
    );
}
