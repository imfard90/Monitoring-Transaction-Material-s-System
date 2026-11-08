'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
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
import { updateNteAddressWarehouseMapping } from './actions';

export type Mapping = {
    address_name: string;
    owner: string;
    location_type: string;
    ui_label: string;
    mapping_mas_wh: number | null;
    check_sn: boolean;
};

export type Warehouse = { id: number; name: string };

type Props = { mappings: Mapping[]; warehouses: Warehouse[] };

export default function NteMappingTable({ mappings, warehouses }: Props) {
    const [rows, setRows] = useState(mappings);
    const [isPending, startTransition] = useTransition();

    function handleChange(addressName: string, value: string) {
        const warehouseId = value === 'unmapped' ? null : Number(value);
        const previous =
            rows.find((row) => row.address_name === addressName)?.mapping_mas_wh ?? null;
        setRows((current) =>
            current.map((row) =>
                row.address_name === addressName ? { ...row, mapping_mas_wh: warehouseId } : row
            )
        );

        startTransition(async () => {
            try {
                const result = await updateNteAddressWarehouseMapping({ addressName, warehouseId });
                if (!result.success) {
                    setRows((current) =>
                        current.map((row) =>
                            row.address_name === addressName
                                ? { ...row, mapping_mas_wh: previous }
                                : row
                        )
                    );
                    toast.error(result.error);
                    return;
                }
                toast.success('Mapping gudang berhasil diperbarui.');
            } catch {
                setRows((current) =>
                    current.map((row) =>
                        row.address_name === addressName
                            ? { ...row, mapping_mas_wh: previous }
                            : row
                    )
                );
                toast.error('Mapping gagal disimpan. Silakan coba kembali.');
            }
        });
    }

    return (
        <section className="rounded-lg border bg-card shadow-sm">
            <div className="border-b px-5 py-4">
                <h2 className="font-semibold">Pemetaan alamat NTE ke gudang MTMS</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    Pilih gudang untuk setiap alamat, atau pilih “Tidak dipetakan” untuk
                    mengosongkan mapping.
                </p>
            </div>
            {rows.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">Belum ada data alamat NTE.</p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Alamat</TableHead>
                            <TableHead>Pemilik</TableHead>
                            <TableHead>Jenis lokasi</TableHead>
                            <TableHead>Validasi SN</TableHead>
                            <TableHead>Gudang MTMS</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row) => (
                            <TableRow key={row.address_name}>
                                <TableCell>
                                    <div className="font-medium">{row.ui_label}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {row.address_name}
                                    </div>
                                </TableCell>
                                <TableCell className="uppercase">{row.owner}</TableCell>
                                <TableCell>{row.location_type}</TableCell>
                                <TableCell>{row.check_sn ? 'Aktif' : 'Nonaktif'}</TableCell>
                                <TableCell>
                                    <Select
                                        value={
                                            row.mapping_mas_wh === null
                                                ? 'unmapped'
                                                : String(row.mapping_mas_wh)
                                        }
                                        onValueChange={(value) =>
                                            handleChange(row.address_name, value)
                                        }
                                        disabled={isPending}
                                    >
                                        <SelectTrigger
                                            aria-label={`Gudang untuk ${row.ui_label}`}
                                            className="w-full min-w-48"
                                        >
                                            <SelectValue placeholder="Pilih gudang" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="unmapped">
                                                Tidak dipetakan
                                            </SelectItem>
                                            {warehouses.map((warehouse) => (
                                                <SelectItem
                                                    key={warehouse.id}
                                                    value={String(warehouse.id)}
                                                >
                                                    {warehouse.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </section>
    );
}
