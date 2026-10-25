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
            cell: (info) => info.getValue() || '—',
        }),
        columnHelper.accessor('service_area', {
            header: 'Service Area',
            cell: (info) => info.getValue() || '—',
        }),
        columnHelper.accessor('warehouse_name', {
            header: 'Gudang',
            cell: (info) => info.getValue() || '—',
        }),
        columnHelper.accessor('nik', {
            header: 'NIK',
            cell: (info) => <span className="font-mono">{info.getValue()}</span>,
        }),
        columnHelper.accessor('nama', {
            header: 'Nama Teknisi',
            cell: (info) => (
                <span className="font-medium text-foreground">{info.getValue()}</span>
            ),
        }),
        columnHelper.accessor('status', {
            header: 'Status',
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
                    <Badge variant={variant} className="capitalize">
                        {label}
                    </Badge>
                );
            },
        }),
        columnHelper.accessor('total_selisih', {
            header: 'Selisih Material',
            cell: (info) => {
                const row = info.row.original;
                if (row.total_selisih !== null && row.total_selisih > 0) {
                    return (
                        <span className="font-semibold text-destructive font-mono">
                            {row.total_selisih} item
                        </span>
                    );
                }
                if (row.status === 'match') {
                    return <span className="text-muted-foreground font-mono">0 item</span>;
                }
                return <span className="text-muted-foreground font-mono">—</span>;
            },
        }),
        columnHelper.accessor('scraped_at', {
            header: 'Terakhir Dicek',
            cell: (info) => {
                const val = info.getValue();
                if (!val) return <span className="text-muted-foreground text-xs">—</span>;
                try {
                    return (
                        <span className="text-xs text-muted-foreground font-mono">
                            {format(new Date(val), 'dd/MM/yyyy HH:mm')}
                        </span>
                    );
                } catch {
                    return <span className="text-xs text-muted-foreground">{val}</span>;
                }
            },
        }),
        columnHelper.display({
            id: 'actions',
            header: 'Aksi',
            cell: (info) => (
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
            ),
        }),
    ];
}
