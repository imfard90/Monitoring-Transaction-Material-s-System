'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { SearchableSelect } from '@/app/components/shared/SearchableSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StaggerItem } from '@/components/ui/motion/stagger-item';

export interface OutSapFormData {
    nik_teknisi: string;
    name_sa: string;
    warehouse_id: string;
    id_reservasi: string;
    sap_number: string;
    request_id: string;
}

export interface AdminReservationOption {
    value: string;
    label: string;
    gi_number: string | null;
    nama_gudang: string | null;
    is_processed: boolean;
}

interface OutSapHeaderFieldsProps {
    formData: OutSapFormData;
    setFormData: React.Dispatch<React.SetStateAction<OutSapFormData>>;
    isScraping: boolean;
    isScraped: boolean;
    onGetData: (customRequestId?: string) => void;
    technicians: Record<string, unknown>[];
    warehouses: Record<string, unknown>[];
    branches: Record<string, unknown>[];
    isStaff?: boolean;
    adminReservationOptions?: AdminReservationOption[];
}

export function OutSapHeaderFields({
    formData,
    setFormData,
    isScraping,
    isScraped,
    onGetData,
    technicians,
    warehouses,
    branches,
    isStaff = false,
    adminReservationOptions = [],
}: OutSapHeaderFieldsProps) {
    const hasAdminOptions = !isStaff && adminReservationOptions.length > 0;
    const [isManualInput, setIsManualInput] = useState(false);

    return (
        <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 border-b border-border/70 gap-2">
                <h2 className="text-lg font-bold text-foreground">
                    Form Out SAP (Pengeluaran Material)
                </h2>
                {isStaff && warehouses.length > 0 && (
                    <span className="text-xs px-2.5 py-1 rounded-md bg-primary/10 text-primary font-medium w-fit">
                        Gudang Anda:{' '}
                        {(warehouses.find((w) => String(w.id) === formData.warehouse_id)?.name as string) ||
                            (warehouses[0]?.name as string)}
                    </span>
                )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StaggerItem className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label>Request ID (Lensa) *</Label>
                        {hasAdminOptions && !isScraped && (
                            <button
                                type="button"
                                onClick={() => setIsManualInput((prev) => !prev)}
                                className="text-xs text-primary hover:underline font-medium focus:outline-none transition-colors"
                            >
                                {isManualInput ? 'Pilih dari Out Lensa Ref' : 'Ketik Manual'}
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {hasAdminOptions && !isManualInput ? (
                            <div className="flex-1 min-w-0">
                                <SearchableSelect
                                    options={adminReservationOptions.map((opt) => ({
                                        value: opt.value,
                                        label: opt.label,
                                    }))}
                                    value={formData.request_id}
                                    onValueChange={(val) => {
                                        setFormData((prev) => ({
                                            ...prev,
                                            request_id: val,
                                        }));
                                    }}
                                    placeholder="Pilih ID Reservasi Lensa..."
                                    disabled={isScraped || isScraping}
                                />
                            </div>
                        ) : (
                            <Input
                                value={formData.request_id}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        request_id: e.target.value,
                                    })
                                }
                                placeholder="Masukkan Request ID Lensa..."
                                className="flex-1"
                                disabled={isScraped || isScraping}
                            />
                        )}
                        <motion.div
                            whileHover={
                                isScraping || !formData.request_id || isScraped
                                    ? {}
                                    : { scale: 1.02 }
                            }
                            whileTap={
                                isScraping || !formData.request_id || isScraped
                                    ? {}
                                    : { scale: 0.95 }
                            }
                        >
                            <Button
                                type="button"
                                onClick={() => onGetData()}
                                disabled={isScraping || !formData.request_id || isScraped}
                                className="whitespace-nowrap w-full h-full"
                            >
                                {isScraping ? 'Memuat data...' : 'Ambil Data'}
                            </Button>
                        </motion.div>
                    </div>
                    {hasAdminOptions && !isManualInput && (
                        <p className="text-[11px] text-muted-foreground">
                            Pilih reservasi dari database Out Lensa Ref atau klik 'Ketik Manual' di atas.
                        </p>
                    )}
                </StaggerItem>

                <StaggerItem className="space-y-2">
                    <Label>Dari Gudang *</Label>
                    <SearchableSelect
                        options={warehouses.map((w: Record<string, unknown>) => ({
                            value: w.id?.toString() || '',
                            label: w.name as string,
                        }))}
                        value={formData.warehouse_id}
                        onValueChange={(v) =>
                            setFormData((prev) => ({ ...prev, warehouse_id: v }))
                        }
                        placeholder="Pilih Gudang"
                        disabled={(isStaff && warehouses.length <= 1) || isScraped}
                    />
                </StaggerItem>

                <StaggerItem className="space-y-2">
                    <Label>Area (SA)</Label>
                    <SearchableSelect
                        options={branches.map((b: Record<string, unknown>) => ({
                            value: b.service_area as string,
                            label: b.service_area as string,
                        }))}
                        value={formData.name_sa}
                        onValueChange={(v) => {
                            setFormData((prev) => ({
                                ...prev,
                                name_sa: v,
                                nik_teknisi: '',
                            }));
                        }}
                        placeholder="Pilih Area"
                        disabled={isScraped}
                    />
                </StaggerItem>

                <StaggerItem className="space-y-2">
                    <Label>Teknisi *</Label>
                    <SearchableSelect
                        options={technicians.map((t: Record<string, unknown>) => ({
                            value: String(t.nik),
                            label: `${t.name} (${t.nik})`,
                        }))}
                        value={String(formData.nik_teknisi)}
                        onValueChange={(nik) =>
                            setFormData((prev) => ({ ...prev, nik_teknisi: nik }))
                        }
                        placeholder={
                            isScraped && formData.nik_teknisi
                                ? 'Teknisi terpilih'
                                : 'Pilih Teknisi'
                        }
                        disabled={isScraped}
                    />
                </StaggerItem>

                <StaggerItem className="space-y-2">
                    <Label>Nomor SAP (GI Number) *</Label>
                    <Input
                        value={formData.sap_number}
                        onChange={(e) =>
                            setFormData((prev) => ({ ...prev, sap_number: e.target.value }))
                        }
                        placeholder="Nomor Goods Issue / SAP"
                        disabled={isScraped}
                    />
                </StaggerItem>

                <StaggerItem className="space-y-2">
                    <Label>ID Reservasi SAP *</Label>
                    <Input
                        value={formData.id_reservasi}
                        onChange={(e) =>
                            setFormData((prev) => ({
                                ...prev,
                                id_reservasi: e.target.value,
                            }))
                        }
                        placeholder="Nomor Reservasi SAP"
                        disabled={isScraped}
                    />
                </StaggerItem>
            </div>
        </div>
    );
}
