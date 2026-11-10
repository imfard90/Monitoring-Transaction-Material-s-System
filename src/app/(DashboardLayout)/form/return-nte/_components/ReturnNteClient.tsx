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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { returnNte } from '../_actions/return-nte-commands';

type AddressOption = { address_name: string; owner: string; ui_label: string };
type TechnicianOption = { nik: string; name: string | null; mitra_name: string | null };

const returnSchema = z.object({
    nikTeknisi: z.string().min(1, 'NIK Teknisi wajib dipilih.'),
    tujuan: z.string().min(1, 'Warehouse tujuan wajib diisi.'),
    snList: z.array(z.object({ serial_number: z.string().min(1) })).min(1, 'Minimal 1 SN.'),
});

type ReturnForm = z.infer<typeof returnSchema>;

interface Props {
    addressOptions: AddressOption[];
    technicianOptions: TechnicianOption[];
}

export default function ReturnNteClient({ addressOptions, technicianOptions }: Props) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedSn, setSelectedSn] = useState<string[]>([]);
    const [snManual, setSnManual] = useState('');

    const {
        handleSubmit,
        reset,
        setValue,
        watch,
        formState: { errors },
    } = useForm<ReturnForm>({
        resolver: zodResolver(returnSchema),
        defaultValues: { nikTeknisi: '', tujuan: '', snList: [] },
    });

    const watchedNik = watch('nikTeknisi');
    const watchedTujuan = watch('tujuan');

    const addSn = () => {
        const sn = snManual.trim();
        if (!sn) return;
        if (selectedSn.includes(sn)) {
            toast.error('SN sudah ada di daftar.');
            return;
        }
        const updated = [...selectedSn, sn];
        setSelectedSn(updated);
        setValue(
            'snList',
            updated.map((serial_number) => ({ serial_number }))
        );
        setSnManual('');
    };

    const removeSn = (sn: string) => {
        const updated = selectedSn.filter((s) => s !== sn);
        setSelectedSn(updated);
        setValue(
            'snList',
            updated.map((serial_number) => ({ serial_number }))
        );
    };

    const onSubmit = async (data: ReturnForm) => {
        if (selectedSn.length === 0) {
            toast.error('Tambahkan minimal 1 SN.');
            return;
        }

        setIsSubmitting(true);
        const result = await returnNte({
            ...data,
            snList: selectedSn.map((serial_number) => ({ serial_number })),
            idemKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        });
        setIsSubmitting(false);

        if (result.success) {
            toast.success('Return NTE berhasil diproses.');
            reset();
            setSelectedSn([]);
        } else {
            toast.error(result.error ?? 'Gagal memproses return NTE.');
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4">Form Return NTE dari Teknisi</h2>

                <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
                    {/* NIK Teknisi */}
                    <div className="flex flex-col gap-1.5">
                        <Label>NIK Teknisi</Label>
                        <Select value={watchedNik} onValueChange={(v) => setValue('nikTeknisi', v)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Pilih teknisi..." />
                            </SelectTrigger>
                            <SelectContent>
                                {technicianOptions.map((t) => (
                                    <SelectItem key={t.nik} value={t.nik}>
                                        {t.name ?? t.nik} — {t.mitra_name ?? t.nik}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {errors.nikTeknisi && (
                            <p className="text-xs text-destructive">{errors.nikTeknisi.message}</p>
                        )}
                    </div>

                    {/* Tujuan Warehouse */}
                    <div className="flex flex-col gap-1.5">
                        <Label>Warehouse Tujuan</Label>
                        <Select value={watchedTujuan} onValueChange={(v) => setValue('tujuan', v)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Pilih warehouse..." />
                            </SelectTrigger>
                            <SelectContent>
                                {addressOptions.map((a) => (
                                    <SelectItem key={a.address_name} value={a.address_name}>
                                        {a.ui_label} ({a.owner})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {errors.tujuan && (
                            <p className="text-xs text-destructive">{errors.tujuan.message}</p>
                        )}
                    </div>

                    {/* SN Manual Input */}
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="return_sn_manual">
                            Serial Number ({selectedSn.length} SN)
                        </Label>
                        <div className="flex gap-2">
                            <Input
                                id="return_sn_manual"
                                placeholder="Masukkan Serial Number..."
                                value={snManual}
                                onChange={(e) => setSnManual(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addSn();
                                    }
                                }}
                            />
                            <Button type="button" variant="outline" onClick={addSn}>
                                Tambah
                            </Button>
                        </div>

                        {/* SN List */}
                        {selectedSn.length > 0 && (
                            <div className="rounded-md border max-h-60 overflow-y-auto">
                                {selectedSn.map((sn) => (
                                    <div
                                        key={sn}
                                        className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 hover:bg-muted/30"
                                    >
                                        <span className="font-mono text-sm">{sn}</span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => removeSn(sn)}
                                        >
                                            Hapus
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {errors.snList && (
                            <p className="text-xs text-destructive">{errors.snList.message}</p>
                        )}
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                reset();
                                setSelectedSn([]);
                                setSnManual('');
                            }}
                        >
                            Reset
                        </Button>
                        <Button type="submit" disabled={isSubmitting || selectedSn.length === 0}>
                            {isSubmitting ? 'Menyimpan...' : 'Proses Return'}
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
}
