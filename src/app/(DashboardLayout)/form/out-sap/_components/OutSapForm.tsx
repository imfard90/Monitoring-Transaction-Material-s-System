'use client';

import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Send, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/app/components/shared/ConfirmDialog';
import { LoadingOverlay } from '@/app/components/shared/LoadingOverlay';
import { SearchableSelect } from '@/app/components/shared/SearchableSelect';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import type { OutSapFormItem } from '@/lib/types/inventory';
import { scrapeReservationAction } from '../../../apps/out-lensa-ref/_actions/out-lensa-actions';
import {
    createOutSap,
    getBranches,
    getMaterials,
    getMaterialsInWarehouse,
    getTechnicianByNik,
    getTechnicians,
    getWarehouses,
} from '../_actions/out-sap-actions';

export default function OutSapForm() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [isScraping, setIsScraping] = useState(false);
    const [isScraped, setIsScraped] = useState(false);
    const [formData, setFormData] = useState({
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

            // Using type casting since we know it succeeded
            const successData = data as Record<string, unknown>;
            const scrapedListData = (successData.listData as Record<string, unknown[]>)
                ?.data?.[0] as Record<string, unknown>;
            const scrapedDetail = successData.detailContent as Record<string, unknown>;

            if (scrapedListData && scrapedDetail) {
                const resIdSap = (scrapedListData.reservation_id_sap as string) || '';
                const giNumber = (scrapedListData.gi_number as string) || '';
                const headerInfo = scrapedDetail.headerInfo as Record<string, string> | undefined;
                const nik = (headerInfo?.nikPemakai || '').trim();
                const namaGudang = (scrapedListData.nama_gudang as string) || '';

                let name_sa = formData.name_sa;
                let nik_teknisi = formData.nik_teknisi;
                let warehouse_id = formData.warehouse_id;

                if (namaGudang) {
                    const matchedWh = warehouses.find((w: Record<string, unknown>) =>
                        (w.name as string).toLowerCase().includes(namaGudang.toLowerCase())
                    );
                    if (matchedWh) {
                        warehouse_id = matchedWh.id.toString();
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

                // Get all materials for mapping
                const materialsRes = await getMaterials();
                const allMaterials = materialsRes.success ? materialsRes.data : [];

                const mappedItems: OutSapFormItem[] = [];

                const materials = scrapedDetail.materials as Record<string, string>[];
                materials?.forEach((scrapedMat: Record<string, string>) => {
                    const code = (scrapedMat['ID MATERIAL'] || '').trim();
                    const qty = parseInt(scrapedMat['QTY ACCEPTED'], 10) || 0;

                    if (code && qty > 0) {
                        const matchedMat = allMaterials.find(
                            (m: Record<string, unknown>) => (m.code as string).trim() === code
                        );
                        if (matchedMat) {
                            mappedItems.push({
                                id: crypto.randomUUID(),
                                designator_id: matchedMat.id.toString(),
                                qty_req: qty,
                            });
                        }
                    }
                });

                setFormData((prev) => ({
                    ...prev,
                    id_reservasi: resIdSap as string,
                    sap_number: giNumber as string,
                    name_sa: name_sa as string,
                    nik_teknisi: nik_teknisi as string,
                    warehouse_id: warehouse_id as string,
                }));

                if (mappedItems.length > 0) {
                    setItems(mappedItems);
                    setIsScraped(true);

                    if (hasError) {
                        toast.error(
                            `${errorMessage} Material berhasil dimuat, tetapi Anda tidak bisa lanjut. Silakan daftarkan NIK tersebut ke Master Data Teknisi lalu ulangi!`,
                            {
                                duration: 10000,
                            }
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

    const handleAddItem = () => {
        setItems([...items, { id: crypto.randomUUID(), designator_id: '', qty_req: '' }]);
    };

    const handleRemoveItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const handleItemChange = (index: number, field: string, value: string | number | null) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        setItems(newItems);
    };

    const handleSelectTechnician = (nik: string) => {
        setFormData({
            ...formData,
            nik_teknisi: nik,
        });
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
            // Reset form
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
            router.push('/apps/out-material'); // redirect to list table that already exists
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
                <Card className="card border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md p-4 motion-reduce:transition-none p-6">
                    <form onSubmit={handleSubmit} className="space-y-8">
                        <div>
                            <h2 className="text-lg font-bold text-foreground mb-4 border-b pb-2">
                                Form Out SAP (Pengeluaran Material)
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <StaggerItem className="space-y-2">
                                    <Label>Request ID</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            value={formData.request_id}
                                            onChange={(e) =>
                                                setFormData({
                                                    ...formData,
                                                    request_id: e.target.value,
                                                })
                                            }
                                            placeholder="Masukkan Request ID Lensa..."
                                            className="flex-1"
                                            disabled={isScraped}
                                        />
                                        <motion.div
                                            whileHover={
                                                isScraping || !formData.request_id || isScraped
                                                    ? {}
                                                    : { scale: 1.02 }
                                            }
                                            whileTap={
                                                isScraping || !formData.request_id || isScraped
                                                    ? {}
                                                    : { scale: 0.95 }
                                            }
                                        >
                                            <Button
                                                type="button"
                                                onClick={handleGetData}
                                                disabled={
                                                    isScraping || !formData.request_id || isScraped
                                                }
                                                className="whitespace-nowrap w-full h-full"
                                            >
                                                {isScraping ? 'Memuat data...' : 'Ambil Data'}
                                            </Button>
                                        </motion.div>
                                    </div>
                                </StaggerItem>

                                <StaggerItem className="space-y-2">
                                    <Label>Teknisi *</Label>
                                    <SearchableSelect
                                        options={technicians.map((t: Record<string, unknown>) => ({
                                            value: String(t.nik),
                                            label: `${t.name} (${t.nik})`,
                                        }))}
                                        value={String(formData.nik_teknisi)}
                                        onValueChange={handleSelectTechnician}
                                        placeholder={
                                            isScraped && formData.nik_teknisi
                                                ? 'Teknisi terpilih'
                                                : 'Pilih Teknisi'
                                        }
                                        disabled={!formData.name_sa || isScraped}
                                    />
                                </StaggerItem>

                                <StaggerItem className="space-y-2">
                                    <Label>Area (SA)</Label>
                                    <SearchableSelect
                                        options={branches.map((b: Record<string, unknown>) => ({
                                            value: b.service_area as string,
                                            label: b.service_area as string,
                                        }))}
                                        value={formData.name_sa}
                                        onValueChange={(v) => {
                                            setFormData({
                                                ...formData,
                                                name_sa: v,
                                                nik_teknisi: '',
                                            });
                                        }}
                                        placeholder="Pilih Area"
                                        disabled={!formData.request_id || isScraped}
                                    />
                                </StaggerItem>

                                <StaggerItem className="space-y-2">
                                    <Label>Dari Gudang *</Label>
                                    <SearchableSelect
                                        options={warehouses.map((w: Record<string, unknown>) => ({
                                            value: w.id?.toString() || '',
                                            label: w.name as string,
                                        }))}
                                        value={formData.warehouse_id}
                                        onValueChange={(v) =>
                                            setFormData({ ...formData, warehouse_id: v })
                                        }
                                        placeholder="Pilih Gudang"
                                        disabled={!formData.nik_teknisi || isScraped}
                                    />
                                </StaggerItem>

                                <StaggerItem className="space-y-2">
                                    <Label>ID Reservasi *</Label>
                                    <Input
                                        value={formData.id_reservasi}
                                        onChange={(e) =>
                                            setFormData({
                                                ...formData,
                                                id_reservasi: e.target.value,
                                            })
                                        }
                                        disabled={!formData.warehouse_id || isScraped}
                                    />
                                </StaggerItem>

                                <StaggerItem className="space-y-2">
                                    <Label>Nomor SAP *</Label>
                                    <Input
                                        value={formData.sap_number}
                                        onChange={(e) =>
                                            setFormData({ ...formData, sap_number: e.target.value })
                                        }
                                        disabled={!formData.warehouse_id || isScraped}
                                    />
                                </StaggerItem>
                            </div>
                        </div>

                        {/* Items Section */}
                        <StaggerItem className="space-y-4 pt-4 border-t">
                            <div className="flex items-center justify-between">
                                <h3 className="text-base font-semibold">Daftar Material</h3>
                                <motion.div
                                    whileHover={
                                        !formData.warehouse_id ||
                                        !formData.id_reservasi.trim() ||
                                        !formData.sap_number.trim() ||
                                        isScraped
                                            ? {}
                                            : { scale: 1.02 }
                                    }
                                    whileTap={
                                        !formData.warehouse_id ||
                                        !formData.id_reservasi.trim() ||
                                        !formData.sap_number.trim() ||
                                        isScraped
                                            ? {}
                                            : { scale: 0.95 }
                                    }
                                >
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleAddItem}
                                        className="gap-2"
                                        disabled={
                                            !formData.warehouse_id ||
                                            !formData.id_reservasi.trim() ||
                                            !formData.sap_number.trim() ||
                                            isScraped
                                        }
                                    >
                                        <Plus size={16} /> Tambah Material
                                    </Button>
                                </motion.div>
                            </div>

                            {items.length === 0 ? (
                                <div
                                    className="text-center p-8 border border-dashed rounded-md text-muted-foreground bg-muted/50"
                                    role="status"
                                >
                                    Belum ada material yang ditambahkan. Klik Tambah Material untuk
                                    memilih material.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <AnimatePresence>
                                        {items.map((item, index) => {
                                            const isError = checkItemError(item);
                                            const selectedMat = materials.find(
                                                (m: Record<string, unknown>) =>
                                                    m.id?.toString() === item.designator_id
                                            );
                                            const errorReason = item.designator_id
                                                ? selectedMat
                                                    ? Number(item.qty_req) > Number(selectedMat.qty)
                                                        ? `Stok tidak mencukupi (Tersedia: ${selectedMat.qty})`
                                                        : ''
                                                    : 'Material tidak ditemukan di gudang atau stok habis'
                                                : 'Material belum dipilih';

                                            return (
                                                <motion.div
                                                    key={item.id || index}
                                                    initial={{
                                                        opacity: 0,
                                                        height: 0,
                                                        scale: 0.95,
                                                        overflow: 'hidden',
                                                    }}
                                                    animate={{
                                                        opacity: 1,
                                                        height: 'auto',
                                                        scale: 1,
                                                        overflow: 'visible',
                                                    }}
                                                    exit={{
                                                        opacity: 0,
                                                        height: 0,
                                                        scale: 0.9,
                                                        overflow: 'hidden',
                                                        margin: 0,
                                                        padding: 0,
                                                    }}
                                                    transition={{ duration: 0.3 }}
                                                    className={`flex flex-col sm:flex-row sm:items-end gap-3 p-4 border rounded-md transition-colors ${
                                                        isError && !isFetchingMaterials
                                                            ? 'bg-error/10 border-error/50'
                                                            : 'bg-muted/50'
                                                    }`}
                                                >
                                                    <div className="flex-1 space-y-2">
                                                        <Label className="text-xs flex gap-2">
                                                            Material *
                                                            <AnimatePresence>
                                                                {isError &&
                                                                    !isFetchingMaterials && (
                                                                        <motion.span
                                                                            initial={{
                                                                                opacity: 0,
                                                                                width: 0,
                                                                            }}
                                                                            animate={{
                                                                                opacity: 1,
                                                                                width: 'auto',
                                                                            }}
                                                                            exit={{
                                                                                opacity: 0,
                                                                                width: 0,
                                                                            }}
                                                                            className="text-destructive font-medium whitespace-nowrap overflow-hidden"
                                                                        >
                                                                            ({errorReason})
                                                                        </motion.span>
                                                                    )}
                                                            </AnimatePresence>
                                                        </Label>
                                                        <SearchableSelect
                                                            options={materials.map(
                                                                (m: Record<string, unknown>) => ({
                                                                    value: m.id?.toString() || '',
                                                                    label: `${m.code} - ${m.description} (Stock: ${m.qty})`,
                                                                })
                                                            )}
                                                            value={item.designator_id.toString()}
                                                            onValueChange={(v) =>
                                                                handleItemChange(
                                                                    index,
                                                                    'designator_id',
                                                                    v
                                                                )
                                                            }
                                                            placeholder={
                                                                isScraped && item.designator_id
                                                                    ? 'Material terpilih'
                                                                    : 'Pilih Material'
                                                            }
                                                            disabled={isScraped}
                                                        />
                                                    </div>

                                                    <div className="w-full sm:w-32 space-y-2">
                                                        <Label className="text-xs">Jumlah *</Label>
                                                        <Input
                                                            type="number"
                                                            min="1"
                                                            placeholder="0"
                                                            disabled={isScraped}
                                                            value={
                                                                item.qty_req === 0 ||
                                                                item.qty_req.toString() === ''
                                                                    ? ''
                                                                    : item.qty_req
                                                            }
                                                            onChange={(e) => {
                                                                let val: string | number =
                                                                    e.target.value === ''
                                                                        ? ''
                                                                        : parseInt(
                                                                              e.target.value,
                                                                              10
                                                                          );

                                                                if (
                                                                    typeof val === 'number' &&
                                                                    selectedMat &&
                                                                    val >
                                                                        (selectedMat.qty as number)
                                                                ) {
                                                                    val = selectedMat.qty as number;
                                                                    toast.error(
                                                                        `Jumlah maksimal adalah ${selectedMat.qty}`
                                                                    );
                                                                }

                                                                handleItemChange(
                                                                    index,
                                                                    'qty_req',
                                                                    val
                                                                );
                                                            }}
                                                            className={
                                                                isError && !isFetchingMaterials
                                                                    ? 'border-error/50 focus-visible:ring-error/30 bg-error/10'
                                                                    : ''
                                                            }
                                                        />
                                                    </div>

                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleRemoveItem(index)}
                                                        disabled={isScraped}
                                                        className="text-destructive hover:text-destructive hover:bg-destructive/10 mt-2 sm:mt-0"
                                                    >
                                                        <Trash2 size={16} />
                                                    </Button>
                                                </motion.div>
                                            );
                                        })}
                                    </AnimatePresence>
                                </div>
                            )}
                        </StaggerItem>

                        <StaggerItem className="pt-6 border-t flex justify-end gap-3">
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

                    <ConfirmDialog
                        isOpen={isConfirmModalOpen}
                        onOpenChange={setIsConfirmModalOpen}
                        title="Konfirmasi SAP Out"
                        description="Pastikan material dan teknisi sudah benar. Transaksi ini akan langsung memotong stok gudang."
                        onConfirm={handleConfirmSubmit}
                        loading={loading}
                    >
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-muted/30 p-4 rounded-md border">
                                <div>
                                    <span className="text-muted-foreground block mb-1">
                                        Teknisi:
                                    </span>
                                    <span className="font-medium">
                                        {selectedTech?.name} ({selectedTech?.nik})
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block mb-1">
                                        Area Layanan:
                                    </span>
                                    <span className="font-medium">{formData.name_sa || '-'}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block mb-1">
                                        Gudang Asal:
                                    </span>
                                    <span className="font-medium">{selectedWh?.name || '-'}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block mb-1">
                                        Nomor SAP:
                                    </span>
                                    <span className="font-medium">
                                        {formData.sap_number || '-'}
                                    </span>
                                </div>
                                {formData.id_reservasi && (
                                    <div>
                                        <span className="text-muted-foreground block mb-1">
                                            ID Reservasi:
                                        </span>
                                        <span className="font-medium">{formData.id_reservasi}</span>
                                    </div>
                                )}
                                {formData.request_id && (
                                    <div>
                                        <span className="text-muted-foreground block mb-1">
                                            Request ID:
                                        </span>
                                        <span className="font-medium">{formData.request_id}</span>
                                    </div>
                                )}
                            </div>

                            <div>
                                <h4 className="text-sm font-semibold mb-2">Daftar Material:</h4>
                                <div className="border rounded-md max-h-[300px] overflow-y-auto">
                                    <Table>
                                        <TableHeader className="bg-muted/50">
                                            <TableRow>
                                                <TableHead className="w-[40px] text-center">
                                                    No
                                                </TableHead>
                                                <TableHead>Material</TableHead>
                                                <TableHead className="text-center">
                                                    Jumlah
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {items.map((item, idx) => {
                                                const mat = materials?.find(
                                                    (m: Record<string, unknown>) =>
                                                        m.id?.toString() === item.designator_id
                                                );
                                                return (
                                                    <TableRow key={item.id || idx}>
                                                        <TableCell className="text-center">
                                                            {idx + 1}
                                                        </TableCell>
                                                        <TableCell className="text-sm">
                                                            {mat?.code as string} -{' '}
                                                            {mat?.description as string}
                                                        </TableCell>
                                                        <TableCell className="text-center font-bold text-primary">
                                                            {item.qty_req}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </div>
                    </ConfirmDialog>
                </Card>
            </StaggerContainer>
        </>
    );
}
