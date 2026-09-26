'use client';

import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Send, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import CardBox from '@/app/components/shared/CardBox';
import { ConfirmDialog } from '@/app/components/shared/ConfirmDialog';
import { LoadingOverlay } from '@/app/components/shared/LoadingOverlay';
import { SearchableSelect } from '@/app/components/shared/SearchableSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

    const [items, setItems] = useState<any[]>([]);
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
            const res = await fetch(`/api/scrape-reservation?id=${formData.request_id}`);
            const data = await res.json();

            if (!res.ok) {
                toast.error(data.error || 'Gagal mengambil data Lensa');
                setIsScraping(false);
                return;
            }

            const scrapedListData = data.listData?.data?.[0];
            const scrapedDetail = data.detailContent;

            if (scrapedListData && scrapedDetail) {
                const resIdSap = scrapedListData.reservation_id_sap || '';
                const giNumber = scrapedListData.gi_number || '';
                const nik = (scrapedDetail.headerInfo?.nikPemakai || '').trim();
                const namaGudang = scrapedListData.nama_gudang || '';

                let name_sa = formData.name_sa;
                let nik_teknisi = formData.nik_teknisi;
                let warehouse_id = formData.warehouse_id;

                if (namaGudang) {
                    const matchedWh = warehouses.find((w: any) =>
                        w.name.toLowerCase().includes(namaGudang.toLowerCase())
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

                const mappedItems: any[] = [];

                scrapedDetail.materials?.forEach((scrapedMat: any) => {
                    const code = (scrapedMat['ID MATERIAL'] || '').trim();
                    const qty = parseInt(scrapedMat['QTY ACCEPTED'], 10) || 0;

                    if (code && qty > 0) {
                        const matchedMat = allMaterials.find((m: any) => m.code.trim() === code);
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
                    id_reservasi: resIdSap,
                    sap_number: giNumber,
                    name_sa: name_sa,
                    nik_teknisi: nik_teknisi,
                    warehouse_id: warehouse_id,
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
        } catch (err) {
            toast.error('Terjadi kesalahan jaringan.');
        }
        setIsScraping(false);
    };

    const handleAddItem = () => {
        setItems([...items, { id: crypto.randomUUID(), designator_id: '', qty_req: 1 }]);
    };

    const handleRemoveItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const handleItemChange = (index: number, field: string, value: any) => {
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
            if (!item.designator_id || item.qty_req <= 0) {
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
                designator_id: parseInt(i.designator_id, 10),
                qty_req: parseInt(i.qty_req, 10),
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

    const selectedTech = technicians?.find((t: any) => t.nik === formData.nik_teknisi);
    const selectedWh = warehouses?.find((w: any) => w.id.toString() === formData.warehouse_id);

    const checkItemError = (item: any) => {
        if (isFetchingMaterials) return false;
        if (!item.designator_id) return true;
        const selectedMat = materials.find((m: any) => m.id.toString() === item.designator_id);
        if (!selectedMat) return true;
        if (item.qty_req > selectedMat.qty) return true;
        return false;
    };

    const hasAnyError = items.length === 0 || items.some(checkItemError);

    return (
        <>
            <LoadingOverlay
                isVisible={isScraping || loading}
                text={isScraping ? 'Menarik Data Lensa...' : 'Memproses Transaksi...'}
            />
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
            >
                <CardBox className="p-6">
                    <form onSubmit={handleSubmit} className="space-y-8">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900 mb-4 border-b pb-2">
                                Form Out SAP (Pengeluaran Material)
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
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
                                                className="whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white w-full h-full"
                                            >
                                                {isScraping ? 'Loading...' : 'Get Data'}
                                            </Button>
                                        </motion.div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Technician *</Label>
                                    <SearchableSelect
                                        options={technicians.map((t: any) => ({
                                            value: String(t.nik),
                                            label: `${t.name} (${t.nik})`,
                                        }))}
                                        value={String(formData.nik_teknisi)}
                                        onValueChange={handleSelectTechnician}
                                        placeholder={
                                            isScraped && formData.nik_teknisi
                                                ? 'Technician loaded'
                                                : 'Select Technician'
                                        }
                                        disabled={!formData.name_sa || isScraped}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Area (SA)</Label>
                                    <SearchableSelect
                                        options={branches.map((b: any) => ({
                                            value: b.service_area,
                                            label: b.service_area,
                                        }))}
                                        value={formData.name_sa}
                                        onValueChange={(v) => {
                                            setFormData({
                                                ...formData,
                                                name_sa: v,
                                                nik_teknisi: '',
                                            });
                                        }}
                                        placeholder="Select Area"
                                        disabled={!formData.request_id || isScraped}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>From Warehouse *</Label>
                                    <SearchableSelect
                                        options={warehouses.map((w: any) => ({
                                            value: w.id.toString(),
                                            label: w.name,
                                        }))}
                                        value={formData.warehouse_id}
                                        onValueChange={(v) =>
                                            setFormData({ ...formData, warehouse_id: v })
                                        }
                                        placeholder="Select Warehouse"
                                        disabled={!formData.nik_teknisi || isScraped}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Reservasi ID *</Label>
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
                                </div>

                                <div className="space-y-2">
                                    <Label>SAP Number *</Label>
                                    <Input
                                        value={formData.sap_number}
                                        onChange={(e) =>
                                            setFormData({ ...formData, sap_number: e.target.value })
                                        }
                                        disabled={!formData.warehouse_id || isScraped}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Items Section */}
                        <div className="space-y-4 pt-4 border-t">
                            <div className="flex items-center justify-between">
                                <h3 className="text-base font-semibold">Material Items</h3>
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
                                        <Plus size={16} /> Add Item
                                    </Button>
                                </motion.div>
                            </div>

                            {items.length === 0 ? (
                                <div className="text-center p-8 border border-dashed rounded-md text-gray-500 bg-gray-50/50">
                                    No items added. Click Add Item to start adding materials.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <AnimatePresence>
                                        {items.map((item, index) => {
                                            const isError = checkItemError(item);
                                            const selectedMat = materials.find(
                                                (m: any) => m.id.toString() === item.designator_id
                                            );
                                            const errorReason = item.designator_id
                                                ? selectedMat
                                                    ? item.qty_req > selectedMat.qty
                                                        ? `Insufficient stock (Available: ${selectedMat.qty})`
                                                        : ''
                                                    : 'Material not found in warehouse or zero stock'
                                                : 'Material not selected';

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
                                                            ? 'bg-red-50 border-red-300'
                                                            : 'bg-gray-50/50'
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
                                                                            className="text-red-500 font-medium whitespace-nowrap overflow-hidden"
                                                                        >
                                                                            ({errorReason})
                                                                        </motion.span>
                                                                    )}
                                                            </AnimatePresence>
                                                        </Label>
                                                        <SearchableSelect
                                                            options={materials.map((m: any) => ({
                                                                value: m.id.toString(),
                                                                label: `${m.code} - ${m.description} (Stock: ${m.qty})`,
                                                            }))}
                                                            value={item.designator_id}
                                                            onValueChange={(v) =>
                                                                handleItemChange(
                                                                    index,
                                                                    'designator_id',
                                                                    v
                                                                )
                                                            }
                                                            placeholder={
                                                                isScraped && item.designator_id
                                                                    ? 'Material loaded'
                                                                    : 'Select Material'
                                                            }
                                                            disabled={isScraped}
                                                        />
                                                    </div>

                                                    <div className="w-full sm:w-32 space-y-2">
                                                        <Label className="text-xs">Qty *</Label>
                                                        <Input
                                                            type="number"
                                                            min="1"
                                                            placeholder="0"
                                                            disabled={isScraped}
                                                            value={
                                                                item.qty_req === 0 ||
                                                                item.qty_req === ''
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
                                                                    val > selectedMat.qty
                                                                ) {
                                                                    val = selectedMat.qty;
                                                                    toast.error(
                                                                        `Maximum quantity is ${selectedMat.qty}`
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
                                                                    ? 'border-red-300 focus-visible:ring-red-300 bg-red-50/50'
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
                                                        className="text-red-500 hover:text-red-700 hover:bg-red-50 mt-2 sm:mt-0"
                                                    >
                                                        <Trash2 size={16} />
                                                    </Button>
                                                </motion.div>
                                            );
                                        })}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>

                        <div className="pt-6 border-t flex justify-end gap-3">
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
                                    Cancel / Reset
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
                                    {loading ? 'Processing...' : 'Review & Submit'}
                                </Button>
                            </motion.div>
                        </div>
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
                                    <span className="text-gray-500 block mb-1">Teknisi:</span>
                                    <span className="font-medium">
                                        {selectedTech?.name} ({selectedTech?.nik})
                                    </span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block mb-1">Service Area:</span>
                                    <span className="font-medium">{formData.name_sa || '-'}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block mb-1">Gudang Asal:</span>
                                    <span className="font-medium">{selectedWh?.name || '-'}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block mb-1">No. SAP:</span>
                                    <span className="font-medium">
                                        {formData.sap_number || '-'}
                                    </span>
                                </div>
                                {formData.id_reservasi && (
                                    <div>
                                        <span className="text-gray-500 block mb-1">
                                            ID Reservasi:
                                        </span>
                                        <span className="font-medium">{formData.id_reservasi}</span>
                                    </div>
                                )}
                                {formData.request_id && (
                                    <div>
                                        <span className="text-gray-500 block mb-1">
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
                                                <TableHead className="text-center">Qty</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {items.map((item, idx) => {
                                                const mat = materials?.find(
                                                    (m: any) =>
                                                        m.id.toString() === item.designator_id
                                                );
                                                return (
                                                    <TableRow key={idx}>
                                                        <TableCell className="text-center">
                                                            {idx + 1}
                                                        </TableCell>
                                                        <TableCell className="text-sm">
                                                            {mat?.code} - {mat?.description}
                                                        </TableCell>
                                                        <TableCell className="text-center font-bold text-blue-600">
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
                </CardBox>
            </motion.div>
        </>
    );
}
