'use client';

import { format } from 'date-fns';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { useDebouncedCallback } from '@/hooks/use-debounce';
import { useTableFilterNavigation } from '@/hooks/use-table-filters';
import type { HasilRekonData } from '../_actions/rekon-actions';
import { exportHasilRekonData } from '../_actions/rekon-export-actions';
import ExportLoadingOverlay from './ExportLoadingOverlay';
import HasilRekonTable from './HasilRekonTable';

const EditRekonModal = dynamic(() => import('./EditRekonModal'), { ssr: false });
const ExportRekonModal = dynamic(() => import('./ExportRekonModal'), { ssr: false });

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

    const { navigate } = useTableFilterNavigation({
        basePath: '/apps/hasil-rekon',
        currentState: {
            search: searchQuery,
            warehouse: warehouseFilter,
            page: 1,
            pageSize: pagination?.pageSize ?? 20,
        },
        extraParams: {
            type: typeFilter,
            material: materialFilter,
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
            type?: string;
            material?: string;
            date?: DateRange | undefined;
        }) => {
            const date = overrides.date === undefined ? dateRange : overrides.date;
            navigate(
                {
                    page: overrides.page ?? 1,
                    pageSize: overrides.pageSize ?? pagination?.pageSize ?? 20,
                    search: overrides.search === undefined ? searchQuery : overrides.search,
                    warehouse:
                        overrides.warehouse === undefined ? warehouseFilter : overrides.warehouse,
                },
                {
                    type: overrides.type === undefined ? typeFilter : overrides.type,
                    material:
                        overrides.material === undefined ? materialFilter : overrides.material,
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
            typeFilter,
            materialFilter,
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
        debouncedApplySearch.cancel();
        setSearchQuery('');
        setDateRange(undefined);
        setWarehouseFilter('all');
        setTypeFilter('all');
        setMaterialFilter('all');
        navigate(
            { page: 1, pageSize: pagination?.pageSize ?? 20, search: '', warehouse: 'all' },
            { type: 'all', material: 'all', startDate: undefined, endDate: undefined }
        );
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
            const ExcelJS = await import('exceljs');
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Hasil Rekon');

            worksheet.columns = [
                { header: 'Timestamp', key: 'timestamp', width: 22 },
                { header: 'TRX ID', key: 'trx_id', width: 26 },
                { header: 'SAP Number', key: 'sap_number', width: 18 },
                { header: 'Warehouse', key: 'warehouse', width: 22 },
                { header: 'NIK', key: 'nik', width: 14 },
                { header: 'Type', key: 'type', width: 12 },
                { header: 'WO Number', key: 'wo_number', width: 24 },
                { header: 'Material Code', key: 'material_code', width: 18 },
                { header: 'Description', key: 'description', width: 34 },
                { header: 'Qty', key: 'qty', width: 12 },
            ];

            for (const item of result.data) {
                worksheet.addRow({
                    timestamp: item.created_at ? format(new Date(item.created_at), 'yyyy-MM-dd HH:mm:ss') : '-',
                    trx_id: item.trx_id || '-',
                    sap_number: item.sap_number || '-',
                    warehouse: item.warehouse_name || '-',
                    nik: item.nik || '-',
                    type: (item.type || '-').toUpperCase(),
                    wo_number: item.workorder || '-',
                    material_code: item.material_code || '-',
                    description: item.material_name || '-',
                    qty: Number(item.qty ?? 0),
                });
            }

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Hasil_Rekon_${year}_${String(month).padStart(2, '0')}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

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
        <StaggerContainer className="flex flex-col flex-1 w-full min-w-0 max-w-full md:h-full md:min-h-0">
            <StaggerItem className="flex flex-col flex-1 w-full min-w-0 max-w-full md:h-full md:min-h-0">
                <Card className="border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md p-4 sm:p-5 motion-reduce:transition-none flex flex-col flex-1 w-full min-w-0 max-w-full overflow-hidden md:h-full md:min-h-0">
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
