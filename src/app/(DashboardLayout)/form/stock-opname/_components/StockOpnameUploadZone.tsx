'use client';

import { FileUp, FileText, Loader2, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { parseStockOpnamePdf, type ParsePdfResult } from '../_utils/pdf-parser';

interface StockOpnameUploadZoneProps {
    onParsed: (result: ParsePdfResult) => void;
    isStaff: boolean;
    userWarehouseIds?: number[];
    masterWarehouses?: Array<{ id: number; name: string }>;
    disabled?: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function StockOpnameUploadZone({
    onParsed,
    isStaff,
    userWarehouseIds,
    masterWarehouses,
    disabled = false,
}: StockOpnameUploadZoneProps) {
    const [isDragOver, setIsDragOver] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const resetSelection = useCallback(() => {
        setSelectedFile(null);
        setProgress(null);
        setIsLoading(false);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, []);

    const processFile = useCallback(
        async (file: File) => {
            if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
                toast.error('Format berkas tidak valid. Harap pilih berkas PDF.');
                return;
            }

            if (file.size > MAX_FILE_SIZE) {
                toast.error('Ukuran berkas melebihi batas maksimal 10 MB.');
                return;
            }

            setSelectedFile(file);
            setIsLoading(true);
            setProgress({ current: 0, total: 1 });

            try {
                const buffer = await file.arrayBuffer();
                const result = await parseStockOpnamePdf(buffer, {
                    onProgress: (current, total) => {
                        setProgress({ current, total });
                    },
                    masterWarehouses,
                });

                if (result.materials.length === 0) {
                    toast.error('Tidak ada baris material yang berhasil diekstrak dari PDF.');
                    resetSelection();
                    return;
                }

                // Check staff warehouse authorization
                if (
                    isStaff &&
                    userWarehouseIds &&
                    userWarehouseIds.length > 0 &&
                    !userWarehouseIds.includes(result.warehouse_id)
                ) {
                    toast.error(
                        `Akses ditolak. Anda tidak memiliki otorisasi untuk gudang "${result.warehouse}".`
                    );
                    resetSelection();
                    return;
                }

                onParsed(result);
                resetSelection();
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Gagal memproses berkas PDF.';
                toast.error(message);
                resetSelection();
            }
        },
        [isStaff, userWarehouseIds, masterWarehouses, onParsed, resetSelection]
    );

    const handleDragOver = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            if (!disabled && !isLoading) {
                setIsDragOver(true);
            }
        },
        [disabled, isLoading]
    );

    const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(false);

            if (disabled || isLoading) return;

            const droppedFile = e.dataTransfer.files?.[0];
            if (droppedFile) {
                processFile(droppedFile);
            }
        },
        [disabled, isLoading, processFile]
    );

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            processFile(file);
        }
    };

    const percent =
        progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

    return (
        <Card className="border-border/70 shadow-sm transition-colors">
            <CardContent className="p-6">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileInputChange}
                    className="sr-only"
                    id="stock-opname-file-input"
                    disabled={disabled || isLoading}
                    aria-label="Pilih dokumen PDF Stock Opname"
                />

                {/* biome-ignore lint/a11y/noStaticElementInteractions: drag and drop upload dropzone container */}
                <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                        'flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200',
                        isDragOver
                            ? 'border-primary bg-primary/5 scale-[1.005]'
                            : 'border-border/60 hover:border-primary/50 hover:bg-muted/30',
                        isLoading && 'pointer-events-none opacity-80'
                    )}
                >
                    {isLoading ? (
                        <div className="w-full max-w-md space-y-4 py-2">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <Loader2 className="h-6 w-6 animate-spin" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-semibold text-foreground">
                                    Memproses Dokumen BA SO SAP...
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {selectedFile?.name} (
                                    {selectedFile
                                        ? (selectedFile.size / 1024 / 1024).toFixed(2)
                                        : '0'}{' '}
                                    MB)
                                </p>
                            </div>
                            {progress && progress.total > 1 && (
                                <div className="space-y-1.5">
                                    <Progress value={percent} className="h-2" />
                                    <p className="text-xs text-muted-foreground">
                                        Membaca halaman {progress.current} dari {progress.total} (
                                        {percent}%)
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : selectedFile ? (
                        <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-xs">
                            <FileText className="h-8 w-8 text-primary" />
                            <div className="text-left">
                                <p className="text-sm font-medium">{selectedFile.name}</p>
                                <p className="text-xs text-muted-foreground">
                                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={resetSelection}
                                aria-label="Batalkan pilihan file"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground group-hover:text-primary transition-colors">
                                <FileUp className="h-7 w-7" />
                            </div>
                            <h3 className="text-base font-semibold text-foreground">
                                Unggah Berita Acara (BA) Stock Opname SAP
                            </h3>
                            <p className="mt-1 text-sm text-muted-foreground max-w-md">
                                Seret dan lepas berkas PDF ke area ini, atau klik tombol di bawah
                                untuk memilih berkas.
                            </p>
                            <div className="mt-5 flex items-center gap-2">
                                <Button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={disabled}
                                    className="gap-2"
                                >
                                    <FileUp className="h-4 w-4" />
                                    Pilih Berkas PDF
                                </Button>
                            </div>
                            <p className="mt-3 text-xs text-muted-foreground">
                                Format didukung: PDF resmi export SAP • Ukuran maksimal 10 MB
                            </p>
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
