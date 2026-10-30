'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/app/components/shared/ConfirmDialog';
import { SearchableSelect } from '@/app/components/shared/SearchableSelect';
import { TechnicianMaterialTable } from '@/components/domain/material/TechnicianMaterialTable';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { generateIdempotencyKey, setIdempotencyKey } from '@/lib/security/idempotency-client';
import {
    getTechnicianMaterials,
    getTechniciansWithIntechSaps,
    getWOLensa,
    type RekonLensaItemPayload,
    submitRekonLensa,
} from '../_actions/rekon-lensa-actions';

export default function RekonLensaForm() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [loading, setLoading] = useState(false);
    const [selectedNik, setSelectedNik] = useState<string>('');

    const [selectedWos, setSelectedWos] = useState<Set<number>>(new Set());
    const [allocatedQty, setAllocatedQty] = useState<Record<string, number>>({});
    const [showConfirm, setShowConfirm] = useState(false);

    const { data: techData, isLoading: techLoading } = useQuery({
        queryKey: ['technicians-intech'],
        queryFn: async () => {
            const res = await getTechniciansWithIntechSaps();
            if (!res.success) throw new Error(res.error);
            return res.data;
        },
    });

    const { data: materialsData, isLoading: materialsLoading } = useQuery({
        queryKey: ['technician-materials', selectedNik],
        queryFn: async () => {
            if (!selectedNik) return [];
            const res = await getTechnicianMaterials(selectedNik);
            if (!res.success) throw new Error(res.error);
            return res.data;
        },
        enabled: !!selectedNik,
    });

    const { data: wosData, isLoading: wosLoading } = useQuery({
        queryKey: ['technician-wos', selectedNik],
        queryFn: async () => {
            if (!selectedNik) return [];
            const res = await getWOLensa(selectedNik);
            if (!res.success) throw new Error(res.error);
            return res.data;
        },
        enabled: !!selectedNik,
    });

    // Auto-fill logic (FIFO)
    useEffect(() => {
        if (!materialsData || !wosData) return;

        // Calculate total required per material code
        const requiredPerMaterial: Record<string, number> = {};

        wosData.forEach((wo: any) => {
            if (selectedWos.has(wo.id)) {
                wo.items.forEach((item: any) => {
                    const code = item.material_id;
                    requiredPerMaterial[code] =
                        (requiredPerMaterial[code] || 0) + item.qty_pemakaian;
                });
            }
        });

        // Allocate using FIFO
        const newAllocated: Record<string, number> = {};
        const remainingReq = { ...requiredPerMaterial };

        materialsData.forEach((mat: any) => {
            const code = mat.material_code;
            const available = mat.qty_req - (mat.qty_used || 0);

            if (remainingReq[code] > 0 && available > 0) {
                const toAllocate = Math.min(remainingReq[code], available);
                newAllocated[mat.sap_out_item_id] = toAllocate;
                remainingReq[code] -= toAllocate;
            } else {
                newAllocated[mat.sap_out_item_id] = 0;
            }
        });

        setAllocatedQty(newAllocated);
    }, [selectedWos, materialsData, wosData]);

    const handleWoToggle = (woId: number) => {
        const newSet = new Set<number>();
        if (!selectedWos.has(woId)) {
            newSet.add(woId);
        }
        setSelectedWos(newSet);
    };

    const handleSubmit = async () => {
        if (!selectedNik || selectedWos.size === 0) {
            toast.error('Pilih teknisi dan minimal 1 WO Lensa');
            return;
        }

        // Check if all required materials are fulfilled
        const requiredPerMaterial: Record<string, number> = {};
        wosData?.forEach((wo: any) => {
            if (selectedWos.has(wo.id)) {
                wo.items.forEach((item: any) => {
                    const code = item.material_id;
                    requiredPerMaterial[code] =
                        (requiredPerMaterial[code] || 0) + item.qty_pemakaian;
                });
            }
        });

        const allocatedPerMaterial: Record<string, number> = {};
        materialsData?.forEach((mat: any) => {
            const code = mat.material_code;
            allocatedPerMaterial[code] =
                (allocatedPerMaterial[code] || 0) + (allocatedQty[mat.sap_out_item_id] || 0);
        });

        for (const code in requiredPerMaterial) {
            if (requiredPerMaterial[code] > (allocatedPerMaterial[code] || 0)) {
                toast.error(
                    `Stok material ${code} di tangan teknisi tidak mencukupi untuk WO yang dipilih.`
                );
                return;
            }
        }

        setShowConfirm(true);
    };

    const confirmSubmit = async () => {
        setLoading(true);
        try {
            const payload: RekonLensaItemPayload[] = [];

            wosData?.forEach((wo: any) => {
                if (selectedWos.has(wo.id)) {
                    // For each WO, we need to find which SAP items fulfill its requirements
                    // We do a mini-FIFO just for this WO to map it to sap_out_items
                    const woReq = { ...requiredPerMaterialForWo(wo) };

                    materialsData?.forEach((mat: any) => {
                        const code = mat.material_code;
                        const available =
                            mat.qty_req -
                            (mat.qty_used || 0) -
                            payload
                                .filter((p) => p.sap_out_item_id === mat.sap_out_item_id)
                                .reduce((sum, p) => sum + p.qty, 0);

                        if (woReq[code] > 0 && available > 0) {
                            const toAllocate = Math.min(woReq[code], available);

                            payload.push({
                                sap_out_id: String(mat.sap_out_id),
                                sap_number: mat.sap_number,
                                name_sa: mat.name_sa,
                                name_wh: mat.name_wh,
                                designator_id: mat.designator_id,
                                sap_out_item_id: String(mat.sap_out_item_id),
                                qty: toAllocate,
                                wo_type: wo.wo_type,
                                wo_number: wo.wo_number,
                                pemakaian_id: String(wo.pemakaian_id),
                                notes: 'Rekon Lensa',
                            });

                            woReq[code] -= toAllocate;
                        }
                    });
                }
            });

            const idemKey = generateIdempotencyKey();
            setIdempotencyKey(idemKey);

            const res = await submitRekonLensa(selectedNik, payload, idemKey);

            if (res.success) {
                toast.success('Rekon Lensa berhasil disimpan');
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ['technicians-intech'] }),
                    queryClient.invalidateQueries({ queryKey: ['technician-materials'] }),
                    queryClient.invalidateQueries({ queryKey: ['technician-wos'] }),
                    queryClient.invalidateQueries({ queryKey: ['dashboardStockIntech'] }),
                ]);
                setSelectedNik('');
                setSelectedWos(new Set());
                setAllocatedQty({});
                setShowConfirm(false);
                router.refresh();
                router.push('/apps/hasil-rekon');
            } else {
                toast.error(res.error || 'Gagal menyimpan Rekon Lensa');
            }
        } catch (error: any) {
            toast.error(error.message || 'Terjadi kesalahan');
        } finally {
            setLoading(false);
            setShowConfirm(false);
        }
    };

    const requiredPerMaterialForWo = (wo: any) => {
        const req: Record<string, number> = {};
        wo.items.forEach((item: any) => {
            req[item.material_id] = (req[item.material_id] || 0) + item.qty_pemakaian;
        });
        return req;
    };

    const techOptions =
        techData?.map((t: any) => ({
            value: t.nik,
            label: `${t.nik} - ${t.nama_teknisi}`,
        })) || [];

    return (
        <StaggerContainer className="space-y-6">
            <StaggerItem>
                <Card className="border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md motion-reduce:transition-none p-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                        <div className="flex-1 space-y-2 max-w-md">
                            <Label>Pilih Teknisi</Label>
                            <SearchableSelect
                                options={techOptions}
                                value={selectedNik}
                                onValueChange={(val: string) => {
                                    setSelectedNik(val);
                                    setSelectedWos(new Set());
                                    setAllocatedQty({});
                                }}
                                placeholder="Cari NIK atau Nama Teknisi..."
                            />
                        </div>
                        {selectedNik && (
                            <Button
                                size="lg"
                                onClick={handleSubmit}
                                disabled={loading || selectedWos.size === 0}
                            >
                                Ajukan Rekon Lensa
                            </Button>
                        )}
                    </div>
                </Card>
            </StaggerItem>

            <AnimatePresence mode="wait">
                {selectedNik && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="grid grid-cols-1 lg:grid-cols-5 gap-6"
                    >
                        {/* WO Lensa Table */}
                        <Card className="border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md motion-reduce:transition-none p-6 flex flex-col h-full lg:col-span-3">
                            <div className="flex items-center gap-2 mb-4">
                                <FileText className="h-5 w-5 text-primary" />
                                <h3 className="text-lg font-semibold">Work Order Lensa</h3>
                            </div>
                            <div className="rounded-md border flex-1 overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[50px]"></TableHead>
                                            <TableHead>Tanggal Update</TableHead>
                                            <TableHead className="w-[150px]">Nomor WO</TableHead>
                                            <TableHead>Tipe</TableHead>
                                            <TableHead>Material Dibutuhkan</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {wosLoading ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-8">
                                                    Memuat data, mohon tunggu...
                                                </TableCell>
                                            </TableRow>
                                        ) : wosData?.length === 0 ? (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={5}
                                                    className="text-center py-8 text-muted-foreground"
                                                >
                                                    Tidak ada WO Lensa yang belum direkon
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            wosData?.map((wo: any) => (
                                                <TableRow
                                                    key={wo.id}
                                                    className={`cursor-pointer hover:bg-muted/50 ${
                                                        selectedWos.has(wo.id) ? 'bg-primary/5' : ''
                                                    }`}
                                                    onClick={() => handleWoToggle(wo.id)}
                                                >
                                                    <TableCell>
                                                        <Checkbox
                                                            checked={selectedWos.has(wo.id)}
                                                            onCheckedChange={() =>
                                                                handleWoToggle(wo.id)
                                                            }
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        {wo.tanggal_update || '-'}
                                                    </TableCell>
                                                    <TableCell className="font-medium w-[150px] whitespace-normal break-words">
                                                        {wo.wo_number}
                                                    </TableCell>
                                                    <TableCell className="uppercase">
                                                        {wo.wo_type}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="space-y-1 text-sm">
                                                            {wo.items.map(
                                                                (item: any, idx: number) => (
                                                                    <div key={idx}>
                                                                        {item.material_id} :{' '}
                                                                        {item.qty_pemakaian}{' '}
                                                                        {item.uom}
                                                                    </div>
                                                                )
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </Card>

                        {/* Material di Tangan Teknisi Table */}
                        <Card className="border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md motion-reduce:transition-none p-6 flex flex-col h-full lg:col-span-2">
                            <div className="flex items-center gap-2 mb-4">
                                <FileText className="h-5 w-5 text-primary" />
                                <h3 className="text-lg font-semibold">
                                    Material di Tangan Teknisi (FIFO)
                                </h3>
                            </div>
                            <TechnicianMaterialTable
                                materials={materialsData || []}
                                loading={materialsLoading}
                                emptyMessage="Tidak ada material di tangan teknisi"
                                mode="allocation"
                                quantities={allocatedQty}
                                className="flex-1"
                            />
                        </Card>
                    </motion.div>
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
                                {techOptions.find((t: any) => t.value === selectedNik)?.label ||
                                    selectedNik}
                            </span>
                        </div>
                        <div>
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                                Total Work Order:
                            </span>
                            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-background border border-border/70 text-foreground inline-block">
                                {selectedWos.size} WO Dipilih
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
                                            const mat = materialsData?.find(
                                                (m: any) =>
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
