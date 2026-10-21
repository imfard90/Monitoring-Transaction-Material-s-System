'use client';

import { FileSpreadsheet, Info } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

const MONTH_NAMES = [
    { value: '1', label: 'Januari' },
    { value: '2', label: 'Februari' },
    { value: '3', label: 'Maret' },
    { value: '4', label: 'April' },
    { value: '5', label: 'Mei' },
    { value: '6', label: 'Juni' },
    { value: '7', label: 'Juli' },
    { value: '8', label: 'Agustus' },
    { value: '9', label: 'September' },
    { value: '10', label: 'Oktober' },
    { value: '11', label: 'November' },
    { value: '12', label: 'Desember' },
];

interface ExportRekonModalProps {
    isOpen: boolean;
    onClose: () => void;
    onExport: (month: number, year: number) => void;
    isExporting?: boolean;
}

export default function ExportRekonModal({
    isOpen,
    onClose,
    onExport,
    isExporting = false,
}: ExportRekonModalProps) {
    const now = new Date();
    const currentMonth = String(now.getMonth() + 1);
    const currentYear = now.getFullYear();

    const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
    const [selectedYear, setSelectedYear] = useState<string>(String(currentYear));

    // Menghasilkan daftar tahun (rentang 4 tahun ke belakang dan 1 tahun ke depan)
    const years = Array.from({ length: 6 }, (_, i) => String(currentYear - 4 + i)).reverse();

    const handleConfirm = () => {
        const monthNum = parseInt(selectedMonth, 10);
        const yearNum = parseInt(selectedYear, 10);
        if (!Number.isNaN(monthNum) && !Number.isNaN(yearNum)) {
            onExport(monthNum, yearNum);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && !isExporting && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <FileSpreadsheet className="h-5 w-5" />
                        </div>
                        <DialogTitle>Export Data Hasil Rekon</DialogTitle>
                    </div>
                    <DialogDescription className="text-muted-foreground pt-1">
                        Pilih periode bulan dan tahun untuk mengunduh laporan hasil rekon dalam
                        format Excel (.xlsx).
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-2">
                    <div className="grid grid-cols-2 gap-3">
                        {/* Dropdown Periode Bulan */}
                        <div className="space-y-2">
                            <Label htmlFor="export-month" className="text-xs font-semibold">
                                Bulan
                            </Label>
                            <Select
                                value={selectedMonth}
                                onValueChange={setSelectedMonth}
                                disabled={isExporting}
                            >
                                <SelectTrigger id="export-month" className="w-full">
                                    <SelectValue placeholder="Pilih Bulan" />
                                </SelectTrigger>
                                <SelectContent>
                                    {MONTH_NAMES.map((m) => (
                                        <SelectItem key={m.value} value={m.value}>
                                            {m.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Dropdown Periode Tahun */}
                        <div className="space-y-2">
                            <Label htmlFor="export-year" className="text-xs font-semibold">
                                Tahun
                            </Label>
                            <Select
                                value={selectedYear}
                                onValueChange={setSelectedYear}
                                disabled={isExporting}
                            >
                                <SelectTrigger id="export-year" className="w-full">
                                    <SelectValue placeholder="Pilih Tahun" />
                                </SelectTrigger>
                                <SelectContent>
                                    {years.map((y) => (
                                        <SelectItem key={y} value={y}>
                                            {y}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Informasi Scoping Akses Gudang */}
                    <div className="flex items-start gap-2.5 p-3 rounded-lg border border-border/60 bg-muted/40 text-xs text-muted-foreground">
                        <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                        <div>
                            Data yang diekspor akan difilter otomatis sesuai dengan penugasan gudang
                            (PIC) akun Anda.
                        </div>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        disabled={isExporting}
                    >
                        Batal
                    </Button>
                    <Button
                        type="button"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm"
                        onClick={handleConfirm}
                        disabled={isExporting}
                    >
                        <FileSpreadsheet className="h-4 w-4" />
                        <span>Export Excel (.xlsx)</span>
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
