'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import CardBox from '@/app/components/shared/CardBox';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import {
    getHasilRekon,
    getNewHasilRekon,
    type HasilRekonData,
    type NewHasilRekonData,
} from '../_actions/rekon-actions';
import EditRekonModal from './EditRekonModal';
import HasilRekonTable from './HasilRekonTable';

interface HasilRekonClientProps {
    initialLegacyData: HasilRekonData[];
    initialNewData: NewHasilRekonData[];
}

export default function HasilRekonClient({
    initialLegacyData,
    initialNewData,
}: HasilRekonClientProps) {
    const mapNewDataToLegacy = (newData: NewHasilRekonData[]): HasilRekonData[] => {
        return newData.map((item) => ({
            header_id: item.header_id,
            item_id: item.item_id,
            created_at: item.created_at,
            trx_id: item.trx_id,
            sap_number: item.sap_number,
            warehouse_name: item.warehouse_name,
            nik: item.nik,
            type: item.type,
            workorder: item.workorder,
            material_code: item.material_code,
            material_name: item.material_name,
            qty: item.qty,
            isNewRekon: true,
        }));
    };

    const [data, setData] = useState<HasilRekonData[]>(() => {
        const combined = [...initialLegacyData, ...mapNewDataToLegacy(initialNewData)];
        return combined.sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA;
        });
    });
    const [monthsOffset, setMonthsOffset] = useState(0);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMoreData, setHasMoreData] = useState(true);

    const [editRowData, setEditRowData] = useState<HasilRekonData | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [warehouseFilter, setWarehouseFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [materialFilter, setMaterialFilter] = useState('all');

    const uniqueWarehouses = useMemo(() => {
        const set = new Set(data.map((item) => item.warehouse_name).filter(Boolean));
        return Array.from(set).sort() as string[];
    }, [data]);

    const uniqueTypes = useMemo(() => {
        const set = new Set(data.map((item) => item.type).filter(Boolean));
        return Array.from(set).sort() as string[];
    }, [data]);

    const uniqueMaterials = useMemo(() => {
        const set = new Set(data.map((item) => item.material_code).filter(Boolean));
        return Array.from(set).sort() as string[];
    }, [data]);

    const handleClearFilters = () => {
        setSearchQuery('');
        setDateRange(undefined);
        setWarehouseFilter('all');
        setTypeFilter('all');
        setMaterialFilter('all');
    };

    const loadMore = useCallback(async () => {
        if (isLoadingMore || !hasMoreData) return;
        setIsLoadingMore(true);
        try {
            const nextOffset = monthsOffset + 5;
            const [moreLegacyData, moreNewData] = await Promise.all([
                getHasilRekon(nextOffset, 5),
                getNewHasilRekon(nextOffset, 5),
            ]);

            if (moreLegacyData.length === 0 && moreNewData.length === 0) {
                setHasMoreData(false);
            } else {
                setData((prev) => {
                    const combined = [
                        ...prev,
                        ...moreLegacyData,
                        ...mapNewDataToLegacy(moreNewData),
                    ];
                    return combined.sort((a, b) => {
                        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                        return dateB - dateA;
                    });
                });
                setMonthsOffset(nextOffset);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingMore(false);
        }
    }, [isLoadingMore, hasMoreData, monthsOffset]);

    const filteredData = useMemo(() => {
        return data.filter((item) => {
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
    }, [data, searchQuery, dateRange, warehouseFilter, typeFilter, materialFilter]);

    useEffect(() => {
        if (searchQuery && filteredData.length === 0 && hasMoreData && !isLoadingMore) {
            const timeout = setTimeout(() => {
                loadMore();
            }, 800);
            return () => clearTimeout(timeout);
        }
    }, [searchQuery, filteredData.length, hasMoreData, isLoadingMore, loadMore]);

    return (
        <StaggerContainer className="flex flex-col flex-1 md:h-full md:min-h-0 md:overflow-hidden">
            <StaggerItem className="flex flex-col flex-1 md:h-full md:min-h-0 md:overflow-hidden">
                <CardBox className="flex flex-col flex-1 p-6 md:h-full md:min-h-0 md:overflow-hidden">
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
                        onEditClick={(row) => {
                            setEditRowData(row);
                            setIsEditModalOpen(true);
                        }}
                    />
                    {isLoadingMore && (
                        <div className="text-center text-sm text-gray-500 py-2">
                            Mencari di 5 bulan sebelumnya...
                        </div>
                    )}
                </CardBox>

                <EditRekonModal
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    rowData={editRowData}
                />
            </StaggerItem>
        </StaggerContainer>
    );
}
