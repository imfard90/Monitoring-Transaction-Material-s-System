'use client';

import { useMemo } from 'react';
import {
    LensaLiveDetailDialog,
    type LensaLiveDetailMaterialItem,
    type LensaLiveDetailMetadataItem,
} from '@/components/domain/reference/LensaLiveDetailDialog';
import type {
    OutLensaReservationOption,
    ScrapedOutLensaDetailResult,
} from '../_actions/out-lensa-actions';

interface OutLensaLiveDetailDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    options: OutLensaReservationOption[];
    selectedId: string;
    onSelectId: (id: string) => void;
    onRunScrape: () => void;
    busy: boolean;
    result: ScrapedOutLensaDetailResult | null;
}

export function OutLensaLiveDetailDialog({
    open,
    onOpenChange,
    options,
    selectedId,
    onSelectId,
    onRunScrape,
    busy,
    result,
}: OutLensaLiveDetailDialogProps) {
    const metadata: LensaLiveDetailMetadataItem[] = useMemo(() => {
        if (!result) return [];
        return [
            { label: 'Reservasi ID', value: result.reservation_id },
            { label: 'Nomor GI', value: result.gi_number },
            { label: 'Mitra', value: result.mitra },
            { label: 'Gudang', value: result.nama_gudang },
        ];
    }, [result]);

    const materials: LensaLiveDetailMaterialItem[] = useMemo(() => {
        if (!result?.materials) return [];
        return result.materials.map((m) => ({
            material_id: m.material_id,
            material_desc: m.material_desc,
            quantity: m.qty_approve,
        }));
    }, [result]);

    return (
        <LensaLiveDetailDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Tarik Detail Out Lensa Langsung"
            description="Pilih nomor reservasi atau ketik langsung untuk mengambil rincian material dari sistem Lensa jika data belum tertarik otomatis."
            idLabel="Nomor Reservasi"
            idPlaceholder="Contoh: 202410150001"
            options={options}
            selectedId={selectedId}
            onSelectId={onSelectId}
            onRunScrape={onRunScrape}
            busy={busy}
            metadata={metadata}
            materials={materials}
            quantityHeader="Qty Approve"
            hasResult={Boolean(result)}
        />
    );
}
