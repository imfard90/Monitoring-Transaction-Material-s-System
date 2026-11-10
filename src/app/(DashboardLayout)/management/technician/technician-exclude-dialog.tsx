'use client';

import { LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { SearchableSelect } from '@/app/components/shared/SearchableSelect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateTechnicianExclude } from './actions';
import type { TechnicianItem } from './technician-table';

export interface ExcludeMaterialItem {
    id_material: string;
    nama_material: string;
    qty: number;
    type: 'subtract' | 'add';
}

interface TechnicianExcludeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    technician: TechnicianItem | null;
    materials: Array<{ code: string; description: string; unit: string }>;
}

export function TechnicianExcludeDialog({
    open,
    onOpenChange,
    technician,
    materials,
}: TechnicianExcludeDialogProps) {
    const [isPending, startTransition] = useTransition();
    const [items, setItems] = useState<ExcludeMaterialItem[]>([]);
    const [selectedCode, setSelectedCode] = useState('');
    const [qtyInput, setQtyInput] = useState('1');
    const [operationType, setOperationType] = useState<'subtract' | 'add'>('subtract');

    useEffect(() => {
        if (technician) {
            const rawExcludes = technician.exclude_intech_lensa;
            if (Array.isArray(rawExcludes)) {
                setItems(
                    rawExcludes.map((it) => ({
                        id_material: String(it.id_material || ''),
                        nama_material: String(it.nama_material || ''),
                        qty: Number(it.qty) || 1,
                        type: it.type === 'add' ? 'add' : 'subtract',
                    }))
                );
            } else {
                setItems([]);
            }
            setSelectedCode('');
            setQtyInput('1');
            setOperationType('subtract');
        }
    }, [technician]);

    const materialOptions = useMemo(() => {
        return materials.map((m) => ({
            value: m.code,
            label: `${m.code} — ${m.description}`,
        }));
    }, [materials]);

    const handleAddItem = () => {
        if (!selectedCode) {
            toast.error('Pilih material terlebih dahulu');
            return;
        }

        const qtyNum = parseInt(qtyInput, 10);
        if (Number.isNaN(qtyNum) || qtyNum <= 0) {
            toast.error('Jumlah harus lebih dari 0');
            return;
        }

        const selectedMat = materials.find((m) => m.code === selectedCode);
        const namaMaterial = selectedMat?.description || selectedCode;

        setItems((prev) => {
            const existingIdx = prev.findIndex(
                (it) => it.id_material.toUpperCase() === selectedCode.toUpperCase()
            );
            if (existingIdx >= 0) {
                // Update qty dan jenis jika sudah ada di list
                const updated = [...prev];
                updated[existingIdx] = {
                    id_material: selectedCode,
                    nama_material: namaMaterial,
                    qty: qtyNum,
                    type: operationType,
                };
                return updated;
            }
            return [
                ...prev,
                {
                    id_material: selectedCode,
                    nama_material: namaMaterial,
                    qty: qtyNum,
                    type: operationType,
                },
            ];
        });

        setSelectedCode('');
        setQtyInput('1');
        setOperationType('subtract');
    };

    const handleRemoveItem = (index: number) => {
        setItems((prev) => prev.filter((_, idx) => idx !== index));
    };

    const handleClearAll = () => {
        setItems([]);
    };

    const handleSave = () => {
        if (!technician) return;

        startTransition(async () => {
            try {
                const res = await updateTechnicianExclude({
                    id: technician.id,
                    items,
                });
                toast.success(res.message || 'Data penyesuaian berhasil disimpan');
                onOpenChange(false);
            } catch (err) {
                toast.error(
                    err instanceof Error ? err.message : 'Gagal menyimpan data penyesuaian'
                );
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
                <DialogHeader className="shrink-0">
                    <DialogTitle className="text-lg font-bold flex items-center gap-2">
                        Kelola Penyesuaian / Exclude Stok Lensa
                        {technician && (
                            <Badge variant="outline" className="font-mono text-xs font-normal">
                                NIK: {technician.nik}
                            </Badge>
                        )}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                        Material pada daftar ini akan disesuaikan pada perhitungan stok Lensa Intech
                        teknisi <strong className="text-foreground">{technician?.name}</strong>{' '}
                        (kurang untuk exclude, tambah untuk normalisasi defisit).
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
                    {/* Form Tambah Item */}
                    <div className="rounded-lg border border-border bg-muted/30 p-3.5 space-y-3">
                        <span className="text-xs font-semibold text-foreground">
                            Tambah Penyesuaian Material
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                            <div className="sm:col-span-5 space-y-1">
                                <Label className="text-xs">Pilih Material</Label>
                                <SearchableSelect
                                    options={materialOptions}
                                    value={selectedCode}
                                    onValueChange={setSelectedCode}
                                    placeholder="Cari kode atau nama material..."
                                    className="w-full text-xs"
                                    disabled={isPending}
                                />
                            </div>

                            <div className="sm:col-span-3 space-y-1">
                                <Label className="text-xs">Jenis</Label>
                                <select
                                    value={operationType}
                                    onChange={(e) =>
                                        setOperationType(e.target.value as 'subtract' | 'add')
                                    }
                                    className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-xs text-foreground focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary"
                                    disabled={isPending}
                                >
                                    <option
                                        value="subtract"
                                        className="bg-popover text-popover-foreground"
                                    >
                                        Kurang (-) Exclude
                                    </option>
                                    <option
                                        value="add"
                                        className="bg-popover text-popover-foreground"
                                    >
                                        Tambah (+) Normalisasi
                                    </option>
                                </select>
                            </div>

                            <div className="sm:col-span-2 space-y-1">
                                <Label htmlFor="exclude_qty_input" className="text-xs">
                                    Jumlah
                                </Label>
                                <Input
                                    id="exclude_qty_input"
                                    type="number"
                                    min="1"
                                    value={qtyInput}
                                    onChange={(e) => setQtyInput(e.target.value)}
                                    placeholder="Qty"
                                    className="h-9 text-xs font-mono"
                                    disabled={isPending}
                                />
                            </div>

                            <div className="sm:col-span-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    className="w-full h-9 gap-1 text-xs"
                                    onClick={handleAddItem}
                                    disabled={isPending || !selectedCode}
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    Tambah
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Tabel Daftar Item Exclude */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground">
                                Daftar Penyesuaian Material ({items.length})
                            </span>
                            {items.length > 0 && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleClearAll}
                                    disabled={isPending}
                                    className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 px-2"
                                >
                                    Kosongkan Daftar
                                </Button>
                            )}
                        </div>

                        {items.length === 0 ? (
                            <div className="border border-dashed border-border rounded-lg p-6 text-center text-xs text-muted-foreground">
                                Belum ada penyesuaian material untuk teknisi ini.
                            </div>
                        ) : (
                            <div className="rounded-md border border-border overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead className="bg-muted/60 text-muted-foreground border-b border-border">
                                        <tr>
                                            <th className="py-2 px-3 text-left font-medium w-[120px]">
                                                Kode Material
                                            </th>
                                            <th className="py-2 px-3 text-left font-medium">
                                                Nama Material
                                            </th>
                                            <th className="py-2 px-3 text-center font-medium w-[90px]">
                                                Jenis
                                            </th>
                                            <th className="py-2 px-3 text-center font-medium w-[80px]">
                                                Jumlah
                                            </th>
                                            <th className="py-2 px-3 text-center font-medium w-[45px]">
                                                Aksi
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {items.map((it, idx) => (
                                            <tr key={it.id_material} className="hover:bg-muted/30">
                                                <td className="py-2 px-3 font-mono text-muted-foreground whitespace-nowrap">
                                                    {it.id_material}
                                                </td>
                                                <td className="py-2 px-3 text-foreground font-medium wrap-break-words">
                                                    {it.nama_material}
                                                </td>
                                                <td className="py-2 px-3 text-center">
                                                    <Badge
                                                        variant={
                                                            it.type === 'add'
                                                                ? 'lightSuccess'
                                                                : 'outline'
                                                        }
                                                        className="text-[10px] px-1.5 py-0.5 border"
                                                    >
                                                        {it.type === 'add'
                                                            ? 'Tambah (+)'
                                                            : 'Kurang (-)'}
                                                    </Badge>
                                                </td>
                                                <td className="py-2 px-3 text-center font-mono font-semibold">
                                                    {it.type === 'add' ? (
                                                        <span className="text-emerald-600 dark:text-emerald-400">
                                                            +{it.qty}
                                                        </span>
                                                    ) : (
                                                        <span className="text-amber-600 dark:text-amber-400">
                                                            -{it.qty}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 text-center">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        aria-label="Hapus material yang dikecualikan"
                                                        onClick={() => handleRemoveItem(idx)}
                                                        disabled={isPending}
                                                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                        title="Hapus baris ini"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter className="shrink-0 pt-3 border-t border-border flex sm:justify-between items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                        disabled={isPending}
                    >
                        Batal
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        onClick={handleSave}
                        disabled={isPending}
                        className="gap-1.5"
                    >
                        {isPending && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                        Simpan Penyesuaian
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
