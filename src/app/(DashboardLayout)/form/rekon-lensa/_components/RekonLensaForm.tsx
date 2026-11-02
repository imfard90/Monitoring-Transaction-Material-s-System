'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, FileText, Info, PackageCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/app/components/shared/ConfirmDialog';
import { SearchableSelect } from '@/app/components/shared/SearchableSelect';
import { TechnicianMaterialTable } from '@/components/domain/material/TechnicianMaterialTable';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    type TechnicianMaterialItem,
    useMaterialFifoAllocation,
    type WoLensaItem,
    type WoLensaRecord,
} from '@/hooks/use-material-fifo-allocation';
import { queryKeys } from '@/lib/query-keys';
import { generateIdempotencyKey, setIdempotencyKey } from '@/lib/security/idempotency-client';
import {
    getTechnicianMaterials,
    getTechniciansWithIntechSaps,
    getWOLensa,
    submitRekonLensa,
} from '../_actions/rekon-lensa-actions';

function extractDataArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) return value as T[];
    if (
        value &&
        typeof value === 'object' &&
        'data' in value &&
        Array.isArray((value as { data: unknown }).data)
    ) {
        return (value as { data: T[] }).data;
    }
    return [];
}

export default function RekonLensaForm() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [loading, setLoading] = useState(false);
    const [selectedNik, setSelectedNik] = useState<string>('');
    const [selectedWos, setSelectedWos] = useState<Set<string>>(new Set());
    const [showConfirm, setShowConfirm] = useState(false);

    const { data: techData } = useQuery({
        queryKey: queryKeys.technicians.intech(),
        queryFn: async () => {
            const res = await getTechniciansWithIntechSaps();
            if (!res.success) throw new Error(res.error);
            return res.data;
        },
    });

    const { data: materialsData, isLoading: materialsLoading } = useQuery({
        queryKey: queryKeys.technicians.materials(selectedNik),
        queryFn: async () => {
            if (!selectedNik) return [];
            const res = await getTechnicianMaterials(selectedNik);
            if (!res.success) throw new Error(res.error);
            return res.data;
        },
        enabled: !!selectedNik,
    });

    const { data: wosData, isLoading: wosLoading } = useQuery({
        queryKey: queryKeys.technicians.wos(selectedNik),
        queryFn: async () => {
            if (!selectedNik) return [];
            const res = await getWOLensa(selectedNik);
            if (!res.success) throw new Error(res.error);
            return res.data;
        },
        enabled: !!selectedNik,
    });

    // Safely normalize data structures to arrays (preventing runtime TypeError if cached as { success, data })
    const technicians = extractDataArray<{ nik: string; nama_teknisi: string }>(techData);
    const materialsList = extractDataArray<TechnicianMaterialItem>(materialsData);
    const wosList = extractDataArray<WoLensaRecord>(wosData);

    // Delegated to pure domain FIFO Allocation hook
    const {
        allocatedQty,
        availableStockByCode,
        selectedWo,
        woSufficiency,
        validateAllocationSufficiency,
        buildFifoPayload,
    } = useMaterialFifoAllocation({
        selectedWos,
        materialsData: materialsList,
        wosData: wosList,
    });

    // Single WO selection toggle
    const handleWoToggle = (woId: string | number) => {
        const idStr = String(woId);
        const newSet = new Set<string>();
        if (!selectedWos.has(idStr)) {
            newSet.add(idStr);
        }
        setSelectedWos(newSet);
    };

    const handleSubmit = async () => {
        if (!selectedNik || selectedWos.size === 0) {
            toast.error('Pilih teknisi dan minimal 1 WO Lensa');
            return;
        }

        const validation = validateAllocationSufficiency();
        if (!validation.isValid) {
            toast.error(validation.errorMessage || 'Stok tidak mencukupi untuk WO yang dipilih');
            return;
        }

        setShowConfirm(true);
    };

    const confirmSubmit = async () => {
        setLoading(true);
        try {
            const payload = buildFifoPayload();
            const idemKey = generateIdempotencyKey();
            setIdempotencyKey(idemKey);

            const res = await submitRekonLensa(selectedNik, payload, idemKey);

            if (res.success) {
                toast.success('Rekon Lensa berhasil disimpan');
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: queryKeys.technicians.all }),
                    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stockIntech() }),
                ]);
                setSelectedNik('');
                setSelectedWos(new Set());
                setShowConfirm(false);
                router.refresh();
                router.push('/apps/hasil-rekon');
            } else {
                toast.error(res.error || 'Gagal menyimpan Rekon Lensa');
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : 'Terjadi kesalahan');
        } finally {
            setLoading(false);
            setShowConfirm(false);
        }
    };

    const techOptions = technicians.map((t) => ({
        value: t.nik,
        label: `${t.nik} - ${t.nama_teknisi}`,
    }));

    return (
        <StaggerContainer className="space-y-6">
            <StaggerItem>
                <Card className="border border-border bg-card text-card-foreground shadow-xs rounded-xl p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        {/* Selector Teknisi */}
                        <div className="w-full lg:w-80 space-y-1.5">
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Pilih Teknisi
                            </Label>
                            <SearchableSelect
                                options={techOptions}
                                value={selectedNik}
                                onValueChange={(val: string) => {
                                    setSelectedNik(val);
                                    setSelectedWos(new Set());
                                }}
                                placeholder="Cari NIK atau Nama Teknisi..."
                            />
                        </div>

                        {/* Ringkasan & Tombol Aksi */}
                        {selectedNik && (
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3.5 bg-muted/40 p-3 rounded-xl border border-border/70 flex-1 justify-between">
                                <div className="flex flex-wrap items-center gap-2.5 text-xs">
                                    {selectedWo ? (
                                        <>
                                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-background border border-border/80 shadow-2xs">
                                                <span className="text-muted-foreground font-medium">
                                                    WO:
                                                </span>
                                                <span className="font-mono font-bold text-foreground">
                                                    {selectedWo.wo_number}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-background border border-border/80 shadow-2xs">
                                                <span className="text-muted-foreground font-medium">
                                                    Alokasi:
                                                </span>
                                                <span className="font-mono font-bold text-primary">
                                                    {woSufficiency.totalAllocated} item
                                                </span>
                                            </div>
                                            {woSufficiency.isReady ? (
                                                <div className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-medium">
                                                    <CheckCircle2 className="size-3.5" />
                                                    <span>Stok Siap Direkon</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-destructive/10 text-destructive border border-destructive/20 font-medium">
                                                    <AlertCircle className="size-3.5" />
                                                    <span>Stok Teknisi Kurang</span>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="flex items-center gap-1.5 text-muted-foreground py-0.5">
                                            <Info className="size-4 shrink-0 text-muted-foreground" />
                                            <span>
                                                Pilih 1 Work Order Lensa di bawah untuk
                                                rekonsiliasi.
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <Button
                                    size="default"
                                    onClick={handleSubmit}
                                    disabled={loading || !selectedWo || !woSufficiency.isReady}
                                    className="shadow-xs shrink-0 font-semibold"
                                >
                                    Ajukan Rekon Lensa
                                </Button>
                            </div>
                        )}
                    </div>
                </Card>
            </StaggerItem>

            <AnimatePresence mode="wait">
                {selectedNik ? (
                    <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        transition={{ duration: 0.2 }}
                        className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch"
                    >
                        {/* Panel Kiri: Work Order Lensa (50%) */}
                        <Card className="border border-border bg-card text-card-foreground shadow-xs rounded-xl p-5 flex flex-col h-155">
                            <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-border/80 shrink-0">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                                        <FileText className="size-4" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-foreground">
                                            Work Order Lensa
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground">
                                            Pilih 1 WO yang akan direkonsiliasi
                                        </p>
                                    </div>
                                </div>
                                <span className="px-2.5 py-0.5 rounded-full bg-muted text-[11px] font-mono font-semibold text-muted-foreground">
                                    {wosList.length} WO Tersedia
                                </span>
                            </div>

                            <div className="rounded-lg border overflow-y-auto flex-1 min-h-0">
                                <Table>
                                    <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-xs shadow-2xs">
                                        <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border/80">
                                            <TableHead className="w-[40px] text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                Pilih
                                            </TableHead>
                                            <TableHead className="w-[95px] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                                                Tgl Update
                                            </TableHead>
                                            <TableHead className="w-[140px] min-w-[130px] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                No WO
                                            </TableHead>
                                            <TableHead className="w-[90px] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                Tipe
                                            </TableHead>
                                            <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                Material Dibutuhkan
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {wosLoading ? (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={5}
                                                    className="text-center py-12 text-xs text-muted-foreground"
                                                >
                                                    Memuat data WO Lensa...
                                                </TableCell>
                                            </TableRow>
                                        ) : wosList.length === 0 ? (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={5}
                                                    className="text-center py-12 text-xs text-muted-foreground"
                                                >
                                                    Tidak ada WO Lensa yang belum direkon untuk
                                                    teknisi ini
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            wosList.map((wo: WoLensaRecord) => {
                                                const isSelected = selectedWos.has(String(wo.id));
                                                return (
                                                    <TableRow
                                                        key={wo.id}
                                                        className={`cursor-pointer transition-colors border-b hover:bg-muted/50 ${
                                                            isSelected
                                                                ? 'bg-primary/5 border-l-4 border-l-primary font-medium'
                                                                : ''
                                                        }`}
                                                        onClick={() => handleWoToggle(wo.id)}
                                                    >
                                                        <TableCell className="text-center py-2.5 px-2">
                                                            <div
                                                                className={`mx-auto size-4 rounded-full border-2 flex items-center justify-center transition-all ${
                                                                    isSelected
                                                                        ? 'border-primary bg-primary'
                                                                        : 'border-muted-foreground/30 hover:border-primary/60'
                                                                }`}
                                                            >
                                                                {isSelected && (
                                                                    <div className="size-1.5 rounded-full bg-primary-foreground" />
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-xs py-2.5 px-2 font-mono text-muted-foreground whitespace-nowrap">
                                                            {wo.tanggal_update || '-'}
                                                        </TableCell>
                                                        <TableCell className="py-2.5 px-2.5 align-middle">
                                                            <div className="w-[130px] font-mono font-bold text-xs text-foreground break-all whitespace-normal leading-snug">
                                                                {wo.wo_number}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-xs py-2.5 px-2 font-medium text-muted-foreground whitespace-nowrap">
                                                            <span className="px-1.5 py-0.5 rounded bg-muted/80 text-[10px] font-semibold tracking-wide uppercase inline-block">
                                                                {wo.wo_type}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="py-2.5 px-2.5">
                                                            <div className="flex flex-col gap-1.5">
                                                                {Array.isArray(wo.items) &&
                                                                    wo.items.map(
                                                                        (item: WoLensaItem) => {
                                                                            const matId =
                                                                                item.material_id ||
                                                                                '';
                                                                            const qtyPem = Number(
                                                                                item.qty_pemakaian ||
                                                                                    0
                                                                            );
                                                                            const available =
                                                                                availableStockByCode[
                                                                                    matId
                                                                                ] || 0;
                                                                            const isOk =
                                                                                available >= qtyPem;
                                                                            return (
                                                                                <span
                                                                                    key={`${wo.id}-${matId}`}
                                                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium border w-fit shadow-2xs ${
                                                                                        isOk
                                                                                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                                                                                            : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
                                                                                    }`}
                                                                                    title={`Dibutuhkan: ${qtyPem} ${item.uom || ''} | Stok tersedia: ${available} ${item.uom || ''}`}
                                                                                >
                                                                                    <span className="font-bold">
                                                                                        {matId}
                                                                                    </span>
                                                                                    <span className="text-muted-foreground">
                                                                                        :
                                                                                    </span>
                                                                                    <span className="font-bold">
                                                                                        {qtyPem}
                                                                                    </span>
                                                                                    <span className="text-[10px] text-muted-foreground">
                                                                                        {item.uom}
                                                                                    </span>
                                                                                </span>
                                                                            );
                                                                        }
                                                                    )}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </Card>

                        {/* Panel Kanan: Material di Tangan Teknisi (FIFO) (50%) */}
                        <Card className="border border-border bg-card text-card-foreground shadow-xs rounded-xl p-5 flex flex-col h-[620px]">
                            <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-border/80 shrink-0">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                                        <PackageCheck className="size-4" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-foreground">
                                            Material di Tangan Teknisi (FIFO)
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground">
                                            Alokasi otomatis dari pengeluaran SAP
                                        </p>
                                    </div>
                                </div>
                                <span className="px-2.5 py-0.5 rounded-full bg-muted text-[11px] font-mono font-semibold text-muted-foreground">
                                    {materialsList.length} Item SAP
                                </span>
                            </div>

                            <div className="rounded-lg border overflow-y-auto flex-1 min-h-0">
                                <TechnicianMaterialTable
                                    materials={materialsList}
                                    loading={materialsLoading}
                                    emptyMessage="Tidak ada material di tangan teknisi"
                                    mode="allocation"
                                    quantities={allocatedQty}
                                    hideNoColumn={true}
                                    hideDescriptionColumn={true}
                                    wrapAllocationHeader={true}
                                    className="border-0 rounded-none h-full"
                                />
                            </div>
                        </Card>
                    </motion.div>
                ) : (
                    <Card className="border border-dashed border-border/80 bg-muted/20 p-12 text-center rounded-xl">
                        <div className="max-w-xs mx-auto space-y-2">
                            <div className="size-10 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                                <FileText className="size-5" />
                            </div>
                            <h4 className="text-sm font-semibold text-foreground">
                                Teknisi Belum Dipilih
                            </h4>
                            <p className="text-xs text-muted-foreground">
                                Silakan pilih teknisi pada kolom di atas untuk menampilkan daftar
                                Work Order Lensa dan stok material FIFO.
                            </p>
                        </div>
                    </Card>
                )}
            </AnimatePresence>

            <ConfirmDialog
                isOpen={showConfirm}
                onOpenChange={(open) => setShowConfirm(open)}
                onConfirm={confirmSubmit}
                title="Konfirmasi Rekon Lensa"
                description="Pastikan data WO dan alokasi material sudah benar. Transaksi ini akan memotong stok di tangan teknisi."
                confirmText={loading ? 'Memproses...' : 'Ya, Submit'}
                cancelText="Batal"
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-sm bg-muted/40 p-4 rounded-xl border border-border/70">
                        <div>
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                                Teknisi:
                            </span>
                            <span className="font-semibold text-foreground">
                                {techOptions.find(
                                    (t: { value: string; label: string }) => t.value === selectedNik
                                )?.label || selectedNik}
                            </span>
                        </div>
                        <div>
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                                Work Order:
                            </span>
                            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-background border border-border/70 text-foreground inline-block">
                                {selectedWo?.wo_number || `${selectedWos.size} WO Dipilih`}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
                            Material yang Akan Dialokasikan:
                        </span>
                        <div className="flex flex-wrap gap-2 p-3 bg-muted/30 border border-border/70 rounded-xl">
                            {Object.entries(
                                Object.entries(allocatedQty).reduce(
                                    (acc, [sapOutItemId, qty]) => {
                                        if (qty > 0) {
                                            const mat = materialsList.find(
                                                (m: TechnicianMaterialItem) =>
                                                    String(m.sap_out_item_id) === sapOutItemId
                                            );
                                            if (mat?.material_code) {
                                                acc[mat.material_code as string] =
                                                    (acc[mat.material_code as string] || 0) + qty;
                                            }
                                        }
                                        return acc;
                                    },
                                    {} as Record<string, number>
                                )
                            ).map(([code, qty]) => (
                                <div
                                    key={code}
                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-border/70 text-xs shadow-2xs"
                                >
                                    <span className="font-mono font-semibold text-primary">
                                        {code}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono font-bold text-xs">
                                        {qty}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </ConfirmDialog>
        </StaggerContainer>
    );
}
