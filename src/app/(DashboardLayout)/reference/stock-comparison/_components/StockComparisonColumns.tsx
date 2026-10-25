'use client';

import { createColumnHelper } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { TeknisiStockListItem } from '../../_actions/stock-comparison.types';

const columnHelper = createColumnHelper<TeknisiStockListItem>();

export function createStockComparisonColumns(onShowCached: (nik: string) => void) {
    return [
        columnHelper.accessor('branch', {
            header: 'Branch',
            size: 110,
            cell: (info) => info.getValue() || '—',
        }),
        columnHelper.accessor('service_area', {
            header: 'Service Area',
            size: 140,
            cell: (info) => info.getValue() || '—',
        }),
        columnHelper.accessor('warehouse_name', {
            header: 'Gudang',
            size: 160,
            cell: (info) => info.getValue() || '—',
        }),
        columnHelper.accessor('nik', {
            header: 'NIK',
            size: 110,
            cell: (info) => <span className="font-mono">{info.getValue()}</span>,
        }),
        columnHelper.accessor('nama', {
            header: 'Nama Teknisi',
            size: 240,
            cell: (info) => (
                <span className="font-medium text-foreground min-w-[200px] inline-block">
                    {info.getValue()}
                </span>
            ),
        }),
        columnHelper.accessor('status', {
            header: () => <div className="text-center">Status</div>,
            size: 120,
            cell: (info) => {
                const status = info.getValue();
                let variant: 'lightSuccess' | 'lightError' | 'outline' = 'outline';
                let label = 'Belum dicek';
                if (status === 'match') {
                    variant = 'lightSuccess';
                    label = 'Sesuai';
                } else if (status === 'selisih') {
                    variant = 'lightError';
                    label = 'Selisih';
                } else if (status === 'failed') {
                    variant = 'lightError';
                    label = 'Gagal';
                }
                return (
                    <div className="flex justify-center">
                        <Badge variant={variant} className="capitalize">
                            {label}
                        </Badge>
                    </div>
                );
            },
        }),
        columnHelper.accessor('total_selisih', {
            header: () => <div className="text-center">Selisih Material</div>,
            size: 130,
            cell: (info) => {
                const row = info.row.original;
                if (row.total_selisih !== null && row.total_selisih > 0) {
                    return (
                        <div className="text-center">
                            <span className="font-semibold text-destructive font-mono">
                                {row.total_selisih} item
                            </span>
                        </div>
                    );
                }
                if (row.status === 'match') {
                    return (
                        <div className="text-center">
                            <span className="text-muted-foreground font-mono">0 item</span>
                        </div>
                    );
                }
                return (
                    <div className="text-center">
                        <span className="text-muted-foreground font-mono">—</span>
                    </div>
                );
            },
        }),
        columnHelper.accessor('scraped_at', {
            header: () => <div className="text-center">Terakhir Dicek</div>,
            size: 150,
            cell: (info) => {
                const val = info.getValue();
                if (!val) {
                    return (
                        <div className="text-center">
                            <span className="text-muted-foreground text-xs">—</span>
                        </div>
                    );
                }
                try {
                    return (
                        <div className="text-center">
                            <span className="text-xs text-muted-foreground font-mono">
                                {format(new Date(val), 'dd/MM/yyyy HH:mm')}
                            </span>
                        </div>
                    );
                } catch {
                    return (
                        <div className="text-center">
                            <span className="text-xs text-muted-foreground">{val}</span>
                        </div>
                    );
                }
            },
        }),
        columnHelper.display({
            id: 'actions',
            header: () => <div className="text-center">Aksi</div>,
            size: 80,
            cell: (info) => (
                <div className="flex justify-center">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Lihat cache ${info.row.original.nama}`}
                                onClick={() => onShowCached(info.row.original.nik)}
                                className="h-8 w-8 hover:bg-muted"
                            >
                                <Eye className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                            <p>Lihat Detail Cache</p>
                        </TooltipContent>
                    </Tooltip>
                </div>
            ),
        }),
    ];
}
