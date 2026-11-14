'use client';

import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { Check, Copy, Database, RefreshCw } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/app/components/shared/DataTable';
import { DataTablePagination } from '@/app/components/shared/DataTablePagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { SearchField } from '@/components/ui/search-field';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
    createColumnHelper,
    getCoreRowModel,
    useReactTable,
} from '@/lib/table';
import type { KproRefItem } from '../_actions/kpro-ref-queries';

interface PaginationState {
    pageIndex: number;
    pageSize: number;
}

interface PaginationInfo {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

const columnHelper = createColumnHelper<KproRefItem>();

/**
 * Komponen kecil untuk menampilkan teks dengan tombol salin (copy-to-clipboard)
 */
function CopyableCell({ text, maxLength }: { text: string | null; maxLength?: number }) {
    const [copied, setCopied] = useState(false);

    if (!text) return <span className="text-muted-foreground">-</span>;

    const displayText = maxLength && text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;

    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success(`Disalin: ${text}`);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex items-center gap-1.5 group">
            <span className="font-mono text-xs text-foreground font-medium" title={text}>
                {displayText}
            </span>
            <Button
                variant="ghost"
                size="icon"
                onClick={handleCopy}
                aria-label={`Salin ${text}`}
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
            >
                {copied ? (
                    <Check className="h-3 w-3 text-success" />
                ) : (
                    <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                )}
            </Button>
        </div>
    );
}

