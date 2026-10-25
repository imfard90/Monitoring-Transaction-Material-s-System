'use client';

import { motion } from 'framer-motion';
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

interface OutSapHeaderFieldsProps {
    formData: OutSapFormData;
    setFormData: React.Dispatch<React.SetStateAction<OutSapFormData>>;
    isScraping: boolean;
    isScraped: boolean;
    onGetData: () => void;
    technicians: Record<string, unknown>[];
    warehouses: Record<string, unknown>[];
    branches: Record<string, unknown>[];
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
}: OutSapHeaderFieldsProps) {
    return (
        <div>
            <h2 className="text-lg font-bold text-foreground mb-4 border-b border-border/70 pb-3">
                Form Out SAP (Pengeluaran Material)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StaggerItem className="space-y-2">
                    <Label>Request ID</Label>
                    <div className="flex gap-2">
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
                            disabled={isScraped}
                        />
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
                                onClick={onGetData}
                                disabled={
                                    isScraping || !formData.request_id || isScraped
                                }
                                className="whitespace-nowrap w-full h-full"
                            >
                                {isScraping ? 'Memuat data...' : 'Ambil Data'}
                            </Button>
                        </motion.div>
                    </div>
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
                        disabled={!formData.name_sa || isScraped}
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
                        disabled={!formData.request_id || isScraped}
                    />
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
                        disabled={!formData.nik_teknisi || isScraped}
                    />
                </StaggerItem>

                <StaggerItem className="space-y-2">
                    <Label>ID Reservasi *</Label>
                    <Input
                        value={formData.id_reservasi}
                        onChange={(e) =>
                            setFormData((prev) => ({
                                ...prev,
                                id_reservasi: e.target.value,
                            }))
                        }
                        disabled={!formData.warehouse_id || isScraped}
                    />
                </StaggerItem>

                <StaggerItem className="space-y-2">
                    <Label>Nomor SAP *</Label>
                    <Input
                        value={formData.sap_number}
                        onChange={(e) =>
                            setFormData((prev) => ({ ...prev, sap_number: e.target.value }))
                        }
                        disabled={!formData.warehouse_id || isScraped}
                    />
                </StaggerItem>
            </div>
        </div>
    );
}
