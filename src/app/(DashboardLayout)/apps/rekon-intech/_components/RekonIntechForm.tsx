'use client';

import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type React from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import CardBox from '@/app/components/shared/CardBox';
import { ConfirmDialog } from '@/app/components/shared/ConfirmDialog';
import { SearchableSelect } from '@/app/components/shared/SearchableSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    getTechnicianMaterials,
    getTechniciansWithIntechSaps,
    type RekonItemPayload,
    submitRekonIntech,
} from '../_actions/rekon-actions';

export default function RekonIntechForm() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [selectedNik, setSelectedNik] = useState<string>('');

    // Global fields
    const [globalWoType, setGlobalWoType] = useState<string>('');
    const [globalWoNumber, setGlobalWoNumber] = useState<string>('');
    const [globalNotes, setGlobalNotes] = useState<string>('');

    // State for form rows (only qty now), keyed by sap_out_item_id
    const [rowStates, setRowStates] = useState<Record<string, number | ''>>({});

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
            const initial: Record<number, number | ''> = {};
            mats.forEach((m: any) => {
                initial[m.sap_out_item_id] = '';
            });
            setRowStates(initial);
        } else {
            setRowStates({});
        }
    }, [materialsData?.data]);

    const handleQtyChange = (itemId: number, value: string | number) => {
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
            if (rawQty === '' || rawQty === undefined || rawQty === 0) continue;

            const qty = typeof rawQty === 'string' ? parseInt(rawQty, 10) : rawQty;

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

        const res = await submitRekonIntech(selectedNik, itemsToSubmit);

        if (res.success) {
            toast.success('Rekon Intech berhasil disubmit!');
            setSelectedNik('');
            setGlobalWoType('');
            setGlobalWoNumber('');
            setGlobalNotes('');
            setIsConfirmModalOpen(false);
            router.push('/apps/out-material');
        } else {
            toast.error(res.error || 'Failed to submit Rekon Intech');
        }

        setLoading(false);
    };

    const selectedTechName = techOptions.find((t) => t.value === selectedNik)?.label || '';

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
        >
            <CardBox className="p-6">
                <form onSubmit={handlePreSubmit} className="space-y-8">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 mb-4 border-b pb-2">
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
                                    <Label>WO Type *</Label>
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
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>WO Number *</Label>
                                    <Input
                                        value={globalWoNumber}
                                        onChange={(e) => setGlobalWoNumber(e.target.value)}
                                        className="h-10"
                                        placeholder="WO-123..."
                                        disabled={!selectedNik}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Notes</Label>
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
                    </div>

                    {/* Items Section */}
                    <div className="space-y-4 pt-4 border-t">
                        <h3 className="text-base font-semibold">Material Di Tangan Teknisi</h3>

                        {selectedNik ? (
                            isLoadingMaterials ? (
                                <div className="text-center p-8 border border-dashed rounded-md text-gray-500 bg-gray-50/50">
                                    Loading materials...
                                </div>
                            ) : materials.length === 0 ? (
                                <div className="text-center p-8 border border-dashed rounded-md text-gray-500 bg-gray-50/50">
                                    Tidak ada material (Intech) untuk teknisi ini.
                                </div>
                            ) : (
                                <div className="border rounded-md overflow-x-auto">
                                    <Table className="min-w-[800px]">
                                        <TableHeader className="bg-muted/50">
                                            <TableRow>
                                                <TableHead className="w-[50px] text-center">
                                                    No
                                                </TableHead>
                                                <TableHead className="min-w-[120px]">
                                                    ID Trx (SAP)
                                                </TableHead>
                                                <TableHead className="min-w-[120px]">
                                                    Material Code
                                                </TableHead>
                                                <TableHead className="min-w-[200px]">
                                                    Material Name
                                                </TableHead>
                                                <TableHead className="text-center w-[120px]">
                                                    Qty Intech
                                                </TableHead>
                                                <TableHead className="w-[150px]">
                                                    Qty Used
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            <AnimatePresence>
                                                {materials.map((m: any, index: number) => {
                                                    const rawQty = rowStates[m.sap_out_item_id];
                                                    const qtyValue =
                                                        rawQty === undefined ? '' : rawQty;
                                                    const availableQty =
                                                        m.qty_req - (m.qty_used || 0);

                                                    return (
                                                        <motion.tr
                                                            key={m.sap_out_item_id}
                                                            initial={{ opacity: 0, y: 10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            transition={{
                                                                duration: 0.2,
                                                                delay: index * 0.03,
                                                            }}
                                                            className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                                                        >
                                                            <TableCell className="text-center font-medium">
                                                                {index + 1}
                                                            </TableCell>
                                                            <TableCell className="text-xs">
                                                                {m.id_trx}
                                                            </TableCell>
                                                            <TableCell className="font-semibold">
                                                                {m.material_code}
                                                            </TableCell>
                                                            <TableCell className="text-xs">
                                                                {m.description}
                                                            </TableCell>
                                                            <TableCell className="text-center font-bold text-blue-600">
                                                                {availableQty}
                                                            </TableCell>

                                                            {/* Input Qty */}
                                                            <TableCell>
                                                                <Input
                                                                    type="number"
                                                                    min="0"
                                                                    max={availableQty}
                                                                    value={qtyValue}
                                                                    onChange={(e) => {
                                                                        let val: string | number =
                                                                            e.target.value === ''
                                                                                ? ''
                                                                                : parseInt(
                                                                                      e.target
                                                                                          .value,
                                                                                      10
                                                                                  );

                                                                        if (
                                                                            typeof val ===
                                                                                'number' &&
                                                                            val > availableQty
                                                                        ) {
                                                                            val = availableQty;
                                                                            toast.error(
                                                                                `Maximum quantity is ${availableQty}`
                                                                            );
                                                                        }

                                                                        handleQtyChange(
                                                                            m.sap_out_item_id,
                                                                            val
                                                                        );
                                                                    }}
                                                                    className="h-9 text-center"
                                                                    placeholder="0"
                                                                />
                                                            </TableCell>
                                                        </motion.tr>
                                                    );
                                                })}
                                            </AnimatePresence>
                                        </TableBody>
                                    </Table>
                                </div>
                            )
                        ) : (
                            <div className="text-center p-8 border border-dashed rounded-md text-gray-500 bg-gray-50/50">
                                Silakan pilih teknisi terlebih dahulu.
                            </div>
                        )}
                    </div>

                    <div className="pt-6 border-t flex justify-end gap-3">
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
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={loading || !selectedNik || materials.length === 0}
                            className="gap-2"
                        >
                            <FileText size={16} />
                            Review Rekon
                        </Button>
                    </div>
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
                        <div className="grid grid-cols-2 gap-4 text-sm bg-muted/30 p-4 rounded-md border">
                            <div>
                                <span className="text-gray-500 block mb-1">Teknisi:</span>
                                <span className="font-medium">{selectedTechName}</span>
                            </div>
                            <div>
                                <span className="text-gray-500 block mb-1">WO Type:</span>
                                <span className="font-medium uppercase">{globalWoType}</span>
                            </div>
                            <div>
                                <span className="text-gray-500 block mb-1">WO Number:</span>
                                <span className="font-medium">{globalWoNumber}</span>
                            </div>
                            <div>
                                <span className="text-gray-500 block mb-1">Notes:</span>
                                <span>{globalNotes || '-'}</span>
                            </div>
                        </div>

                        <div>
                            <h4 className="text-sm font-semibold mb-2">Material Terpakai:</h4>
                            <div className="border rounded-md max-h-[300px] overflow-y-auto">
                                <Table>
                                    <TableHeader className="bg-muted/50">
                                        <TableRow>
                                            <TableHead className="w-[40px] text-center">
                                                No
                                            </TableHead>
                                            <TableHead>Material Code</TableHead>
                                            <TableHead>Material Name</TableHead>
                                            <TableHead className="text-center">Qty Used</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {itemsToSubmit.map((item, idx) => {
                                            const mat = materials.find(
                                                (m: any) =>
                                                    m.sap_out_item_id === item.sap_out_item_id
                                            );
                                            return (
                                                <TableRow key={item.sap_out_item_id}>
                                                    <TableCell className="text-center">
                                                        {idx + 1}
                                                    </TableCell>
                                                    <TableCell className="font-medium">
                                                        {mat?.material_code}
                                                    </TableCell>
                                                    <TableCell className="text-xs">
                                                        {mat?.description}
                                                    </TableCell>
                                                    <TableCell className="text-center font-bold text-blue-600">
                                                        {item.qty}
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
    );
}
