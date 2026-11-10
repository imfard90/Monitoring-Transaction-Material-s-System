'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Icon } from '@iconify/react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { SearchableSelect } from '@/app/components/shared/SearchableSelect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { type NteTagFormValues, nteTagFormSchema } from '@/lib/nte-tag-form';
import { createTagNte } from '../_actions/tag-commands';

type AddressOption = { address_name: string; owner: string; ui_label: string; check_sn?: boolean };
type ItemOption = { id: string; item_description: string; type: string; merek: string };
type NteTagRow = Record<string, unknown>;
type Pagination = { total: number; page: number; pageSize: number; totalPages: number };

type Props = {
    initialTags: NteTagRow[];
    pagination: Pagination | null;
    addressOptions: AddressOption[];
    itemOptions: ItemOption[];
    initialFilters: {
        search: string;
        typeTransaksi: string;
        page: string;
        pageSize: string;
    };
};

const TYPE_LABELS: Record<string, string> = {
    stock_transfer: 'Stock Transfer',
    send_to_technician: 'Kirim ke Teknisi',
};

/** Derive TAG subtype based on check_sn flags */
function getTagSubtype(
    asalAddr: AddressOption | undefined,
    tujuanAddr: AddressOption | undefined
): 'check-to-check' | 'check-to-nocheck' | 'nocheck-to-check' | null {
    if (!asalAddr || !tujuanAddr) return null;
    if (asalAddr.check_sn && tujuanAddr.check_sn) return 'check-to-check';
    if (asalAddr.check_sn && !tujuanAddr.check_sn) return 'check-to-nocheck';
    if (!asalAddr.check_sn && tujuanAddr.check_sn) return 'nocheck-to-check';
    return null; // nocheck-to-nocheck is invalid
}

