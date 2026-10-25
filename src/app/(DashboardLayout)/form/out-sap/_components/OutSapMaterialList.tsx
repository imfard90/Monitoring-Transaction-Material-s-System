'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { SearchableSelect } from '@/app/components/shared/SearchableSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import type { OutSapFormItem } from '@/lib/types/inventory';

interface OutSapMaterialListProps {
    items: OutSapFormItem[];
    setItems: React.Dispatch<React.SetStateAction<OutSapFormItem[]>>;
    materials: Record<string, unknown>[];
    isFetchingMaterials: boolean;
    isScraped: boolean;
    warehouseId: string;
    idReservasi: string;
    sapNumber: string;
    checkItemError: (item: OutSapFormItem) => boolean;
}

export function OutSapMaterialList({
    items,
    setItems,
    materials,
    isFetchingMaterials,
    isScraped,
    warehouseId,
    idReservasi,
    sapNumber,
    checkItemError,
}: OutSapMaterialListProps) {
    const handleAddItem = () => {
        setItems((prev) => [...prev, { id: crypto.randomUUID(), designator_id: '', qty_req: '' }]);
    };

    const handleRemoveItem = (index: number) => {
        setItems((prev) => prev.filter((_, i) => i !== index));
    };

    const handleItemChange = (index: number, field: string, value: string | number | null) => {
        setItems((prev) => {
            const newItems = [...prev];
            newItems[index] = { ...newItems[index], [field]: value };
            return newItems;
        });
    };

    const isAddDisabled =
        !warehouseId ||
        !idReservasi.trim() ||
        !sapNumber.trim() ||
        isScraped;

    return (
        <StaggerItem className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">Daftar Material</h3>
                <motion.div
                    whileHover={isAddDisabled ? {} : { scale: 1.02 }}
                    whileTap={isAddDisabled ? {} : { scale: 0.95 }}
                >
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddItem}
                        className="gap-2"
                        disabled={isAddDisabled}
                    >
                        <Plus size={16} /> Tambah Material
                    </Button>
                </motion.div>
            </div>

            {items.length === 0 ? (
                <div
                    className="text-center p-8 border border-dashed rounded-md text-muted-foreground bg-muted/50"
                    role="status"
                >
                    Belum ada material yang ditambahkan. Klik Tambah Material untuk memilih material.
                </div>
            ) : (
                <div className="space-y-3">
                    <AnimatePresence>
                        {items.map((item, index) => {
                            const isError = checkItemError(item);
                            const selectedMat = materials.find(
                                (m: Record<string, unknown>) =>
                                    m.id?.toString() === item.designator_id
                            );
                            const errorReason = item.designator_id
                                ? selectedMat
                                    ? Number(item.qty_req) > Number(selectedMat.qty)
                                        ? `Stok tidak mencukupi (Tersedia: ${selectedMat.qty})`
                                        : ''
                                    : 'Material tidak ditemukan di gudang atau stok habis'
                                : 'Material belum dipilih';

                            return (
                                <motion.div
                                    key={item.id || index}
                                    initial={{
                                        opacity: 0,
                                        height: 0,
                                        scale: 0.95,
                                        overflow: 'hidden',
                                    }}
                                    animate={{
                                        opacity: 1,
                                        height: 'auto',
                                        scale: 1,
                                        overflow: 'visible',
                                    }}
                                    exit={{
                                        opacity: 0,
                                        height: 0,
                                        scale: 0.9,
                                        overflow: 'hidden',
                                        margin: 0,
                                        padding: 0,
                                    }}
                                    transition={{ duration: 0.3 }}
                                    className={`flex flex-col sm:flex-row sm:items-end gap-3 p-4 border rounded-md transition-colors ${
                                        isError && !isFetchingMaterials
                                            ? 'bg-error/10 border-error/50'
                                            : 'bg-muted/50'
                                    }`}
                                >
                                    <div className="flex-1 space-y-2">
                                        <Label className="text-xs flex gap-2">
                                            Material *
                                            <AnimatePresence>
                                                {isError && !isFetchingMaterials && (
                                                    <motion.span
                                                        initial={{ opacity: 0, width: 0 }}
                                                        animate={{ opacity: 1, width: 'auto' }}
                                                        exit={{ opacity: 0, width: 0 }}
                                                        className="text-destructive font-medium whitespace-nowrap overflow-hidden"
                                                    >
                                                        ({errorReason})
                                                    </motion.span>
                                                )}
                                            </AnimatePresence>
                                        </Label>
                                        <SearchableSelect
                                            options={materials.map(
                                                (m: Record<string, unknown>) => ({
                                                    value: m.id?.toString() || '',
                                                    label: `${m.code} - ${m.description} (Stock: ${m.qty})`,
                                                })
                                            )}
                                            value={item.designator_id.toString()}
                                            onValueChange={(v) =>
                                                handleItemChange(index, 'designator_id', v)
                                            }
                                            placeholder={
                                                isScraped && item.designator_id
                                                    ? 'Material terpilih'
                                                    : 'Pilih Material'
                                            }
                                            disabled={isScraped}
                                        />
                                    </div>

                                    <div className="w-full sm:w-32 space-y-2">
                                        <Label className="text-xs">Jumlah *</Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            placeholder="0"
                                            disabled={isScraped}
                                            value={
                                                item.qty_req === 0 || item.qty_req.toString() === ''
                                                    ? ''
                                                    : item.qty_req
                                            }
                                            onChange={(e) => {
                                                let val: string | number =
                                                    e.target.value === ''
                                                        ? ''
                                                        : parseInt(e.target.value, 10);

                                                if (
                                                    typeof val === 'number' &&
                                                    selectedMat &&
                                                    val > (selectedMat.qty as number)
                                                ) {
                                                    val = selectedMat.qty as number;
                                                    toast.error(
                                                        `Jumlah maksimal adalah ${selectedMat.qty}`
                                                    );
                                                }

                                                handleItemChange(index, 'qty_req', val);
                                            }}
                                            className={
                                                isError && !isFetchingMaterials
                                                    ? 'border-error/50 focus-visible:ring-error/30 bg-error/10'
                                                    : ''
                                            }
                                        />
                                    </div>

                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleRemoveItem(index)}
                                        disabled={isScraped}
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10 mt-2 sm:mt-0"
                                    >
                                        <Trash2 size={16} />
                                    </Button>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}
        </StaggerItem>
    );
}
