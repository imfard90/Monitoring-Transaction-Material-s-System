'use client';

import { useMemo, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import CardBox from '@/app/components/shared/CardBox';
import MovementTable from './MovementTable';

interface StockMovementClientProps {
    initialData: any[];
}

export default function StockMovementClient({ initialData }: StockMovementClientProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [warehouseFilter, setWarehouseFilter] = useState('all');
    const [materialFilter, setMaterialFilter] = useState('all');

    const uniqueWarehouses = useMemo(() => {
        const set = new Set(initialData.map((item) => item.warehouse_name).filter(Boolean));
        return Array.from(set).sort() as string[];
    }, [initialData]);

    const uniqueMaterials = useMemo(() => {
        const set = new Set(initialData.map((item) => item.material_code).filter(Boolean));
        return Array.from(set).sort() as string[];
    }, [initialData]);

    const handleClearFilters = () => {
        setSearchQuery('');
        setDateRange(undefined);
        setWarehouseFilter('all');
        setMaterialFilter('all');
    };

    const filteredData = useMemo(() => {
        return initialData.filter((item) => {
            // Date filter (Range)
            if (dateRange?.from && item.created_at) {
                const itemDate = new Date(item.created_at);
                itemDate.setHours(0, 0, 0, 0); // normalize

                const fromDate = new Date(dateRange.from);
                fromDate.setHours(0, 0, 0, 0);
                if (itemDate < fromDate) return false;

                if (dateRange.to) {
                    const toDate = new Date(dateRange.to);
                    toDate.setHours(23, 59, 59, 999);
                    if (itemDate > toDate) return false;
                }
            }

            // Warehouse filter
            if (
                warehouseFilter &&
                warehouseFilter !== 'all' &&
                item.warehouse_name !== warehouseFilter
            ) {
                return false;
            }

            // Material filter
            if (
                materialFilter &&
                materialFilter !== 'all' &&
                item.material_code !== materialFilter
            ) {
                return false;
            }

            // Search filter
            const q = searchQuery.toLowerCase();
            return (
                item.material_code?.toLowerCase().includes(q) ||
                item.material_name?.toLowerCase().includes(q) ||
                item.reference_trx?.toLowerCase().includes(q) ||
                item.warehouse_name?.toLowerCase().includes(q) ||
                item.movement_type?.toLowerCase().includes(q)
            );
        });
    }, [initialData, searchQuery, dateRange, warehouseFilter, materialFilter]);

    return (
        <CardBox className="flex flex-col flex-1 min-h-0 overflow-hidden p-6">
            <MovementTable
                data={filteredData}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                warehouseFilter={warehouseFilter}
                onWarehouseFilterChange={setWarehouseFilter}
                materialFilter={materialFilter}
                onMaterialFilterChange={setMaterialFilter}
                uniqueWarehouses={uniqueWarehouses}
                uniqueMaterials={uniqueMaterials}
                onClearFilters={handleClearFilters}
            />
        </CardBox>
    );
}
