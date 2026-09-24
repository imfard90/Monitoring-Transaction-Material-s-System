'use client';

import { useMemo, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import CardBox from '@/app/components/shared/CardBox';
import HasilRekonTable from './HasilRekonTable';

interface HasilRekonClientProps {
    initialData: any[];
}

export default function HasilRekonClient({ initialData }: HasilRekonClientProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [warehouseFilter, setWarehouseFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [materialFilter, setMaterialFilter] = useState('all');

    const uniqueWarehouses = useMemo(() => {
        const set = new Set(initialData.map((item) => item.warehouse_name).filter(Boolean));
        return Array.from(set).sort() as string[];
    }, [initialData]);

    const uniqueTypes = useMemo(() => {
        const set = new Set(initialData.map((item) => item.type).filter(Boolean));
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
        setTypeFilter('all');
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

            // Type filter
            if (typeFilter && typeFilter !== 'all' && item.type !== typeFilter) {
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
                item.trx_id?.toLowerCase().includes(q) ||
                item.sap_number?.toLowerCase().includes(q) ||
                item.nik?.toLowerCase().includes(q) ||
                item.workorder?.toLowerCase().includes(q)
            );
        });
    }, [initialData, searchQuery, dateRange, warehouseFilter, typeFilter, materialFilter]);

    return (
        <CardBox className="p-6">
            <HasilRekonTable
                data={filteredData}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                warehouseFilter={warehouseFilter}
                onWarehouseFilterChange={setWarehouseFilter}
                typeFilter={typeFilter}
                onTypeFilterChange={setTypeFilter}
                materialFilter={materialFilter}
                onMaterialFilterChange={setMaterialFilter}
                uniqueWarehouses={uniqueWarehouses}
                uniqueTypes={uniqueTypes}
                uniqueMaterials={uniqueMaterials}
                onClearFilters={handleClearFilters}
            />
        </CardBox>
    );
}
