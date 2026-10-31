'use client';

import { useMemo } from 'react';
import {
    LensaLiveDetailDialog,
    type LensaLiveDetailMaterialItem,
    type LensaLiveDetailMetadataItem,
} from '@/components/domain/reference/LensaLiveDetailDialog';
import type { ScrapedWODetailResult, WOPemakaianOption } from '../_actions/wo-lensa-actions';

interface WOLensaLiveDetailDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    options: WOPemakaianOption[];
    selectedId: string;
    onSelectId: (id: string) => void;
    onRunScrape: () => void;
    busy: boolean;
    result: ScrapedWODetailResult | null;
}

export function WOLensaLiveDetailDialog({
    open,
    onOpenChange,
    options,
    selectedId,
    onSelectId,
    onRunScrape,
    busy,
    result,
}: WOLensaLiveDetailDialogProps) {
    const metadata: LensaLiveDetailMetadataItem[] = useMemo(() => {
        if (!result) return [];
        return [
            { label: 'Pemakaian ID', value: result.pemakaian_id },
            { label: 'Nomor WO', value: result.wo_number },
            { label: 'Tipe', value: result.type },
            { label: 'Gudang', value: result.nama_gudang },
        ];
    }, [result]);

    const materials: LensaLiveDetailMaterialItem[] = useMemo(() => {
        if (!result?.materials) return [];
        return result.materials.map((m) => ({
            material_id: m.material_id,
            material_desc: m.material_desc,
            uom: m.uom,
            quantity: m.qty_pemakaian,
        }));
    }, [result]);

    return (
        <LensaLiveDetailDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Tarik Detail WO Lensa Langsung"
            description="Pilih nomor pemakaian atau ketik nomor pemakaian / nomor WO langsung untuk mengambil rincian material dari sistem Lensa."
            idLabel="Pemakaian ID / No WO"
            idPlaceholder="Contoh: 12345678 atau INC12345678"
            options={options}
            selectedId={selectedId}
            onSelectId={onSelectId}
            onRunScrape={onRunScrape}
            busy={busy}
            metadata={metadata}
            materials={materials}
            quantityHeader="Qty Pemakaian"
            hasResult={Boolean(result)}
        />
    );
}
