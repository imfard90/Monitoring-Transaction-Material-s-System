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

export interface LensaLiveDetailMetadataItem {
    label: string;
    value: string | null | undefined;
}

export interface LensaLiveDetailMaterialItem {
    material_id: string | null;
    material_desc: string | null;
    uom?: string | null;
    quantity: number | string | null;
}

export interface LensaLiveDetailDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    idLabel: string;
    idPlaceholder?: string;
    options: Array<{ value: string; label: string }>;
    selectedId: string;
    onSelectId: (id: string) => void;
    onRunScrape: () => void;
    busy: boolean;
    metadata?: LensaLiveDetailMetadataItem[];
    materials: LensaLiveDetailMaterialItem[];
    quantityHeader?: string;
    hasResult: boolean;
}

const columnHelper = createColumnHelper<LensaLiveDetailMaterialItem>();

export function LensaLiveDetailDialog({
    open,
    onOpenChange,
    title,
    description,
    idLabel,
    idPlaceholder = 'Ketik ID di sini...',
    options,
    selectedId,
    onSelectId,
    onRunScrape,
    busy,
    metadata = [],
    materials,
    quantityHeader = 'Qty',
    hasResult,
}: LensaLiveDetailDialogProps) {
    const [isManualInput, setIsManualInput] = useState(false);

    const hasUom = useMemo(() => materials.some((m) => Boolean(m.uom)), [materials]);

    const materialColumns = useMemo(() => {
        const cols = [
            columnHelper.accessor('material_id', {
                header: 'ID Material',
                cell: (info) => (
                    <span className="font-mono text-xs font-medium">
                        {info.getValue() || '-'}
                    </span>
                ),
            }),
            columnHelper.accessor('material_desc', {
                header: 'Deskripsi Material',
                cell: (info) => (
                    <span className="text-xs line-clamp-2">
                        {info.getValue() || '-'}
                    </span>
                ),
            }),
        ];

        if (hasUom) {
            cols.push(
                columnHelper.accessor('uom', {
                    header: 'Satuan',
                    cell: (info) => (
                        <span className="text-xs text-muted-foreground uppercase">
                            {info.getValue() || '-'}
                        </span>
                    ),
                })
            );
        }

        cols.push(
            columnHelper.accessor('quantity', {
                header: quantityHeader,
                cell: (info) => (
                    <span className="font-semibold text-xs text-primary">
                        {info.getValue() ?? '-'}
                    </span>
                ),
            })
        );

        return cols;
    }, [hasUom, quantityHeader]);

    const table = useReactTable({
        data: materials,
        columns: materialColumns,
        getCoreRowModel: getCoreRowModel(),
    });

    const isButtonDisabled = busy || !selectedId.trim();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
                <DialogHeader className="shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <FileSearch className="h-5 w-5 text-primary" />
                        {title}
                    </DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
                    <div className="space-y-3 bg-muted/40 p-3.5 rounded-lg border border-border/60">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold text-foreground">
                                {idLabel}
                            </Label>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs text-muted-foreground hover:text-foreground px-2"
                                onClick={() => {
                                    setIsManualInput(!isManualInput);
                                    onSelectId('');
                                }}
                            >
                                {isManualInput ? 'Pilih dari Daftar' : 'Input Manual ID Lain'}
                            </Button>
                        </div>

                        {isManualInput ? (
                            <Input
                                placeholder={idPlaceholder}
                                value={selectedId}
                                onChange={(e) => onSelectId(e.target.value)}
                                disabled={busy}
                                className="h-9 text-sm"
                            />
                        ) : (
                            <SearchableSelect
                                options={options}
                                value={selectedId}
                                onValueChange={onSelectId}
                                placeholder={`-- Cari atau Pilih ${idLabel} --`}
                                emptyText="Tidak ada pilihan tersedia"
                                disabled={busy}
                            />
                        )}

                        <div className="flex justify-end pt-1">
                            <Button
                                size="sm"
                                onClick={onRunScrape}
                                disabled={isButtonDisabled}
                                className="h-8 text-xs font-medium min-w-[130px]"
                            >
                                {busy ? (
                                    <>
                                        <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                        Menarik Data...
                                    </>
                                ) : (
                                    <>
                                        <FileSearch className="mr-1.5 h-3.5 w-3.5" />
                                        Tarik dari Lensa
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>

                    {hasResult && (
                        <div className="space-y-3 pt-2">
                            {metadata.length > 0 && (
                                <div className="flex flex-wrap gap-2 text-xs">
                                    {metadata.map((item) => (
                                        <div
                                            key={item.label}
                                            className="flex items-center gap-1.5 bg-background border px-2.5 py-1 rounded-md"
                                        >
                                            <span className="text-muted-foreground">
                                                {item.label}:
                                            </span>
                                            <span className="font-medium text-foreground">
                                                {item.value || '-'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="border rounded-md overflow-hidden">
                                <div className="bg-muted/50 px-3 py-2 border-b flex items-center justify-between">
                                    <span className="text-xs font-semibold text-foreground">
                                        Hasil Detail Material
                                    </span>
                                    <Badge variant="outline" className="text-[10px] font-normal">
                                        {materials.length} Material
                                    </Badge>
                                </div>
                                <DataTable
                                    table={table}
                                    emptyMessage="Tidak ada item material ditemukan untuk ID ini."
                                    className="border-0 max-h-[300px] overflow-y-auto"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
