'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type React from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LoadingOverlay } from '@/app/components/shared/LoadingOverlay';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { queryKeys } from '@/lib/query-keys';
import { generateIdempotencyKey, setIdempotencyKey } from '@/lib/security/idempotency-client';
import type { OutSapFormItem } from '@/lib/types/inventory';
import {
    createOutSap,
    getBranches,
    getMaterialsInWarehouse,
    getOutLensaReservationOptionsForAdmin,
    getOutSapReservationData,
    getTechnicians,
    getWarehouses,
} from '../_actions/out-sap-actions';
import { OutSapConfirmModal } from './OutSapConfirmModal';
import { type OutSapFormData, OutSapHeaderFields } from './OutSapHeaderFields';
import { OutSapMaterialList } from './OutSapMaterialList';

interface OutSapFormProps {
    currentUser?: {
        isStaff: boolean;
        warehouseIds: number[];
        nik: string;
    };
}

export default function OutSapForm({ currentUser }: OutSapFormProps) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [loading, setLoading] = useState(false);
    const [isScraping, setIsScraping] = useState(false);
    const [isScraped, setIsScraped] = useState(false);
    const [formData, setFormData] = useState<OutSapFormData>({
        nik_teknisi: '',
        name_sa: '',
        warehouse_id: '',
        id_reservasi: '',
        sap_number: '',
        request_id: '',
    });

    const [items, setItems] = useState<OutSapFormItem[]>([]);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

    const { data: techData } = useQuery({
        queryKey: queryKeys.technicians.bySa(formData.name_sa),
        queryFn: () => getTechnicians(formData.name_sa),
        enabled: !!formData.name_sa,
    });

    const { data: whData } = useQuery({
        queryKey: queryKeys.warehouses.all,
        queryFn: getWarehouses,
    });

    const { data: matData, isFetching: isFetchingMaterials } = useQuery({
        queryKey: queryKeys.materials.byWarehouse(formData.warehouse_id),
        queryFn: () => getMaterialsInWarehouse(parseInt(formData.warehouse_id, 10)),
        enabled: !!formData.warehouse_id,
    });

    const { data: branchData } = useQuery({
        queryKey: queryKeys.branches.all,
        queryFn: getBranches,
    });

    // Untuk Admin: query daftar reservasi dari out_lensa_ref_header
    const { data: adminOptionsRes } = useQuery({
        queryKey: ['out-lensa-reservation-options-admin'],
        queryFn: getOutLensaReservationOptionsForAdmin,
        enabled: !currentUser?.isStaff,
    });

    const technicians = techData?.data || [];
    const warehouses = whData?.data || [];
    const materials = matData?.data || [];
    const branches = branchData?.data || [];
    const adminReservationOptions = adminOptionsRes?.data || [];

    // User staff gudang otomatis terisi sesuai gudangnya
    useEffect(() => {
        if (currentUser?.isStaff && warehouses.length > 0 && !formData.warehouse_id) {
            setFormData((prev) => ({
                ...prev,
                warehouse_id: String(warehouses[0].id),
            }));
        }
    }, [currentUser?.isStaff, warehouses, formData.warehouse_id]);

    const handleGetData = async () => {
        const cleanReqId = formData.request_id.trim();
        if (!cleanReqId) {
            toast.error('Masukkan Request ID terlebih dahulu');
            return;
        }
        setIsScraping(true);
        try {
            const res = await getOutSapReservationData({
                requestId: cleanReqId,
                warehouseId: formData.warehouse_id
                    ? parseInt(formData.warehouse_id, 10)
                    : undefined,
            });

            if (!res.success || !res.data) {
                toast.error(res.error || 'Gagal mengambil data reservasi');
                setIsScraping(false);
                return;
            }

            const {
                id_reservasi,
                sap_number,
                name_sa,
                nik_teknisi,
                warehouse_id,
                items: mappedItems,
                source,
                nik_pemakai,
            } = res.data;

            setFormData((prev) => ({
                ...prev,
                id_reservasi: id_reservasi || prev.id_reservasi,
                sap_number: sap_number || prev.sap_number,
                name_sa: name_sa || prev.name_sa,
                nik_teknisi: nik_teknisi || prev.nik_teknisi,
                warehouse_id: warehouse_id || prev.warehouse_id,
            }));

            if (mappedItems && mappedItems.length > 0) {
                setItems(mappedItems);
                setIsScraped(true);

                if (nik_pemakai && !nik_teknisi) {
                    toast.error(
                        `Teknisi (NIK: ${nik_pemakai}) tidak ditemukan di Master Data Teknisi MTMS. Material berhasil dimuat, silakan daftarkan teknisi tersebut.`
                    );
                } else if (source === 'database') {
                    toast.success(
                        'Data reservasi berhasil dimuat dari database referensi Out Lensa.'
                    );
                } else {
                    toast.success('Data reservasi Lensa berhasil diambil secara langsung.');
                }
            } else {
                setIsScraped(true);
                toast.warning(
                    'Data reservasi berhasil diambil, tetapi tidak ada material yang cocok dengan database MTMS.'
                );
            }
        } catch (_err) {
            toast.error('Terjadi kesalahan jaringan atau sistem.');
        } finally {
            setIsScraping(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (
            !formData.nik_teknisi ||
            !formData.warehouse_id ||
            !formData.id_reservasi.trim() ||
            !formData.sap_number.trim() ||
            items.length === 0
        ) {
            toast.error(
                'Silakan lengkapi seluruh kolom wajib dan tambahkan minimal satu material.'
            );
            return;
        }

        for (const item of items) {
            if (
                !item.designator_id ||
                item.qty_req === '' ||
                !Number.isFinite(Number(item.qty_req)) ||
                Number(item.qty_req) <= 0
            ) {
                toast.error(
                    'Pilihan material atau jumlah permintaan tidak valid. Silakan periksa kembali.'
                );
                return;
            }
        }

        setIsConfirmModalOpen(true);
    };

    const handleConfirmSubmit = async () => {
        setLoading(true);

        const idemKey = generateIdempotencyKey();
        setIdempotencyKey(idemKey, 'inventoryTx');

        const payload = {
            ...formData,
            idemKey,
            warehouse_id: parseInt(formData.warehouse_id, 10),
            items: items.map((i) => ({
                designator_id: Number(i.designator_id),
                qty_req: Number(i.qty_req),
            })),
        };

        const res = await createOutSap(payload);

        if (res.success && res.header_id) {
            toast.success(
                'Pengeluaran SAP berhasil disimpan dan status menjadi Intech. Stok gudang berhasil dialokasikan.'
            );
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.materials.all }),
                queryClient.invalidateQueries({ queryKey: queryKeys.technicians.all }),
                queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stockIntech() }),
            ]);
            setFormData({
                nik_teknisi: '',
                name_sa: '',
                warehouse_id: '',
                id_reservasi: '',
                sap_number: '',
                request_id: '',
            });
            setItems([]);
            setIsConfirmModalOpen(false);
            router.refresh();
            router.push('/apps/out-material');
        } else {
            toast.error(res.error || 'Gagal menyimpan transaksi Out SAP');
        }

        setLoading(false);
        setIsConfirmModalOpen(false);
    };

    const selectedTech = technicians?.find(
        (t: Record<string, unknown>) => t.nik === formData.nik_teknisi
    );
    const selectedWh = warehouses?.find(
        (w: Record<string, unknown>) => w.id?.toString() === formData.warehouse_id
    );

    const checkItemError = (item: OutSapFormItem) => {
        if (isFetchingMaterials) return false;
        if (!item.designator_id || item.qty_req === '' || Number(item.qty_req) <= 0) return true;
        const selectedMat = materials.find(
            (m: Record<string, unknown>) => m.id?.toString() === item.designator_id
        );
        if (!selectedMat) return true;
        if (Number(item.qty_req) > Number(selectedMat.qty)) return true;
        return false;
    };

    const hasAnyError = items.length === 0 || items.some(checkItemError);

    return (
        <>
            <LoadingOverlay
                isVisible={isScraping || loading}
                text={isScraping ? 'Menarik Data Lensa...' : 'Memproses Transaksi...'}
            />
            <StaggerContainer>
                <Card className="border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md motion-reduce:transition-none p-6">
                    <form onSubmit={handleSubmit} className="space-y-8">
                        <OutSapHeaderFields
                            formData={formData}
                            setFormData={setFormData}
                            isScraping={isScraping}
                            isScraped={isScraped}
                            onGetData={handleGetData}
                            technicians={technicians}
                            warehouses={warehouses}
                            branches={branches}
                            isStaff={Boolean(currentUser?.isStaff)}
                            adminReservationOptions={adminReservationOptions}
                        />

                        <OutSapMaterialList
                            items={items}
                            setItems={setItems}
                            materials={materials}
                            isFetchingMaterials={isFetchingMaterials}
                            isScraped={isScraped}
                            warehouseId={formData.warehouse_id}
                            idReservasi={formData.id_reservasi}
                            sapNumber={formData.sap_number}
                            checkItemError={checkItemError}
                        />

                        <StaggerItem className="pt-6 border-t border-border flex justify-end gap-3">
                            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }}>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setFormData({
                                            nik_teknisi: '',
                                            name_sa: '',
                                            warehouse_id:
                                                currentUser?.isStaff && warehouses.length > 0
                                                    ? String(warehouses[0].id)
                                                    : '',
                                            id_reservasi: '',
                                            sap_number: '',
                                            request_id: '',
                                        });
                                        setItems([]);
                                        setIsScraped(false);
                                    }}
                                    disabled={loading}
                                >
                                    Batal / Reset
                                </Button>
                            </motion.div>
                            <motion.div
                                whileHover={
                                    loading || hasAnyError || isFetchingMaterials
                                        ? {}
                                        : { scale: 1.02 }
                                }
                                whileTap={
                                    loading || hasAnyError || isFetchingMaterials
                                        ? {}
                                        : { scale: 0.95 }
                                }
                            >
                                <Button
                                    type="submit"
                                    disabled={loading || hasAnyError || isFetchingMaterials}
                                    className="gap-2"
                                >
                                    <Send size={16} />
                                    {loading ? 'Memproses...' : 'Tinjau & Simpan'}
                                </Button>
                            </motion.div>
                        </StaggerItem>
                    </form>

                    <OutSapConfirmModal
                        isOpen={isConfirmModalOpen}
                        onOpenChange={setIsConfirmModalOpen}
                        onConfirm={handleConfirmSubmit}
                        loading={loading}
                        formData={formData}
                        selectedTech={selectedTech}
                        selectedWh={selectedWh}
                        items={items}
                        materials={materials}
                    />
                </Card>
            </StaggerContainer>
        </>
    );
}
