'use client';

import { FileSearch, LoaderCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '@/app/components/shared/DataTable';
import { SearchableSelect } from '@/app/components/shared/SearchableSelect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createColumnHelper, getCoreRowModel, useReactTable } from '@/lib/table';
import type {
    ScrapedWODetailMaterial,
    ScrapedWODetailResult,
    WOPemakaianOption,
} from '../_actions/wo-lensa-actions';

const materialColumnHelper = createColumnHelper<ScrapedWODetailMaterial>();

interface WOLensaLiveDetailDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    options: WOPemakaianOption[];
    selectedId: string;
    onSelectId: (id: string) => void;
    onRunScrape: () => void;
    busy: boolean;
    result: ScrapedWODetailResult | null;
}

export function WOLensaLiveDetailDialog({
    open,
    onOpenChange,
    options,
    selectedId,
    onSelectId,
    onRunScrape,
    busy,
    result,
}: WOLensaLiveDetailDialogProps) {
    const [isManualInput, setIsManualInput] = useState(false);

    const selectOptions = useMemo(() => {
        return options.map((opt) => ({
            value: opt.value,
            label: opt.label,
        }));
    }, [options]);

    const materialColumns = useMemo(
        () => [
            materialColumnHelper.accessor('material_id', {
                header: 'ID Material',
                size: 110,
                cell: (info) => (
                    <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {info.getValue() || '—'}
                    </span>
                ),
            }),
            materialColumnHelper.accessor('material_desc', {
                header: () => <div className="pl-2">Nama Material</div>,
                cell: (info) => (
                    <div className="pl-2 whitespace-normal break-words text-xs font-medium text-foreground leading-snug">
                        {info.getValue() || '—'}
                    </div>
                ),
            }),
            materialColumnHelper.accessor('uom', {
                header: () => <div className="text-center">Satuan</div>,
                size: 70,
                cell: (info) => (
                    <div className="text-center text-xs font-mono text-muted-foreground">
                        {info.getValue() || '—'}
                    </div>
                ),
            }),
            materialColumnHelper.accessor('qty_pemakaian', {
                header: () => <div className="text-center">Qty</div>,
                size: 70,
                cell: (info) => (
                    <div className="text-center font-mono text-xs font-semibold text-foreground">
                        {info.getValue() ?? '0'}
                    </div>
                ),
            }),
        ],
        []
    );

    const materialsData = useMemo(() => result?.materials ?? [], [result]);

    const table = useReactTable({
        data: materialsData,
        columns: materialColumns,
        getCoreRowModel: getCoreRowModel(),
    });

    return (
        <Dialog
            open={open}
            onOpenChange={(isOpen) => {
                if (!busy) onOpenChange(isOpen);
            }}
        >
            <DialogContent
                className="max-w-3xl max-h-[85vh] overflow-y-auto"
                onEscapeKeyDown={(event) => {
                    if (busy) event.preventDefault();
                }}
                onPointerDownOutside={(event) => {
                    if (busy) event.preventDefault();
                }}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileSearch className="h-5 w-5 text-primary" />
                        Tarik Detail WO Manual
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                        Ambil rincian material Work Order secara langsung dari sistem Lensa
                        berdasarkan ID Pemakaian.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 pt-1">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">
                                {isManualInput
                                    ? 'Input ID Pemakaian'
                                    : `Pilih ID Pemakaian ${
                                          options.length > 0
                                              ? `(${options.length} belum ada detail)`
                                              : ''
                                      }`}
                            </Label>
                            <Button
                                type="button"
                                variant="link"
                                className="h-auto p-0 text-xs text-primary"
                                onClick={() => setIsManualInput(!isManualInput)}
                                disabled={busy}
                            >
                                {isManualInput ? '← Pilih dari dropdown' : 'Ketik ID manual →'}
                            </Button>
                        </div>

                        {isManualInput ? (
                            <Input
                                placeholder="Masukkan ID Pemakaian (misal: 104523)..."
                                value={selectedId}
                                onChange={(e) => onSelectId(e.target.value.trim())}
                                disabled={busy}
                                className="h-10"
                            />
                        ) : (
                            <SearchableSelect
                                options={selectOptions}
                                value={selectedId}
                                onValueChange={onSelectId}
                                placeholder={
                                    busy && options.length === 0
                                        ? 'Memuat daftar ID Pemakaian...'
                                        : options.length === 0
                                          ? 'Semua data WO sudah memiliki detail material'
                                          : 'Pilih atau cari ID Pemakaian / No WO...'
                                }
                                emptyText={
                                    options.length === 0
                                        ? 'Semua data WO sudah memiliki detail material.'
                                        : 'ID Pemakaian tidak ditemukan.'
                                }
                                disabled={busy || options.length === 0}
                                className="h-10"
                            />
                        )}
                    </div>

                    <Button
                        onClick={onRunScrape}
                        disabled={busy || !selectedId.trim()}
                        className="w-full shadow-sm"
                    >
                        {busy ? (
                            <>
                                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                                Mengambil detail dari Lensa...
                            </>
                        ) : (
                            <>
                                <FileSearch className="mr-2 h-4 w-4" />
                                Tarik Detail WO
                            </>
                        )}
                    </Button>
                </div>

                {result && (
                    <div className="space-y-4 pt-4 border-t border-border">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 border border-border p-3.5">
                            <div>
                                <p className="font-semibold text-foreground text-sm sm:text-base">
                                    ID Pemakaian: {result.pemakaian_id}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {result.wo_number ? `WO: ${result.wo_number}` : 'Tanpa No WO'} ·
                                    Gudang: {result.nama_gudang || 'Semua Gudang'} · Tipe:{' '}
                                    {result.type || 'assurance'}
                                </p>
                            </div>
                            <Badge
                                variant={
                                    result.materials.length > 0 ? 'lightSuccess' : 'lightWarning'
                                }
                                className="capitalize text-xs font-semibold px-3 py-1"
                            >
                                {result.materials.length > 0
                                    ? `${result.materials.length} Material Ditemukan`
                                    : 'Tidak Ada Material'}
                            </Badge>
                        </div>

                        <DataTable
                            table={table}
                            emptyMessage="Tidak ada detail material yang ditemukan untuk WO ini."
                            maxHeight="45vh"
                            className="rounded-md border border-border overflow-y-auto"
                            tableClassName="table-fixed whitespace-normal"
                        />
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
