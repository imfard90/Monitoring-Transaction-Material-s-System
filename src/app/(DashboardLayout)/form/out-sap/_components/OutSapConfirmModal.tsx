'use client';

import { ConfirmDialog } from '@/app/components/shared/ConfirmDialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import type { OutSapFormItem } from '@/lib/types/inventory';
import type { OutSapFormData } from './OutSapHeaderFields';

interface OutSapConfirmModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    loading: boolean;
    formData: OutSapFormData;
    selectedTech?: Record<string, unknown>;
    selectedWh?: Record<string, unknown>;
    items: OutSapFormItem[];
    materials: Record<string, unknown>[];
}

export function OutSapConfirmModal({
    isOpen,
    onOpenChange,
    onConfirm,
    loading,
    formData,
    selectedTech,
    selectedWh,
    items,
    materials,
}: OutSapConfirmModalProps) {
    return (
        <ConfirmDialog
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            title="Konfirmasi SAP Out"
            description="Pastikan material dan teknisi sudah benar. Transaksi ini akan langsung memotong stok gudang."
            onConfirm={onConfirm}
            loading={loading}
        >
            <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-muted/30 p-4 rounded-md border">
                    <div>
                        <span className="text-muted-foreground block mb-1">
                            Teknisi:
                        </span>
                        <span className="font-medium">
                            {String(selectedTech?.name ?? '')} ({String(selectedTech?.nik ?? '')})
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
                        <span className="font-medium">{String(selectedWh?.name ?? '-')}</span>
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
                                                {String(mat?.code ?? '')} -{' '}
                                                {String(mat?.description ?? '')}
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
    );
}
