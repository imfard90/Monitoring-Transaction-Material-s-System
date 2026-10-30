'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/app/components/shared/ConfirmDialog';
import { SearchableSelect } from '@/app/components/shared/SearchableSelect';
import { TechnicianMaterialTable } from '@/components/domain/material/TechnicianMaterialTable';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { generateIdempotencyKey, setIdempotencyKey } from '@/lib/security/idempotency-client';
import {
    getTechnicianMaterials,
    getTechniciansWithIntechSaps,
    type RekonItemPayload,
    submitRekonIntech,
} from '../_actions/rekon-actions';

export default function RekonIntechForm() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [loading, setLoading] = useState(false);
    const [selectedNik, setSelectedNik] = useState<string>('');

    // Global fields
    const [globalWoType, setGlobalWoType] = useState<string>('');
    const [globalWoNumber, setGlobalWoNumber] = useState<string>('');
    const [globalNotes, setGlobalNotes] = useState<string>('');

    // State for form rows (only qty now), keyed by sap_out_item_id
    const [rowStates, setRowStates] = useState<Record<string, string>>({});

    // Modal state
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [itemsToSubmit, setItemsToSubmit] = useState<RekonItemPayload[]>([]);

    const { data: techData } = useQuery({
        queryKey: ['intechTechnicians'],
        queryFn: getTechniciansWithIntechSaps,
    });

    const technicians = techData?.data || [];
    const techOptions = technicians.map((t: any) => ({
        value: t.nik,
        label: `${t.nik} - ${t.nama_teknisi}`,
    }));

    const { data: materialsData, isLoading: isLoadingMaterials } = useQuery({
        queryKey: ['technicianMaterials', selectedNik],
        queryFn: () => getTechnicianMaterials(selectedNik),
        enabled: !!selectedNik,
    });

    const materials = materialsData?.data || [];

    // Reset row states when materials change
    useEffect(() => {
        const mats = materialsData?.data;
        if (mats && mats.length > 0) {
            const initial: Record<string, string> = {};
            mats.forEach((m: any) => {
                initial[m.sap_out_item_id] = '';
            });
            setRowStates(initial);
        } else {
            setRowStates({});
        }
    }, [materialsData?.data]);

    const handleQtyChange = (itemId: string | number, value: string) => {
        setRowStates((prev) => ({
            ...prev,
            [itemId]: value,
        }));
    };

    const handlePreSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedNik) {
            toast.error('Please select a technician.');
            return;
        }

        if (!globalWoType) {
            toast.error('Please select WO Type.');
            return;
        }

        if (!globalWoNumber.trim()) {
            toast.error('Please enter WO Number.');
            return;
        }

        // Filter rows that have input
        const preparedItems: RekonItemPayload[] = [];

        for (const m of materials) {
            const rawQty = rowStates[m.sap_out_item_id];
            if (rawQty === '' || rawQty === undefined) continue;

            const qty = Number(rawQty);
            if (!Number.isFinite(qty) || !Number.isInteger(qty)) {
                toast.error(
                    `Quantity for material ${m.material_code} must be a valid whole number.`
                );
                return;
            }
            if (qty === 0) continue;

            if (qty < 0) {
                toast.error(`Quantity for material ${m.material_code} cannot be negative.`);
                return;
            }

            const availableQty = m.qty_req - (m.qty_used || 0);
            if (qty > availableQty) {
                toast.error(
                    `Quantity for material ${m.material_code} exceeds available stock (${availableQty}).`
                );
                return;
            }

            preparedItems.push({
                sap_out_id: m.sap_out_id,
                id_trx: m.id_trx,
                sap_number: m.sap_number,
                name_sa: m.name_sa,
                name_wh: m.name_wh,
                designator_id: m.designator_id,
                sap_out_item_id: m.sap_out_item_id,
                qty: qty,
                wo_type: globalWoType,
                wo_number: globalWoNumber.trim(),
                notes: globalNotes.trim(),
            });
        }

        if (preparedItems.length === 0) {
            toast.error('No usage reported. Please enter Used Qty for at least one material.');
            return;
        }

        setItemsToSubmit(preparedItems);
        setIsConfirmModalOpen(true);
    };

    const handleConfirmSubmit = async () => {
        setLoading(true);

        const idemKey = generateIdempotencyKey();
        setIdempotencyKey(idemKey, 'inventoryTx');

        const res = await submitRekonIntech(selectedNik, itemsToSubmit, idemKey);

        if (res.success) {
            toast.success('Rekon Intech berhasil disubmit!');
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['intechTechnicians'] }),
                queryClient.invalidateQueries({ queryKey: ['technicianMaterials'] }),
                queryClient.invalidateQueries({ queryKey: ['dashboardStockIntech'] }),
            ]);
            setSelectedNik('');
            setGlobalWoType('');
            setGlobalWoNumber('');
            setGlobalNotes('');
            setIsConfirmModalOpen(false);
            router.refresh();
            router.push('/apps/out-material');
        } else {
            toast.error(res.error || 'Failed to submit Rekon Intech');
        }

        setLoading(false);
    };

    const selectedTechName = techOptions.find((t) => t.value === selectedNik)?.label || '';

    const totalQty = useMemo(
        () => itemsToSubmit.reduce((acc, curr) => acc + (Number(curr.qty) || 0), 0),
        [itemsToSubmit]
    );

    return (
        <StaggerContainer>
            <Card className="border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md motion-reduce:transition-none p-6">
                <form onSubmit={handlePreSubmit} className="space-y-8">
                    <StaggerItem>
                        <h2 className="text-lg font-bold text-foreground mb-4 border-b border-border/70 pb-3">
                            Form Rekon Intech (Pemakaian Material)
                        </h2>

                        <div className="space-y-6">
                            <div className="max-w-md space-y-2">
                                <Label>Pilih Teknisi *</Label>
                                <SearchableSelect
                                    options={techOptions}
                                    value={selectedNik}
                                    onValueChange={setSelectedNik}
                                    placeholder="Cari NIK / Nama Teknisi"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                <div className="space-y-2">
                                    <Label>Tipe WO *</Label>
                                    <Select
                                        value={globalWoType}
                                        onValueChange={setGlobalWoType}
                                        disabled={!selectedNik}
                                    >
                                        <SelectTrigger className="h-10">
                                            <SelectValue placeholder="Pilih Tipe WO" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="psb">PSB</SelectItem>
                                            <SelectItem value="assurance">Assurance</SelectItem>
                                            <SelectItem value="myrep">MyRep</SelectItem>
                                            <SelectItem value="qe/gamas">QE/Gamas</SelectItem>
                                            <SelectItem value="mtel">MTel</SelectItem>
                                            <SelectItem value="lintas_arta">Lintas Arta</SelectItem>
                                            <SelectItem value="project">Project</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Nomor WO *</Label>
                                    <Input
                                        value={globalWoNumber}
                                        onChange={(e) => setGlobalWoNumber(e.target.value)}
                                        className="h-10"
                                        placeholder="WO-123..."
                                        disabled={!selectedNik}
                                        maxLength={50}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Catatan</Label>
                                    <Input
                                        value={globalNotes}
                                        onChange={(e) => setGlobalNotes(e.target.value)}
                                        className="h-10"
                                        placeholder="Catatan tambahan..."
                                        disabled={!selectedNik}
                                    />
                                </div>
                            </div>
                        </div>
                    </StaggerItem>

                    {/* Items Section */}
                    <StaggerItem className="space-y-4 pt-4 border-t">
                        <h3 className="text-base font-semibold">Material Di Tangan Teknisi</h3>

                        {selectedNik ? (
                            <TechnicianMaterialTable
                                materials={materials}
                                loading={isLoadingMaterials}
                                emptyMessage="Tidak ada material (Intech) untuk teknisi ini."
                                mode="input"
                                quantities={rowStates}
                                onQuantityChange={handleQtyChange}
                                showTransactionId={true}
                            />
                        ) : (
                            <div
                                className="text-center p-8 border border-dashed rounded-md text-muted-foreground bg-muted/50"
                                role="status"
                            >
                                Silakan pilih teknisi terlebih dahulu.
                            </div>
                        )}
                    </StaggerItem>

                    <StaggerItem className="pt-6 border-t flex justify-end gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setSelectedNik('');
                                setGlobalWoType('');
                                setGlobalWoNumber('');
                                setGlobalNotes('');
                                setRowStates({});
                            }}
                            disabled={loading}
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            disabled={loading || !selectedNik || materials.length === 0}
                            className="gap-2"
                        >
                            <FileText size={16} />
                            Tinjau Rekon
                        </Button>
                    </StaggerItem>
                </form>

                {/* Confirmation Modal */}
                <ConfirmDialog
                    isOpen={isConfirmModalOpen}
                    onOpenChange={setIsConfirmModalOpen}
                    title="Konfirmasi Pemakaian Material"
                    description="Periksa kembali ringkasan pemakaian material berikut sebelum mensubmit."
                    onConfirm={handleConfirmSubmit}
                    loading={loading}
                >
                    <div className="space-y-4">
                        <p className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm font-semibold leading-relaxed text-foreground">
                            Apakah anda melakukan rekon manual? Pastikan WO tersebut tidak di-update
                            menggunakan Lensa.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-sm bg-muted/40 p-4 rounded-xl border border-border/70">
                            <div>
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                                    Teknisi:
                                </span>
                                <span className="font-semibold text-foreground">
                                    {selectedTechName || '-'}
                                </span>
                            </div>
                            <div>
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                                    Tipe WO:
                                </span>
                                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-background border border-border/70 uppercase text-foreground inline-block">
                                    {globalWoType || '-'}
                                </span>
                            </div>
                            <div>
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                                    Nomor WO:
                                </span>
                                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-background border border-border/70 text-foreground inline-block">
                                    {globalWoNumber || '-'}
                                </span>
                            </div>
                            <div>
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                                    Catatan:
                                </span>
                                <span className="text-muted-foreground text-xs">
                                    {globalNotes || '-'}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-foreground">
                                    Material Terpakai
                                </h4>
                                <span className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full border border-border/40">
                                    {itemsToSubmit.length} item material
                                </span>
                            </div>

                            <div className="border border-border/70 rounded-xl overflow-hidden shadow-xs">
                                <div className="max-h-[260px] overflow-y-auto">
                                    <Table>
                                        <TableHeader className="bg-muted/80 backdrop-blur-xs sticky top-0 z-10 border-b border-border">
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead className="w-12 text-center text-[11px] font-semibold uppercase tracking-wider">
                                                    No
                                                </TableHead>
                                                <TableHead className="text-[11px] font-semibold uppercase tracking-wider">
                                                    Material
                                                </TableHead>
                                                <TableHead className="w-24 text-center text-[11px] font-semibold uppercase tracking-wider">
                                                    Qty Used
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {itemsToSubmit.map((item, idx) => {
                                                const mat = materials.find(
                                                    (m: Record<string, unknown>) =>
                                                        m.sap_out_item_id === item.sap_out_item_id
                                                );
                                                return (
                                                    <TableRow
                                                        key={item.sap_out_item_id}
                                                        className="hover:bg-muted/40 transition-colors"
                                                    >
                                                        <TableCell className="text-center text-xs font-mono text-muted-foreground">
                                                            {idx + 1}
                                                        </TableCell>
                                                        <TableCell className="py-2.5">
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="font-mono text-xs font-semibold text-primary">
                                                                    {String(
                                                                        mat?.material_code ?? '-'
                                                                    )}
                                                                </span>
                                                                <span
                                                                    className="text-xs text-muted-foreground line-clamp-1"
                                                                    title={String(
                                                                        mat?.description ?? ''
                                                                    )}
                                                                >
                                                                    {String(
                                                                        mat?.description ?? '-'
                                                                    )}
                                                                </span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center font-mono font-bold text-sm text-foreground">
                                                            <span className="inline-block px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                                                {item.qty}
                                                            </span>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                        <TableFooter className="bg-muted/50 border-t border-border font-medium">
                                            <TableRow className="hover:bg-transparent">
                                                <TableCell
                                                    colSpan={2}
                                                    className="text-right text-xs font-semibold uppercase tracking-wider"
                                                >
                                                    Total Qty Digunakan:
                                                </TableCell>
                                                <TableCell className="text-center font-mono font-bold text-sm text-primary">
                                                    {totalQty}
                                                </TableCell>
                                            </TableRow>
                                        </TableFooter>
                                    </Table>
                                </div>
                            </div>
                        </div>
                    </div>
                </ConfirmDialog>
            </Card>
        </StaggerContainer>
    );
}
