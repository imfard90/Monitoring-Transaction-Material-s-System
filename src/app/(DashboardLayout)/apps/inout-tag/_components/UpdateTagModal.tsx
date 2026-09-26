'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { generateIdempotencyKey, setIdempotencyKey } from '@/lib/security/idempotency-client';
import { acceptReturnTag, cancelTag, updateTag } from '../_actions/tag-actions';

interface UpdateTagModalProps {
    isOpen: boolean;
    onClose: () => void;
    row: any;
    items: any[];
}

interface MaterialItem {
    id: string; // frontend id
    designator_id: number;
    code: string;
    description: string;
    unit: string;
    qty: number | string;
}

export default function UpdateTagModal({ isOpen, onClose, row, items }: UpdateTagModalProps) {
    const queryClient = useQueryClient();

    // Determine state
    const isUpdatingRequest = !row?.request_id;
    const isUpdatingSend = !!row?.request_id && !row?.send_id;
    const isUpdatingAccept = !!row?.send_id && !row?.accept_id;

    const isReturn = row?.type === 'return';

    const actionType = isReturn
        ? 'accept'
        : isUpdatingRequest
          ? 'request'
          : isUpdatingSend
            ? 'send'
            : isUpdatingAccept
              ? 'accept'
              : null;

    // Field labels
    const idLabel = isReturn
        ? 'Accept ID'
        : isUpdatingRequest
          ? 'Request ID'
          : isUpdatingSend
            ? 'Send ID'
            : 'Accept ID';

    const [actionId, setActionId] = useState('');
    const [materialItems, setMaterialItems] = useState<MaterialItem[]>([]);

    useEffect(() => {
        if (isOpen && row && items.length > 0) {
            setActionId('');

            // Filter items to show latest qty (if they exist).
            // Assuming we just group by designator_id and take the most recent action qty,
            // or simply use the initial requests as base for the next step.
            const baseItems = items
                .filter((i) => isReturn || i.action === 'request')
                .map((i) => ({
                    id: crypto.randomUUID(),
                    designator_id: i.designator_id,
                    code: i.code,
                    description: i.description,
                    unit: i.unit,
                    qty: i.qty,
                }));

            setMaterialItems(baseItems);
        }
    }, [isOpen, row, items, isReturn]);

    const updateMutation = useMutation({
        mutationFn: async () => {
            if (!actionType) throw new Error('Invalid state');
            if (!actionId) throw new Error(`${idLabel} is required`);

            const idemKey = generateIdempotencyKey();
            setIdempotencyKey(idemKey, 'inventoryTx');

            if (isReturn) {
                return acceptReturnTag(row.id, actionId, idemKey);
            }

            return updateTag({
                headerId: row.id,
                actionType,
                actionId,
                items: materialItems.map((i) => ({
                    designator_id: i.designator_id,
                    qty: Number(i.qty),
                })),
                idemKey,
            });
        },
        onSuccess: (res) => {
            if (res.success) {
                toast.success(`Tag updated successfully`);
                queryClient.invalidateQueries({ queryKey: ['inoutTags'] });
                onClose();
            } else {
                toast.error(res.error || 'Failed to update tag');
            }
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });

    const handleQtyChange = (id: string, value: number) => {
        setMaterialItems(materialItems.map((i) => (i.id === id ? { ...i, qty: value } : i)));
    };

    const cancelMutation = useMutation({
        mutationFn: async () => {
            return cancelTag(row.id);
        },
        onSuccess: (res) => {
            if (res.success) {
                toast.success(`Tag cancelled successfully`);
                queryClient.invalidateQueries({ queryKey: ['inoutTags'] });
                onClose();
            } else {
                toast.error(res.error || 'Failed to cancel tag');
            }
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });

    const handleCancelTag = () => {
        if (
            window.confirm(
                'Are you sure you want to cancel this transaction? This action cannot be undone.'
            )
        ) {
            cancelMutation.mutate();
        }
    };

    if (!row || !actionType) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[700px]">
                <DialogHeader>
                    <DialogTitle>Update Tag: {row.id_trx}</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-4">
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <p className="text-sm text-gray-500">Transaction ID</p>
                            <p className="font-medium">{row.id_trx}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm text-gray-500">Warehouse</p>
                            <p className="font-medium">
                                {row.from_wh_name} ➔ {row.to_wh_name}
                            </p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm text-gray-500">Current Status</p>
                            <Badge variant="outline">{row.end_status}</Badge>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>{idLabel}</Label>
                            <Input
                                placeholder={`Enter ${idLabel}...`}
                                value={actionId}
                                onChange={(e) => setActionId(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* Material list: editable for inout, read-only for return */}
                {materialItems.length > 0 && (
                    <div className="mt-4 space-y-4">
                        <Label className="text-base font-semibold">
                            {isReturn
                                ? 'Daftar Material Dikembalikan'
                                : `Material List (${actionType?.toUpperCase()})`}
                        </Label>

                        <div className="border rounded-md overflow-hidden">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="w-12 text-center">No</TableHead>
                                        <TableHead>Designator/Code</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="w-24">Unit</TableHead>
                                        <TableHead className="w-32">Qty</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {materialItems.map((item, index) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="text-center font-medium">
                                                {index + 1}
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {item.code}
                                            </TableCell>
                                            <TableCell
                                                className="text-sm text-gray-600 truncate max-w-[200px]"
                                                title={item.description}
                                            >
                                                {item.description}
                                            </TableCell>
                                            <TableCell className="text-sm">{item.unit}</TableCell>
                                            <TableCell>
                                                {isReturn ? (
                                                    // Read-only for return material
                                                    <span className="font-semibold text-blue-600">
                                                        {item.qty}
                                                    </span>
                                                ) : (
                                                    <Input
                                                        type="number"
                                                        min="1"
                                                        className="h-8"
                                                        placeholder="0"
                                                        value={
                                                            item.qty === 0 || item.qty === ''
                                                                ? ''
                                                                : item.qty
                                                        }
                                                        onChange={(e) => {
                                                            const val =
                                                                e.target.value === ''
                                                                    ? ''
                                                                    : parseInt(e.target.value, 10);
                                                            handleQtyChange(item.id, val as number);
                                                        }}
                                                    />
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                )}

                <div className="flex justify-between items-center mt-6 border-t pt-4">
                    <div>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                        onClick={handleCancelTag}
                                        disabled={
                                            cancelMutation.isPending || updateMutation.isPending
                                        }
                                    >
                                        <Ban size={16} />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Cancel Transaction</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            onClick={onClose}
                            disabled={updateMutation.isPending || cancelMutation.isPending}
                        >
                            Close
                        </Button>
                        <Button
                            onClick={() => updateMutation.mutate()}
                            disabled={
                                updateMutation.isPending || cancelMutation.isPending || !actionId
                            }
                        >
                            {updateMutation.isPending ? 'Saving...' : 'Update'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
