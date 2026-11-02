import { useCallback, useMemo } from 'react';
import type { RekonLensaItemPayload } from '@/app/(DashboardLayout)/form/rekon-lensa/_actions/rekon-lensa-actions';

export interface TechnicianMaterialItem {
    sap_out_id: number | string;
    sap_out_item_id: number | string;
    sap_number?: string | null;
    name_sa?: string;
    name_wh?: string | null;
    designator_id: number;
    material_code?: string | null;
    material_name?: string | null;
    qty_req: number;
    qty_used?: number | null;
}

export interface WoLensaItem {
    material_id?: string | null;
    qty_pemakaian?: number | null;
    uom?: string | null;
}

export interface WoLensaRecord {
    id: string | number;
    wo_type?: string | null;
    wo_number?: string | null;
    pemakaian_id?: string | number | null;
    tanggal_update?: string | null;
    items?: WoLensaItem[];
}

export interface WoSufficiencyItem {
    code: string;
    required: number;
    available: number;
    uom?: string;
    isOk: boolean;
}

export interface WoSufficiencyResult {
    isReady: boolean;
    items: WoSufficiencyItem[];
    totalAllocated: number;
}

export interface UseMaterialFifoAllocationProps {
    selectedWos: Set<string | number>;
    materialsData?: TechnicianMaterialItem[];
    wosData?: WoLensaRecord[];
}

/**
 * 1. Calculate available stock per material code in technician's possession.
 */
export function calculateAvailableStockByCode(
    materialsData: TechnicianMaterialItem[] = []
): Record<string, number> {
    const map: Record<string, number> = {};
    for (const m of materialsData) {
        const code = m.material_code;
        if (code) {
            const available = Number(m.qty_req || 0) - Number(m.qty_used || 0);
            map[code] = (map[code] || 0) + Math.max(0, available);
        }
    }
    return map;
}

/**
 * 2. FIFO Auto-Allocation per sap_out_item_id.
 * Iterates through materials in SAP Out creation order and allocates up to required qty.
 */
export function calculateFifoAllocation(
    selectedWos: Set<string | number>,
    materialsData: TechnicianMaterialItem[] = [],
    wosData: WoLensaRecord[] = []
): Record<string, number> {
    const newAllocated: Record<string, number> = {};
    if (selectedWos.size === 0 || !materialsData.length || !wosData.length) {
        return newAllocated;
    }

    // Sum requirements across all selected WOs
    const requiredPerMaterial: Record<string, number> = {};
    for (const wo of wosData) {
        if ((selectedWos.has(wo.id) || selectedWos.has(String(wo.id))) && Array.isArray(wo.items)) {
            for (const item of wo.items) {
                const code = item.material_id;
                if (code) {
                    requiredPerMaterial[code] =
                        (requiredPerMaterial[code] || 0) + Number(item.qty_pemakaian || 0);
                }
            }
        }
    }

    const remainingReq = { ...requiredPerMaterial };

    for (const mat of materialsData) {
        const code = mat.material_code;
        const available = Number(mat.qty_req || 0) - Number(mat.qty_used || 0);
        const key = String(mat.sap_out_item_id);

        if (code && (remainingReq[code] || 0) > 0 && available > 0) {
            const toAllocate = Math.min(remainingReq[code], available);
            newAllocated[key] = toAllocate;
            remainingReq[code] -= toAllocate;
        } else {
            newAllocated[key] = 0;
        }
    }

    return newAllocated;
}

/**
 * 3. Evaluate whether available stock covers selected WO requirements.
 */
export function calculateWoSufficiency(
    selectedWo: WoLensaRecord | null,
    availableStockByCode: Record<string, number>
): WoSufficiencyResult {
    if (!selectedWo || !Array.isArray(selectedWo.items)) {
        return { isReady: false, items: [], totalAllocated: 0 };
    }

    let allOk = true;
    let totalQty = 0;

    const items: WoSufficiencyItem[] = selectedWo.items.map((item) => {
        const code = item.material_id || '';
        const available = availableStockByCode[code] || 0;
        const required = Number(item.qty_pemakaian || 0);
        const isOk = available >= required;
        if (!isOk) allOk = false;
        totalQty += required;

        return {
            code,
            required,
            available,
            uom: item.uom || undefined,
            isOk,
        };
    });

    return {
        isReady: allOk && items.length > 0,
        items,
        totalAllocated: totalQty,
    };
}

/**
 * 4. Validation helper before submit.
 */
