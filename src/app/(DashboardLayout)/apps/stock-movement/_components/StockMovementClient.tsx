'use client';

import { useCallback, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Card } from '@/components/ui/card';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { useDebouncedCallback } from '@/hooks/use-debounce';
import { useTableFilterNavigation } from '@/hooks/use-table-filters';
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

    const { navigate } = useTableFilterNavigation({
        basePath: '/apps/stock-movement',
        currentState: {
            search: searchQuery,
            warehouse: warehouseFilter,
            page: 1,
            pageSize: pagination?.pageSize ?? 20,
        },
        extraParams: {
            material: materialFilter,
            type: typeFilter.length > 0 ? typeFilter.join(',') : undefined,
            startDate: dateRange?.from?.toISOString(),
            endDate: dateRange?.to?.toISOString(),
        },
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
            const date = overrides.date === undefined ? dateRange : overrides.date;
            const types = overrides.types === undefined ? typeFilter : overrides.types;
            navigate(
                {
                    page: overrides.page ?? 1,
                    pageSize: overrides.pageSize ?? pagination?.pageSize ?? 20,
                    search: overrides.search === undefined ? searchQuery : overrides.search,
                    warehouse:
                        overrides.warehouse === undefined ? warehouseFilter : overrides.warehouse,
                },
                {
                    material:
                        overrides.material === undefined ? materialFilter : overrides.material,
                    type: types.length > 0 ? types.join(',') : undefined,
                    startDate: date?.from?.toISOString(),
                    endDate: date?.to?.toISOString(),
                }
            );
        },
        [
            navigate,
            pagination?.pageSize,
            searchQuery,
            warehouseFilter,
            materialFilter,
            typeFilter,
            dateRange,
        ]
    );

    const debouncedApplySearch = useDebouncedCallback((val: string) => {
        applyFilters({ search: val, page: 1 });
    }, 350);

    const handleSearchChange = (val: string) => {
        setSearchQuery(val);
        debouncedApplySearch(val);
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
        debouncedApplySearch.cancel();
        setSearchQuery('');
        setDateRange(undefined);
        setWarehouseFilter('all');
        setMaterialFilter('all');
        setTypeFilter([]);
        navigate(
            { page: 1, pageSize: pagination?.pageSize ?? 20, search: '', warehouse: 'all' },
            { material: 'all', type: undefined, startDate: undefined, endDate: undefined }
        );
    };

    const handlePaginationChange = (page: number, pageSize: number) => {
        applyFilters({ page, pageSize });
    };

    return (
        <StaggerContainer className="flex flex-col flex-1 md:h-full md:min-h-0">
            <StaggerItem className="flex flex-col flex-1 md:h-full md:min-h-0">
                <Card className="border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md motion-reduce:transition-none flex flex-col flex-1 p-6 md:h-full md:min-h-0">
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
                </Card>
            </StaggerItem>
        </StaggerContainer>
    );
}