export default function KproRefClient({
    initialData,
    pagination,
    error,
    currentDatel = 'all',
    currentSearch = '',
    datelOptions = [],
    lastUpdate = null,
}: {
    initialData: KproRefItem[];
    pagination?: PaginationInfo;
    error?: string;
    currentDatel?: string;
    currentSearch?: string;
    datelOptions?: string[];
    lastUpdate?: {
        lastUpdatedAt: Date | string | null;
        totalRecords: number;
    } | null;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const [searchVal, setSearchVal] = useState(currentSearch);
    const [selectedDatel, setSelectedDatel] = useState(currentDatel);

    // Update parameter pencarian di URL secara halus
    const updateUrlParams = useCallback(
        (newParams: { datel?: string; search?: string; page?: number; pageSize?: number }) => {
            const params = new URLSearchParams(searchParams.toString());

            if (newParams.datel !== undefined) {
                if (newParams.datel && newParams.datel !== 'all') {
                    params.set('datel', newParams.datel);
                } else {
                    params.delete('datel');
                }
            }

            if (newParams.search !== undefined) {
                if (newParams.search.trim()) {
                    params.set('search', newParams.search.trim());
                } else {
                    params.delete('search');
                }
            }

            if (newParams.page !== undefined) {
                params.set('page', String(newParams.page));
            }

            if (newParams.pageSize !== undefined) {
                params.set('pageSize', String(newParams.pageSize));
            }

            startTransition(() => {
                router.push(`/reference/kpro-ref?${params.toString()}`);
            });
        },
        [router, searchParams]
    );

    const handleDatelChange = (val: string) => {
        setSelectedDatel(val);
        updateUrlParams({ datel: val, page: 1 });
    };

    const handleSearchChange = (query: string) => {
        setSearchVal(query);
        updateUrlParams({ search: query, page: 1 });
    };

    // Definisi Kolom Tabel
    const columns = useMemo(
        () => [
            columnHelper.accessor('status_update', {
                header: 'Status Update',
                size: 160,
                cell: (info) => {
                    const raw = info.getValue();
                    if (!raw) return <span className="text-muted-foreground">-</span>;
                    try {
                        const dateObj = typeof raw === 'string' ? new Date(raw) : raw;
                        return (
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {format(dateObj, 'dd MMM yyyy, HH:mm', { locale: localeId })}
                            </span>
                        );
                    } catch {
                        return <span className="text-xs text-muted-foreground">{String(raw)}</span>;
                    }
                },
            }),
            columnHelper.accessor('wonum', {
                header: 'WONUM',
                size: 150,
                cell: (info) => <CopyableCell text={info.getValue()} />,
            }),
            columnHelper.accessor('scorderno', {
                header: 'SC Order No',
                size: 220,
                cell: (info) => <CopyableCell text={info.getValue()} maxLength={26} />,
            }),
            columnHelper.accessor('sto', {
                header: () => <div className="text-center">STO</div>,
                size: 90,
                cell: (info) => {
                    const sto = info.getValue();
                    if (!sto) return <div className="text-center text-muted-foreground">-</div>;
                    return (
                        <div className="flex justify-center">
                            <Badge variant="outline" className="font-mono text-xs uppercase px-2 py-0.5">
                                {sto}
                            </Badge>
                        </div>
                    );
                },
            }),
            columnHelper.accessor('servicenum', {
                header: 'Service Num',
                size: 140,
                cell: (info) => {
                    const s = info.getValue();
                    return <span className="font-mono text-xs">{s || '-'}</span>;
                },
            }),
            columnHelper.accessor('package_name', {
                header: 'Package Name',
                size: 200,
                cell: (info) => {
                    const p = info.getValue();
                    return (
                        <span className="text-xs text-foreground/90 font-medium truncate block max-w-[240px]" title={p || undefined}>
                            {p || '-'}
                        </span>
                    );
                },
            }),
            columnHelper.accessor('rekon_lensa', {
                header: () => <div className="text-center">Rekon Lensa</div>,
                size: 130,
                cell: (info) => {
                    const isRekon = info.getValue();
                    return (
                        <div className="flex justify-center">
                            {isRekon ? (
                                <Badge variant="lightSuccess" className="text-[11px] font-semibold px-2 py-0.5">
                                    Sudah Rekon
                                </Badge>
                            ) : (
                                <Badge variant="lightWarning" className="text-[11px] font-semibold px-2 py-0.5">
                                    Belum Rekon
                                </Badge>
                            )}
                        </div>
                    );
                },
            }),
            columnHelper.accessor('nte', {
                header: () => <div className="text-center">NTE</div>,
                size: 120,
                cell: () => (
                    <div className="flex justify-center">
                        <Badge variant="outlineSecondary" className="text-[11px] px-2 py-0.5 border-dashed">
                            Coming Soon
                        </Badge>
                    </div>
                ),
            }),
        ],
        []
    );

    // Konfigurasi pagination TanStack Table
    const paginationState: PaginationState = useMemo(
        () => ({
            pageIndex: (pagination?.page ?? 1) - 1,
            pageSize: pagination?.pageSize ?? 20,
        }),
        [pagination?.page, pagination?.pageSize]
    );

    const table = useReactTable({
        data: initialData,
        columns,
        getCoreRowModel: getCoreRowModel(),
        manualPagination: true,
        pageCount: pagination?.totalPages ?? 1,
        state: {
            pagination: paginationState,
        },
        onPaginationChange: (updater) => {
            const nextState =
                typeof updater === 'function' ? updater(paginationState) : updater;
            updateUrlParams({
                page: nextState.pageIndex + 1,
                pageSize: nextState.pageSize,
            });
        },
    });

    return (
        <TooltipProvider>
            <StaggerContainer className="flex flex-col gap-4 w-full min-w-0 max-w-full">
                <StaggerItem className="w-full min-w-0 max-w-full">
                    <Card className="border-border shadow-sm flex flex-col w-full min-w-0 max-w-full overflow-hidden">
                        <CardHeader className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 shrink-0">
                            <div>
                                <CardTitle className="text-xl font-bold flex items-center gap-2">
                                    <Database className="h-5 w-5 text-primary" />
                                    Daftar Ref K-Pro
                                </CardTitle>
                                <CardDescription className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                                    Data referensi fulfillment endstate K-PRO (status COMPWORK).
                                </CardDescription>
                            </div>
                            <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
                                <SearchField
                                    value={searchVal}
                                    onValueChange={handleSearchChange}
                                    placeholder="Cari WONUM, SC, STO, Layanan, Paket..."
                                    wrapperClassName="w-full sm:w-[240px]"
                                />
                                <div className="w-full sm:w-[170px]">
                                    <Select value={selectedDatel} onValueChange={handleDatelChange}>
                                        <SelectTrigger className="w-full text-xs h-9">
                                            <SelectValue placeholder="Semua Datel" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Semua Datel</SelectItem>
                                            {datelOptions.map((datel) => (
                                                <SelectItem key={datel} value={datel}>
                                                    Datel: {datel}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="flex flex-col gap-3.5 w-full min-w-0 max-w-full">
                            {/* Status info bar */}
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="lightPrimary" className="text-xs">
                                        District: LAMONGAN
                                    </Badge>
                                    <Badge variant="outline" className="text-xs">
                                        90 Hari Terakhir
                                    </Badge>
                                    {lastUpdate?.lastUpdatedAt && (
                                        <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                            <RefreshCw className="h-3 w-3" />
                                            Update: {format(new Date(lastUpdate.lastUpdatedAt), 'dd/MM HH:mm')}
                                        </Badge>
                                    )}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    Total: <span className="font-semibold text-foreground">{pagination?.total?.toLocaleString('id-ID') ?? 0}</span> data
                                </div>
                            </div>

                            {/* Error Banner jika ada */}
                            {error && (
                                <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                                    {error}
                                </div>
                            )}

                            {/* Data Table */}
                            <div className="flex flex-col gap-1.5 w-full min-w-0 max-w-full">
                                <DataTable
                                    table={table}
                                    isLoading={isPending}
                                    emptyMessage="Tidak ada data."
                                    className="rounded-md border border-border flex-1 w-full min-w-0 max-w-full overflow-x-auto relative max-h-[620px]"
                                />
                            </div>

                            {/* Pagination */}
                            <div className="shrink-0 w-full min-w-0 max-w-full">
                                <DataTablePagination table={table} />
                            </div>
                        </CardContent>
                    </Card>
                </StaggerItem>
            </StaggerContainer>
        </TooltipProvider>
    );
}