export function validateAllocationSufficiency(
    selectedWos: Set<string | number>,
    materialsData: TechnicianMaterialItem[] = [],
    wosData: WoLensaRecord[] = [],
    allocatedQty: Record<string, number> = {}
): { isValid: boolean; errorMessage?: string } {
    if (selectedWos.size === 0) {
        return { isValid: false, errorMessage: 'Pilih minimal 1 WO Lensa untuk direkon' };
    }

    const requiredPerMaterial: Record<string, number> = {};
    for (const wo of wosData) {
        if ((selectedWos.has(wo.id) || selectedWos.has(String(wo.id))) && Array.isArray(wo.items)) {
            for (const item of wo.items) {
                const code = item.material_id;
                if (code) {
                    requiredPerMaterial[code] =
                        (requiredPerMaterial[code] || 0) + Number(item.qty_pemakaian || 0);
                }
            }
        }
    }

    const allocatedPerMaterial: Record<string, number> = {};
    for (const mat of materialsData) {
        const code = mat.material_code;
        if (code) {
            const key = String(mat.sap_out_item_id);
            allocatedPerMaterial[code] =
                (allocatedPerMaterial[code] || 0) + (allocatedQty[key] || 0);
        }
    }

    for (const code in requiredPerMaterial) {
        if ((requiredPerMaterial[code] || 0) > (allocatedPerMaterial[code] || 0)) {
            return {
                isValid: false,
                errorMessage: `Stok material ${code} di tangan teknisi tidak mencukupi untuk WO yang dipilih.`,
            };
        }
    }

    return { isValid: true };
}

/**
 * 5. Construct atomic payload for Rekon Lensa Stored Procedure.
 */
export function buildRekonPayload(
    selectedWo: WoLensaRecord | null,
    materialsData: TechnicianMaterialItem[] = [],
    allocatedQty: Record<string, number> = {}
): RekonLensaItemPayload[] {
    if (!selectedWo) return [];

    const payload: RekonLensaItemPayload[] = [];

    for (const mat of materialsData) {
        const key = String(mat.sap_out_item_id);
        const qtyToUse = allocatedQty[key] || 0;

        if (qtyToUse > 0) {
            payload.push({
                sap_out_id: String(mat.sap_out_id),
                sap_number: mat.sap_number ?? null,
                name_sa: mat.name_sa || '',
                name_wh: mat.name_wh ?? null,
                designator_id: Number(mat.designator_id),
                sap_out_item_id: String(mat.sap_out_item_id),
                qty: qtyToUse,
                wo_type: selectedWo.wo_type || '',
                wo_number: selectedWo.wo_number || '',
                pemakaian_id: selectedWo.pemakaian_id ? String(selectedWo.pemakaian_id) : '',
                notes: `Rekon Lensa WO ${selectedWo.wo_number || ''}`,
            });
        }
    }

    return payload;
}

/**
 * Pure domain hook managing FIFO stock allocation for Rekon Lensa.
 * Decouples complex multi-step matching algorithms from presentation components.
 */
export function useMaterialFifoAllocation({
    selectedWos,
    materialsData = [],
    wosData = [],
}: UseMaterialFifoAllocationProps) {
    const availableStockByCode = useMemo(() => {
        return calculateAvailableStockByCode(materialsData);
    }, [materialsData]);

    const allocatedQty = useMemo(() => {
        return calculateFifoAllocation(selectedWos, materialsData, wosData);
    }, [selectedWos, materialsData, wosData]);

    const selectedWo = useMemo(() => {
        if (selectedWos.size === 0 || !wosData.length) return null;
        const woId = Array.from(selectedWos)[0];
        return wosData.find((w) => String(w.id) === String(woId) || w.id === woId) || null;
    }, [selectedWos, wosData]);

    const woSufficiency = useMemo(() => {
        return calculateWoSufficiency(selectedWo, availableStockByCode);
    }, [selectedWo, availableStockByCode]);

    const validateAllocation = useCallback(() => {
        return validateAllocationSufficiency(selectedWos, materialsData, wosData, allocatedQty);
    }, [selectedWos, materialsData, wosData, allocatedQty]);

    const createPayload = useCallback(() => {
        return buildRekonPayload(selectedWo, materialsData, allocatedQty);
    }, [selectedWo, materialsData, allocatedQty]);

    return {
        availableStockByCode,
        allocatedQty,
        selectedWo,
        woSufficiency,
        validateAllocationSufficiency: validateAllocation,
        buildRekonPayload: createPayload,
        buildFifoPayload: createPayload,
    };
}