export default function NteTagClient({
    initialTags,
    pagination,
    addressOptions,
    itemOptions,
    initialFilters,
}: Props) {
    const router = useRouter();

    const [filterSearch, setFilterSearch] = useState(initialFilters.search);
    const [filterType, setFilterType] = useState(initialFilters.typeTransaksi);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isMassUploadOpen, setIsMassUploadOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    /** SN list for check-to-check / check-to-nocheck (flat strings) */
    const [snListFlat, setSnListFlat] = useState<string[]>([]);
    /** SN list nocheck-to-check (objects with item_description) */
    const [snListNocheckToCheck, setSnListNocheckToCheck] = useState<
        Array<{ serial_number: string; item_description: string }>
    >([]);

    /** nocheck-to-check item description dropdown */
    const [nocheckToCheckItemDescription, setNocheckToCheckItemDescription] = useState('');

    const {
        handleSubmit,
        formState: { errors },
        watch,
        setValue,
        reset,
    } = useForm<NteTagFormValues>({
        resolver: zodResolver(nteTagFormSchema),
        defaultValues: { asal: '', tujuan: '' },
    });
    const watchedAsal = watch('asal');
    const watchedTujuan = watch('tujuan');

    const asalAddr = useMemo(
        () => addressOptions.find((a) => a.address_name === watchedAsal),
        [addressOptions, watchedAsal]
    );
    const tujuanAddr = useMemo(
        () => addressOptions.find((a) => a.address_name === watchedTujuan),
        [addressOptions, watchedTujuan]
    );

    const subtype = useMemo(() => getTagSubtype(asalAddr, tujuanAddr), [asalAddr, tujuanAddr]);

    const isNocheckToCheck = subtype === 'nocheck-to-check';

    const watchedSnList = isNocheckToCheck ? snListNocheckToCheck : snListFlat;

    const handleCreateOpen = (open: boolean) => {
        setIsCreateOpen(open);
        if (!open) {
            reset();
            setSnListFlat([]);
            setSnListNocheckToCheck([]);
            setNocheckToCheckItemDescription('');
        }
    };

    const onSubmit = handleSubmit(async (data) => {
        if (!subtype) {
            toast.error('Kombinasi asal-tujuan tidak valid.');
            return;
        }

        setIsSubmitting(true);
        try {
            let payload: string[] | Array<{ serial_number: string; item_description: string }>;

            if (isNocheckToCheck) {
                payload = snListNocheckToCheck;
            } else {
                payload = snListFlat;
            }
            if (payload.length === 0) {
                toast.error('Minimal 1 SN');
                return;
            }

            const result = await createTagNte({
                asal: data.asal,
                tujuan: data.tujuan,
                idemKey: crypto.randomUUID(),
                snList: payload,
            });

            if (result.success && !result.duplicate) {
                toast.success('TAG berhasil dibuat');
                handleCreateOpen(false);
                router.refresh();
            } else if (result.success && result.duplicate) {
                toast.info('TAG sudah pernah dibuat sebelumnya (idempotency).');
                handleCreateOpen(false);
                router.refresh();
            } else {
                toast.error(result.error || 'Gagal membuat TAG');
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Terjadi kesalahan');
        } finally {
            setIsSubmitting(false);
        }
    });

    const handleMassUploadFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            const lines = content
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean);

            if (isNocheckToCheck) {
                if (!nocheckToCheckItemDescription) {
                    toast.error('Pilih item description terlebih dahulu.');
                    return;
                }
                const newList = lines.map((sn) => ({
                    serial_number: sn,
                    item_description: nocheckToCheckItemDescription,
                }));
                setSnListNocheckToCheck((prev) => [...prev, ...newList]);
            } else {
                setSnListFlat((prev) => [...prev, ...lines]);
            }

            toast.success(`${lines.length} SN berhasil ditambahkan dari file.`);
            setIsMassUploadOpen(false);
        };
        reader.readAsText(file);
    };

    return (
        <div className="flex flex-col gap-4">
            {/* Filter bar */}
            <div className="flex items-center gap-3">
                <div className="flex-1">
                    <Input
                        aria-label="Cari ID Transaksi"
                        placeholder="Cari ID Transaksi..."
                        value={filterSearch}
                        onChange={(e) => setFilterSearch(e.target.value)}
                    />
                </div>
                <div>
                    <Select value={filterType} onValueChange={setFilterType}>
                        <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Semua Tipe" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Semua Tipe</SelectItem>
                            <SelectItem value="stock_transfer">Stock Transfer</SelectItem>
                            <SelectItem value="send_to_technician">Kirim ke Teknisi</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <Button
                        variant="outline"
                        onClick={() => {
                            const params = new URLSearchParams();
                            if (filterSearch) params.set('search', filterSearch);
                            if (filterType && filterType !== 'all')
                                params.set('typeTransaksi', filterType);
                            router.push(`/apps/nte-transaction/tag?${params.toString()}`);
                        }}
                    >
                        <Icon icon="lucide:search" className="w-4 h-4" />
                    </Button>
                </div>
                <div className="ml-auto">
                    <Button onClick={() => handleCreateOpen(true)}>
                        <Icon icon="lucide:plus" className="w-4 h-4" />
                        Buat TAG
                    </Button>
                </div>
            </div>

            {/* Table */}
            <Card className="w-full overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>ID Transaksi</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Asal</TableHead>
                            <TableHead>Tujuan</TableHead>
                            <TableHead>Jumlah SN</TableHead>
                            <TableHead>Dibuat</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {initialTags.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={6}
                                    className="text-center text-muted-foreground py-8"
                                >
                                    Tidak ada data tag.
                                </TableCell>
                            </TableRow>
                        ) : (
                            initialTags.map((row) => (
                                <TableRow key={String(row.id_transaksi)}>
                                    <TableCell className="font-mono text-sm">
                                        {String(row.id_transaksi)}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">
                                            {TYPE_LABELS[String(row.type_transaksi)] ??
                                                String(row.type_transaksi)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{String(row.asal)}</TableCell>
                                    <TableCell>{String(row.tujuan)}</TableCell>
                                    <TableCell>{String(row.sn_count ?? 0)}</TableCell>
                                    <TableCell>
                                        {row.created_at
                                            ? new Date(String(row.created_at)).toLocaleString(
                                                  'id-ID',
                                                  {
                                                      day: '2-digit',
                                                      month: 'short',
                                                      year: 'numeric',
                                                      hour: '2-digit',
                                                      minute: '2-digit',
                                                  }
                                              )
                                            : '-'}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </Card>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-end gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={pagination.page <= 1}
                        onClick={() => {
                            const params = new URLSearchParams();
                            params.set('page', String(pagination.page - 1));
                            router.push(`/apps/nte-transaction/tag?${params.toString()}`);
                        }}
                    >
                        <Icon icon="lucide:chevron-left" className="w-4 h-4" />
                    </Button>
                    <span className="text-sm">
                        Halaman {pagination.page} dari {pagination.totalPages}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={pagination.page >= pagination.totalPages}
                        onClick={() => {
                            const params = new URLSearchParams();
                            params.set('page', String(pagination.page + 1));
                            router.push(`/apps/nte-transaction/tag?${params.toString()}`);
                        }}
                    >
                        <Icon icon="lucide:chevron-right" className="w-4 h-4" />
                    </Button>
                </div>
            )}

            {/* Create Dialog */}
            <Dialog open={isCreateOpen} onOpenChange={handleCreateOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Buat TAG WH-WH</DialogTitle>
                        <DialogDescription className="sr-only">
                            Form pembuatan transaksi tag material warehouse ke warehouse
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={onSubmit} className="flex flex-col gap-4">
                        {/* Subtype info banner */}
                        {subtype && (
                            <div
                                className={`rounded-md border px-3 py-2 text-sm ${
                                    subtype === 'check-to-check'
                                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                                        : subtype === 'check-to-nocheck'
                                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                                          : 'border-green-200 bg-green-50 text-green-700'
                                }`}
                            >
                                <strong>
                                    {subtype === 'check-to-check'
                                        ? 'Check → Check'
                                        : subtype === 'check-to-nocheck'
                                          ? 'Check → No-Check'
                                          : 'No-Check → Check'}
                                </strong>
                                {' — '}
                                {subtype === 'check-to-check'
                                    ? 'Validasi SN di asal, UPDATE address ke tujuan.'
                                    : subtype === 'check-to-nocheck'
                                      ? 'Validasi SN di asal, UPDATE address ke tujuan.'
                                      : 'Tidak validasi SN, INSERT new SN (butuh item_description).'}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1.5">
                                <Label>Asal</Label>
                                <SearchableSelect
                                    options={addressOptions.map((addr) => ({
                                        value: addr.address_name,
                                        label: addr.ui_label,
                                        description: addr.owner,
                                    }))}
                                    value={watchedAsal}
                                    onValueChange={(val) => setValue('asal', val)}
                                    placeholder="Pilih asal..."
                                    emptyText="Address tidak ditemukan."
                                />
                                {errors.asal && (
                                    <div className="text-xs text-destructive">
                                        {errors.asal.message}
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label>Tujuan</Label>
                                <SearchableSelect
                                    options={addressOptions.map((addr) => ({
                                        value: addr.address_name,
                                        label: addr.ui_label,
                                        description: addr.owner,
                                    }))}
                                    value={watchedTujuan}
                                    onValueChange={(val) => setValue('tujuan', val)}
                                    placeholder="Pilih tujuan..."
                                    emptyText="Address tidak ditemukan."
                                />
                                {errors.tujuan && (
                                    <p className="text-xs text-destructive">
                                        {errors.tujuan.message}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* nocheck-to-check: item description field */}
                        {isNocheckToCheck && (
                            <div className="flex flex-col gap-1.5">
                                <Label>Item Description (wajib untuk TAG masuk)</Label>
                                <SearchableSelect
                                    options={itemOptions.map((item) => ({
                                        value: item.item_description,
                                        label: `${item.type} — ${item.item_description}`,
                                    }))}
                                    value={nocheckToCheckItemDescription}
                                    onValueChange={setNocheckToCheckItemDescription}
                                    placeholder="Pilih item description..."
                                    emptyText="Item tidak ditemukan."
                                />
                            </div>
                        )}

                        {/* SN list input */}
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="manual-sn-input">
                                    Daftar SN ({watchedSnList.length})
                                </Label>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setIsMassUploadOpen(true)}
                                >
                                    <Icon icon="lucide:upload" className="w-4 h-4" />
                                    Upload .txt
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Ketik SN dan tekan Enter, atau upload file .txt (1 SN per baris).
                            </p>

                            <div className="flex gap-2">
                                <Input
                                    id="manual-sn-input"
                                    placeholder="Ketik SN..."
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            const input = e.currentTarget;
                                            const sn = input.value.trim();
                                            if (!sn) return;

                                            if (isNocheckToCheck) {
                                                if (!nocheckToCheckItemDescription) {
                                                    toast.error(
                                                        'Pilih item description terlebih dahulu.'
                                                    );
                                                    return;
                                                }
                                                const exists = snListNocheckToCheck.some(
                                                    (s) => s.serial_number === sn
                                                );
                                                if (exists) {
                                                    toast.error('SN sudah ada di daftar.');
                                                    return;
                                                }
                                                setSnListNocheckToCheck([
                                                    ...snListNocheckToCheck,
                                                    {
                                                        serial_number: sn,
                                                        item_description:
                                                            nocheckToCheckItemDescription,
                                                    },
                                                ]);
                                            } else {
                                                if (snListFlat.includes(sn)) {
                                                    toast.error('SN sudah ada di daftar.');
                                                    return;
                                                }
                                                setSnListFlat([...snListFlat, sn]);
                                            }

                                            input.value = '';
                                        }
                                    }}
                                />
                            </div>

                            {/* SN list display */}
                            {watchedSnList.length > 0 && (
                                <div className="border rounded-md p-2 max-h-48 overflow-y-auto flex flex-col gap-1">
                                    {isNocheckToCheck
                                        ? snListNocheckToCheck.map((item) => (
                                              <div
                                                  key={item.serial_number}
                                                  className="flex items-center justify-between text-sm bg-muted/30 px-2 py-1 rounded"
                                              >
                                                  <span className="font-mono">
                                                      {item.serial_number} —{' '}
                                                      <span className="text-muted-foreground text-xs">
                                                          {item.item_description}
                                                      </span>
                                                  </span>
                                                  <Button
                                                      type="button"
                                                      variant="ghost"
                                                      size="sm"
                                                      onClick={() =>
                                                          setSnListNocheckToCheck(
                                                              snListNocheckToCheck.filter(
                                                                  (sn) =>
                                                                      sn.serial_number !==
                                                                      item.serial_number
                                                              )
                                                          )
                                                      }
                                                  >
                                                      <Icon icon="lucide:x" className="w-3 h-3" />
                                                  </Button>
                                              </div>
                                          ))
                                        : snListFlat.map((sn, idx) => (
                                              <div
                                                  key={sn}
                                                  className="flex items-center justify-between text-sm bg-muted/30 px-2 py-1 rounded"
                                              >
                                                  <span className="font-mono">{sn}</span>
                                                  <Button
                                                      type="button"
                                                      variant="ghost"
                                                      size="sm"
                                                      onClick={() =>
                                                          setSnListFlat(
                                                              snListFlat.filter((_, i) => i !== idx)
                                                          )
                                                      }
                                                  >
                                                      <Icon icon="lucide:x" className="w-3 h-3" />
                                                  </Button>
                                              </div>
                                          ))}
                                </div>
                            )}
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => handleCreateOpen(false)}
                                disabled={isSubmitting}
                            >
                                Batal
                            </Button>
                            <Button
                                type="submit"
                                disabled={isSubmitting || watchedSnList.length === 0}
                            >
                                {isSubmitting ? 'Memproses...' : 'Buat TAG'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Mass Upload Dialog */}
            <Dialog open={isMassUploadOpen} onOpenChange={setIsMassUploadOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Upload File SN (.txt)</DialogTitle>
                        <DialogDescription className="sr-only">
                            Upload file text berisi daftar serial number NTE
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-3">
                        <p className="text-sm text-muted-foreground">
                            Upload file .txt dengan 1 SN per baris.
                        </p>
                        <Input
                            aria-label="Pilih file serial number TXT"
                            type="file"
                            accept=".txt"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleMassUploadFile(file);
                            }}
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
