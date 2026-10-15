'use client';

import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { Card } from '@/components/ui/card';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { exportHasilRekonData } from '../_actions/rekon-export-actions';
import type { HasilRekonData } from '../_actions/rekon-actions';
import EditRekonModal from './EditRekonModal';
import ExportLoadingOverlay from './ExportLoadingOverlay';
import ExportRekonModal from './ExportRekonModal';
import HasilRekonTable from './HasilRekonTable';

const MONTH_NAMES = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
];

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

    // State untuk fitur Export Excel
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportPeriodLabel, setExportPeriodLabel] = useState('');

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
            const search = overrides.search === undefined ? searchQuery : overrides.search;
            const wh = overrides.warehouse === undefined ? warehouseFilter : overrides.warehouse;
            const tp = overrides.type === undefined ? typeFilter : overrides.type;
            const mat = overrides.material === undefined ? materialFilter : overrides.material;
            const date = overrides.date === undefined ? dateRange : overrides.date;

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

    const handleExportConfirm = async (month: number, year: number) => {
        const monthName = MONTH_NAMES[month - 1] || `Bulan ${month}`;
        const periodLabel = `${monthName} ${year}`;
        setExportPeriodLabel(periodLabel);
        setIsExportModalOpen(false);
        setIsExporting(true);

        try {
            const result = await exportHasilRekonData({ month, year });

            if (!result.success) {
                toast.error(result.error || 'Gagal mengekspor data hasil rekon.');
                return;
            }

            if (!result.data || result.data.length === 0) {
                toast.error(`Tidak ada data hasil rekon pada periode ${periodLabel}.`);
                return;
            }

            // Format kolom sesuai kebutuhan:
            // [Timestamp,TRX ID,SAP Number,Warehouse,NIK,Type,WO Number,Material Code,Description,Qty]
            const headers = [
                'Timestamp',
                'TRX ID',
                'SAP Number',
                'Warehouse',
                'NIK',
                'Type',
                'WO Number',
                'Material Code',
                'Description',
                'Qty',
            ];

            const rows = result.data.map((item) => [
                item.created_at ? format(new Date(item.created_at), 'yyyy-MM-dd HH:mm:ss') : '-',
                item.trx_id || '-',
                item.sap_number || '-',
                item.warehouse_name || '-',
                item.nik || '-',
                (item.type || '-').toUpperCase(),
                item.workorder || '-',
                item.material_code || '-',
                item.material_name || '-',
                Number(item.qty ?? 0),
            ]);

            const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            worksheet['!cols'] = [
                { wch: 20 }, // Timestamp
                { wch: 26 }, // TRX ID
                { wch: 18 }, // SAP Number
                { wch: 22 }, // Warehouse
                { wch: 14 }, // NIK
                { wch: 10 }, // Type
                { wch: 24 }, // WO Number
                { wch: 18 }, // Material Code
                { wch: 34 }, // Description
                { wch: 10 }, // Qty
            ];

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Hasil Rekon');

            const fileName = `Hasil_Rekon_${year}_${String(month).padStart(2, '0')}.xlsx`;
            XLSX.writeFile(workbook, fileName);

            toast.success(
                `Berhasil mengekspor ${result.data.length} baris data hasil rekon (${periodLabel}).`
            );
        } catch (err: unknown) {
            toast.error(
                err instanceof Error
                    ? err.message
                    : 'Terjadi kesalahan saat memproses ekspor Excel.'
            );
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <StaggerContainer className="flex flex-col flex-1 md:h-full md:min-h-0">
            <StaggerItem className="flex flex-col flex-1 md:h-full md:min-h-0">
                <Card className="card border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md p-4 motion-reduce:transition-none flex flex-col flex-1 p-6 md:h-full md:min-h-0">
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
                        onExportClick={() => setIsExportModalOpen(true)}
                    />
                </Card>
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

            <ExportRekonModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                onExport={handleExportConfirm}
                isExporting={isExporting}
            />

            <ExportLoadingOverlay isVisible={isExporting} periodLabel={exportPeriodLabel} />
        </StaggerContainer>
    );
}
