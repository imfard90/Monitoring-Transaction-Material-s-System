'use client';

import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getInOutTagItems } from '../_actions/tag-actions';

interface InOutTagDetailModalProps {
    row: any | null;
    isOpen: boolean;
    onClose: () => void;
}

export default function InOutTagDetailModal({ row, isOpen, onClose }: InOutTagDetailModalProps) {
    const headerId = row?.id || null;
    const status = row?.end_status || '';

    const { data, isLoading } = useQuery({
        queryKey: ['inoutTagItems', headerId],
        queryFn: async () => {
            if (headerId === null) return { success: false, data: [] };
            const res = await getInOutTagItems(headerId);
            if (!res.success) throw new Error('Failed to fetch items');
            return res;
        },
        enabled: headerId !== null,
    });

    let items = data?.data || [];

    // Filter items based on the current status of the header
    if (status === 'requested') {
        items = items.filter((item: any) => item.action === 'request');
    } else if (status === 'in_transit') {
        items = items.filter((item: any) => item.action === 'send');
    } else if (status === 'closed') {
        items = items.filter((item: any) => item.action === 'accept');
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Tag Items Detail (ID Trx: {row?.id_trx})</DialogTitle>
                </DialogHeader>

                <div className="py-4">
                    {isLoading ? (
                        <p className="text-center text-gray-500 py-4">Loading items...</p>
                    ) : items.length === 0 ? (
                        <p className="text-center text-gray-500 py-4">
                            No items found for this tag status.
                        </p>
                    ) : (
                        <div className="rounded-md border overflow-x-auto">
                            <table className="w-full text-sm text-left text-gray-500">
                                <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                                    <tr>
                                        <th className="px-4 py-3">No</th>
                                        <th className="px-4 py-3">Designator / Code</th>
                                        <th className="px-4 py-3">Description</th>
                                        <th className="px-4 py-3 text-right">Qty</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((item: any, idx: number) => (
                                        <tr
                                            key={item.id}
                                            className="bg-white border-b hover:bg-gray-50"
                                        >
                                            <td className="px-4 py-3">{idx + 1}</td>
                                            <td className="px-4 py-3 font-medium">
                                                {item.designator_code || '-'}
                                            </td>
                                            <td className="px-4 py-3">
                                                {item.material_description || '-'}
                                            </td>
                                            <td className="px-4 py-3 text-right font-medium">
                                                {item.qty}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
