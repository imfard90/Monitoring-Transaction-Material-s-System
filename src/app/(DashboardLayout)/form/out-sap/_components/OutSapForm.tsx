'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { LoadingOverlay } from '@/app/components/shared/LoadingOverlay';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { generateIdempotencyKey, setIdempotencyKey } from '@/lib/security/idempotency-client';
import type { OutSapFormItem } from '@/lib/types/inventory';
import { scrapeReservationAction } from '../../../reference/out-lensa-ref/_actions/out-lensa-actions';
import {
    createOutSap,
    getBranches,
    getMaterials,
    getMaterialsInWarehouse,
    getTechnicianByNik,
    getTechnicians,
    getWarehouses,
} from '../_actions/out-sap-actions';
import { OutSapConfirmModal } from './OutSapConfirmModal';
import { type OutSapFormData, OutSapHeaderFields } from './OutSapHeaderFields';
import { OutSapMaterialList } from './OutSapMaterialList';

export default function OutSapForm() {
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
        queryKey: ['technicians', formData.name_sa],
        queryFn: () => getTechnicians(formData.name_sa),
        enabled: !!formData.name_sa,
    });

    const { data: whData } = useQuery({
        queryKey: ['warehouses'],
        queryFn: getWarehouses,
    });

    const { data: matData, isFetching: isFetchingMaterials } = useQuery({
        queryKey: ['materials', formData.warehouse_id],
        queryFn: () => getMaterialsInWarehouse(parseInt(formData.warehouse_id, 10)),
        enabled: !!formData.warehouse_id,
    });

    const { data: branchData } = useQuery({
        queryKey: ['branches'],
        queryFn: getBranches,
    });

    const technicians = techData?.data || [];
    const warehouses = whData?.data || [];
    const materials = matData?.data || [];
    const branches = branchData?.data || [];

    const handleGetData = async () => {
        if (!formData.request_id) {
            toast.error('Masukkan Request ID terlebih dahulu');
            return;
        }
        setIsScraping(true);
        try {
            const data = await scrapeReservationAction(formData.request_id);

            if ('error' in data && data.error) {
                toast.error(data.error || 'Gagal mengambil data Lensa');
                setIsScraping(false);
                return;
            }

            const successData = data as Record<string, unknown>;
            const scrapedListData = (successData.listData as Record<string, unknown[]>)
                ?.data?.[0] as Record<string, unknown>;
            const scrapedDetail = successData.detailContent as Record<string, unknown>;

            if (scrapedListData && scrapedDetail) {
                const resIdSap = (scrapedListData.reservation_id_sap as string) || '';
                const giNumber = (scrapedListData.gi_number as string) || '';
                const headerInfo = scrapedDetail.headerInfo as Record<string, string> | undefined;
                const nik = (headerInfo?.nikPemakai || '').replace(/[\s\u00A0]+/g, '');
                const namaGudang = (scrapedListData.nama_gudang as string) || '';

                let name_sa = formData.name_sa;
                let nik_teknisi = formData.nik_teknisi;
                let warehouse_id = formData.warehouse_id;

                if (namaGudang) {
                    const matchedWh = warehouses.find((w: Record<string, unknown>) =>
                        (w.name as string).toLowerCase().includes(namaGudang.toLowerCase())
                    );
                    if (matchedWh) {
                        warehouse_id = String(matchedWh.id);
                    }
                }

                let hasError = false;
                let errorMessage = '';

                if (nik) {
                    const techRes = await getTechnicianByNik(nik);
                    if (techRes.success && techRes.data) {
                        name_sa = techRes.data.sa || '';
                        nik_teknisi = techRes.data.nik || '';
                    } else {
                        hasError = true;
                        errorMessage = `Teknisi (NIK: ${nik}) tidak ditemukan di database MTMS. `;
                    }
                }

                const materialsRes = await getMaterials();
                const allMaterials = materialsRes.success ? materialsRes.data : [];

                const mappedItems: OutSapFormItem[] = [];
                const scrapedMaterials = scrapedDetail.materials as Record<string, string>[];
                scrapedMaterials?.forEach((scrapedMat: Record<string, string>) => {
                    const code = (scrapedMat['ID MATERIAL'] || '').trim();
                    const qty = parseInt(scrapedMat['QTY ACCEPTED'], 10) || 0;

                    if (code && qty > 0) {
                        const matchedMat = allMaterials?.find(
                            (m: Record<string, unknown>) => (m.code as string).trim() === code
                        );
                        if (matchedMat) {
                            mappedItems.push({
                                id: crypto.randomUUID(),
                                designator_id: String(matchedMat.id),
                                qty_req: qty,
                            });
                        }
                    }
                });

                setFormData((prev) => ({
                    ...prev,
                    id_reservasi: resIdSap,
                    sap_number: giNumber,
                    name_sa,
                    nik_teknisi,
                    warehouse_id,
                }));

                if (mappedItems.length > 0) {
                    setItems(mappedItems);
                    setIsScraped(true);

                    if (hasError) {
                        toast.error(
                            `${errorMessage} Material berhasil dimuat, tetapi Anda tidak bisa lanjut. Silakan daftarkan NIK tersebut ke Master Data Teknisi lalu ulangi!`,
                            { duration: 10000 }
                        );
                    } else {
                        toast.success('Data Lensa berhasil dimuat dan material di-map.');
                    }
                } else {
                    toast.warning(
                        hasError
                            ? `${errorMessage} Dan juga tidak ada material yang cocok.`
                            : 'Data Lensa dimuat tapi tidak ada material yang cocok dengan database.'
                    );
                }
            } else {
                toast.error('Data Lensa tidak lengkap.');
            }
        } catch (_err) {
            toast.error('Terjadi kesalahan jaringan.');
        }
        setIsScraping(false);
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
            toast.error('Please fill all required fields and add at least one material.');
            return;
        }

        for (const item of items) {
            if (
                !item.designator_id ||
                item.qty_req === '' ||
                !Number.isFinite(Number(item.qty_req)) ||
                Number(item.qty_req) <= 0
            ) {
                toast.error('Invalid item data. Please select material and valid quantity.');
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
            toast.success('Out SAP created and status set to Intech. Stock reduced successfully!');
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['materials'] }),
                queryClient.invalidateQueries({ queryKey: ['technicians-intech'] }),
                queryClient.invalidateQueries({ queryKey: ['dashboardStockIntech'] }),
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
            toast.error(res.error || 'Failed to create Out SAP');
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
                                            warehouse_id: '',
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
