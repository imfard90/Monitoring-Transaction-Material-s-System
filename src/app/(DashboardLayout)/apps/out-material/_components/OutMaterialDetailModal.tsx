import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getOutMaterialItems } from '../_actions/out-material-actions';

interface OutMaterialDetailModalProps {
    row: any;
    isOpen: boolean;
    onClose: () => void;
}

export default function OutMaterialDetailModal({
    row,
    isOpen,
    onClose,
}: OutMaterialDetailModalProps) {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && row) {
            setLoading(true);
            getOutMaterialItems(row.id).then((res) => {
                if (res.success) setItems(res.data || []);
                setLoading(false);
            });
        } else {
            setItems([]);
        }
    }, [isOpen, row]);

    if (!row) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Out Material Detail</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-2 gap-4 mt-4 bg-gray-50 p-4 rounded-md text-sm">
                    <div>
                        <p className="text-gray-500 mb-1">NIK Teknisi</p>
                        <p className="font-medium">{row.nik_teknisi || '-'}</p>
                    </div>
                    <div>
                        <p className="text-gray-500 mb-1">Nama Teknisi</p>
                        <p className="font-medium">{row.nama_teknisi || '-'}</p>
                    </div>
                    <div>
                        <p className="text-gray-500 mb-1">ID Reservasi</p>
                        <p className="font-medium">{row.id_reservasi || '-'}</p>
                    </div>
                    <div>
                        <p className="text-gray-500 mb-1">SAP Number</p>
                        <p className="font-medium">{row.sap_number || '-'}</p>
                    </div>
                </div>

                <div className="mt-6">
                    <h4 className="font-semibold mb-3">List Material</h4>
                    <div className="rounded-md border overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-700">
                                <tr>
                                    <th className="px-4 py-3 border-b font-medium">No</th>
                                    <th className="px-4 py-3 border-b font-medium">Designator</th>
                                    <th className="px-4 py-3 border-b font-medium">Qty Req</th>
                                    <th className="px-4 py-3 border-b font-medium">Qty Used</th>
                                    <th className="px-4 py-3 border-b font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} className="text-center py-4 text-gray-500">
                                            Loading...
                                        </td>
                                    </tr>
                                ) : items.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="text-center py-4 text-gray-500">
                                            No items found
                                        </td>
                                    </tr>
                                ) : (
                                    items.map((item, index) => {
                                        // status logic: close if qty_req == qty_used else intech
                                        const qtyReq = Number(item.qty_req) || 0;
                                        const qtyUsed = Number(item.qty_used) || 0;
                                        const status = qtyReq === qtyUsed ? 'close' : 'intech';

                                        return (
                                            <tr
                                                key={item.id}
                                                className="border-b last:border-b-0 hover:bg-gray-50/50"
                                            >
                                                <td className="px-4 py-3">{index + 1}</td>
                                                <td className="px-4 py-3">
                                                    {item.designator_code || '-'} -{' '}
                                                    {item.material_description}
                                                </td>
                                                <td className="px-4 py-3">{qtyReq}</td>
                                                <td className="px-4 py-3">{qtyUsed}</td>
                                                <td className="px-4 py-3">
                                                    <Badge
                                                        variant={
                                                            status === 'close'
                                                                ? 'default'
                                                                : 'secondary'
                                                        }
                                                        className={
                                                            status === 'close'
                                                                ? 'bg-green-500/10 text-green-700 hover:bg-green-500/20'
                                                                : 'bg-purple-500/10 text-purple-700 hover:bg-purple-500/20'
                                                        }
                                                    >
                                                        {status === 'close' ? 'Close' : 'Intech'}
                                                    </Badge>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
