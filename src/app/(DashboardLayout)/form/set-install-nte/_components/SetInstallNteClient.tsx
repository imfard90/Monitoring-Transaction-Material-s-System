'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { setInstallNte } from '../_actions/set-install-commands';

type AddressOption = { address_name: string; owner: string; ui_label: string };
type ItemOption = { item_description: string; type: string; merek: string };
type TechnicianOption = { nik: string; name: string | null; mitra_name: string | null };
export type InventoryOption = {
    serial_number: string;
    item_description: string;
    owner: string;
    address: string | null;
    inventory_status: string | null;
    condition_status: string | null;
    wo_number: string | null;
    inet_number: string | null;
    ui_label: string | null;
};

interface Props {
    snOptions: InventoryOption[];
    addressOptions: AddressOption[];
    itemOptions: ItemOption[];
    technicianOptions: TechnicianOption[];
}

export default function SetInstallNteClient({ snOptions }: Props) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedSn, setSelectedSn] = useState<string[]>([]);

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm({
        resolver: zodResolver(
            z.object({
                woNumber: z.string().min(1),
                inetNumber: z.string().min(1),
            })
        ),
        defaultValues: { woNumber: '', inetNumber: '' },
    });

    const toggleSn = (sn: string) => {
        setSelectedSn((prev) => (prev.includes(sn) ? prev.filter((s) => s !== sn) : [...prev, sn]));
    };

    const onSubmit = async (data: { woNumber: string; inetNumber: string }) => {
        if (selectedSn.length === 0) {
            toast.error('Pilih minimal 1 SN.');
            return;
        }

        setIsSubmitting(true);
        const result = await setInstallNte({
            woNumber: data.woNumber,
            inetNumber: data.inetNumber,
            snList: selectedSn.map((serial_number) => ({ serial_number })),
            idemKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        });
        setIsSubmitting(false);

        if (result.success) {
            toast.success('Install NTE berhasil diproses.');
            reset();
            setSelectedSn([]);
        } else {
            toast.error(result.error ?? 'Gagal memproses install NTE.');
        }
    };

    const grouped = snOptions.reduce<Record<string, Array<Record<string, unknown>>>>((acc, sn) => {
        const key = String(sn.item_description ?? '');
        if (!acc[key]) acc[key] = [];
        acc[key].push(sn);
        return acc;
    }, {});

    return (
        <div className="flex flex-col gap-4">
            <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4">Form Set Install NTE</h2>

                <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="woNumber">WO Number</Label>
                            <Input
                                id="woNumber"
                                {...register('woNumber')}
                                placeholder="Contoh: WO-2024-00001"
                            />
                            {errors.woNumber && (
                                <p className="text-xs text-destructive">
                                    {String(errors.woNumber.message)}
                                </p>
                            )}
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="inetNumber">Inet Number</Label>
                            <Input
                                id="inetNumber"
                                {...register('inetNumber')}
                                placeholder="Contoh: 123456789"
                            />
                            {errors.inetNumber && (
                                <p className="text-xs text-destructive">
                                    {String(errors.inetNumber.message)}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <Label>Serial Number ({selectedSn.length} dipilih)</Label>
                            {selectedSn.length > 0 && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSelectedSn([])}
                                >
                                    Hapus semua
                                </Button>
                            )}
                        </div>

                        {Object.keys(grouped).length === 0 ? (
                            <p className="text-sm text-muted-foreground py-4 text-center">
                                Tidak ada SN dengan status unavailable.
                            </p>
                        ) : (
                            Object.entries(grouped).map(([itemDesc, sns]) => (
                                <div key={itemDesc} className="rounded-md border">
                                    <div className="px-3 py-2 bg-muted/50 text-xs font-medium border-b">
                                        {itemDesc}
                                    </div>
                                    <div className="max-h-60 overflow-y-auto">
                                        {sns.map((sn) => (
                                            <label
                                                key={String(sn.serial_number)}
                                                className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30 cursor-pointer border-b last:border-b-0"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedSn.includes(
                                                        String(sn.serial_number)
                                                    )}
                                                    onChange={() =>
                                                        toggleSn(String(sn.serial_number))
                                                    }
                                                    className="rounded"
                                                />
                                                <span className="font-mono text-sm">
                                                    {String(sn.serial_number)}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                reset();
                                setSelectedSn([]);
                            }}
                        >
                            Reset
                        </Button>
                        <Button type="submit" disabled={isSubmitting || selectedSn.length === 0}>
                            {isSubmitting ? 'Menyimpan...' : 'Simpan Install'}
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
}
