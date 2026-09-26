'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { upsertTechnician } from './actions';

interface TechnicianDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialData?: any;
    branches: any[];
    mitras: any[];
}

export function TechnicianDialog({
    open,
    onOpenChange,
    initialData,
    branches,
    mitras,
}: TechnicianDialogProps) {
    const [isPending, startTransition] = useTransition();
    const [branchOpen, setBranchOpen] = useState(false);
    const [mitraOpen, setMitraOpen] = useState(false);
    const [formData, setFormData] = useState({
        nik: '',
        name: '',
        branch_id: '',
        mitra_id: '',
    });

    useEffect(() => {
        if (open) {
            if (initialData) {
                setFormData({
                    nik: initialData.nik || '',
                    name: initialData.name || '',
                    branch_id: initialData.branch_id ? String(initialData.branch_id) : '',
                    mitra_id: initialData.mitra_id ? String(initialData.mitra_id) : '',
                });
            } else {
                setFormData({
                    nik: '',
                    name: '',
                    branch_id: '',
                    mitra_id: '',
                });
            }
        }
    }, [open, initialData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (
            !formData.nik ||
            !formData.name ||
            !formData.branch_id ||
            formData.branch_id === 'none' ||
            !formData.mitra_id ||
            formData.mitra_id === 'none'
        ) {
            toast.error('Semua field wajib diisi (NIK, Nama, Service Area, dan Mitra)');
            return;
        }

        startTransition(async () => {
            try {
                await upsertTechnician({
                    id: initialData?.id,
                    nik: formData.nik,
                    name: formData.name,
                    branch_id:
                        formData.branch_id && formData.branch_id !== 'none'
                            ? Number(formData.branch_id)
                            : null,
                    mitra_id:
                        formData.mitra_id && formData.mitra_id !== 'none'
                            ? Number(formData.mitra_id)
                            : null,
                });
                toast.success(`Technician successfully ${initialData ? 'updated' : 'inserted'}`);
                onOpenChange(false);
            } catch (error: any) {
                toast.error(error.message || 'Failed to save technician');
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>
                            {initialData ? 'Edit Technician' : 'Insert Technician'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="nik">
                                NIK <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="nik"
                                placeholder="Masukkan NIK"
                                value={formData.nik}
                                onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
                                disabled={isPending}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="name">
                                Nama <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="name"
                                placeholder="Masukkan Nama"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                disabled={isPending}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="branch">
                                Service Area - Branch <span className="text-red-500">*</span>
                            </Label>
                            <Popover open={branchOpen} onOpenChange={setBranchOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={branchOpen}
                                        className="w-full justify-between"
                                        disabled={isPending}
                                    >
                                        {formData.branch_id
                                            ? branches.find(
                                                  (b) => String(b.id) === formData.branch_id
                                              )
                                                ? `${branches.find((b) => String(b.id) === formData.branch_id)?.service_area} - ${branches.find((b) => String(b.id) === formData.branch_id)?.branch}`
                                                : 'Pilih Service Area'
                                            : 'Pilih Service Area'}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[375px] p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="Cari Branch / WH..." />
                                        <CommandList>
                                            <CommandEmpty>Branch tidak ditemukan.</CommandEmpty>
                                            <CommandGroup>
                                                {branches.map((b) => (
                                                    <CommandItem
                                                        key={b.id}
                                                        value={`${b.service_area} - ${b.branch}`}
                                                        onSelect={() => {
                                                            setFormData({
                                                                ...formData,
                                                                branch_id: String(b.id),
                                                            });
                                                            setBranchOpen(false);
                                                        }}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                'mr-2 h-4 w-4',
                                                                formData.branch_id === String(b.id)
                                                                    ? 'opacity-100'
                                                                    : 'opacity-0'
                                                            )}
                                                        />
                                                        {b.service_area} - {b.branch}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="mitra">
                                Mitra <span className="text-red-500">*</span>
                            </Label>
                            <Popover open={mitraOpen} onOpenChange={setMitraOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={mitraOpen}
                                        className="w-full justify-between"
                                        disabled={isPending}
                                    >
                                        {formData.mitra_id
                                            ? mitras.find((m) => String(m.id) === formData.mitra_id)
                                                  ?.mitra_name
                                            : 'Pilih Mitra'}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[375px] p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="Cari Mitra..." />
                                        <CommandList>
                                            <CommandEmpty>Mitra tidak ditemukan.</CommandEmpty>
                                            <CommandGroup>
                                                {mitras.map((m) => (
                                                    <CommandItem
                                                        key={m.id}
                                                        value={m.mitra_name || ''}
                                                        onSelect={() => {
                                                            setFormData({
                                                                ...formData,
                                                                mitra_id: String(m.id),
                                                            });
                                                            setMitraOpen(false);
                                                        }}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                'mr-2 h-4 w-4',
                                                                formData.mitra_id === String(m.id)
                                                                    ? 'opacity-100'
                                                                    : 'opacity-0'
                                                            )}
                                                        />
                                                        {m.mitra_name}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isPending}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isPending}>
                            Save changes
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
