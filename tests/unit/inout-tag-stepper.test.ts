import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(DashboardLayout)/apps/inout-tag/_actions/tag-actions', () => ({
    getInOutTagItems: vi.fn(),
    getReturnMaterialItemsByHeaderId: vi.fn(),
}));

import {
    formatStepDate,
    getTimelineSteps,
} from '@/app/(DashboardLayout)/apps/inout-tag/_components/InOutTagDetailModal';
import type { InOutTagRow } from '@/lib/types/inventory';

describe('InOutTagDetailModal - Timeline / Stepper logic', () => {
    it('returns empty array when row is null', () => {
        expect(getTimelineSteps(null)).toEqual([]);
    });

    describe('formatStepDate', () => {
        it('formats valid Date or string correctly', () => {
            const dateStr = '2026-10-27T10:30:00.000Z';
            const formatted = formatStepDate(dateStr);
            expect(formatted).not.toBe('-');
            expect(formatted).toMatch(/2026/);
        });

        it('returns "-" for null, undefined, or invalid date string', () => {
            expect(formatStepDate(null)).toBe('-');
            expect(formatStepDate(undefined)).toBe('-');
            expect(formatStepDate('invalid-date-xyz')).toBe('-');
        });
    });

    describe('InOut Tag flow (3 stages: Permintaan -> Pengiriman -> Penerimaan)', () => {
        const baseInOutRow: InOutTagRow = {
            id: 101,
            id_trx: 'TRX-TAG-001',
            request_id: 'REQ-101',
            send_id: null,
            accept_id: null,
            end_status: 'requested',
            request_time: '2026-10-27T08:00:00.000Z',
            name_vendor: null,
            from_wh_name: 'Gudang Utama',
            to_wh_name: 'Gudang Transit',
            type: 'inout',
            created_by: '906627',
            created_by_name: 'IMAM FARDI',
            nik_send: null,
            send_by_name: null,
            send_time: null,
            nik_accept: null,
            accept_by_name: null,
            accept_time: null,
            notes: null,
        };

        it('handles "requested" status: Step 1 completed, Step 2 active, Step 3 pending', () => {
            const steps = getTimelineSteps(baseInOutRow);
            expect(steps).toHaveLength(3);

            // Step 1: Permintaan
            expect(steps[0].id).toBe('request');
            expect(steps[0].title).toBe('Permintaan');
            expect(steps[0].status).toBe('completed');
            expect(steps[0].nik).toBe('906627');
            expect(steps[0].name).toBe('IMAM FARDI');
            expect(steps[0].actionId).toBe('REQ-101');

            // Step 2: Pengiriman (waiting)
            expect(steps[1].id).toBe('send');
            expect(steps[1].title).toBe('Pengiriman');
            expect(steps[1].status).toBe('active');
            expect(steps[1].statusLabel).toBe('Menunggu Pengiriman');

            // Step 3: Penerimaan (pending)
            expect(steps[2].id).toBe('accept');
            expect(steps[2].title).toBe('Penerimaan');
            expect(steps[2].status).toBe('pending');
        });

        it('handles "in_transit" status with send_id: Step 1 & 2 completed, Step 3 active', () => {
            const row: InOutTagRow = {
                ...baseInOutRow,
                end_status: 'in_transit',
                send_id: 'SND-202',
                nik_send: '908888',
                send_by_name: 'BUDI DRIVER',
                send_time: '2026-10-27T09:15:00.000Z',
            };

            const steps = getTimelineSteps(row);
            expect(steps).toHaveLength(3);

            expect(steps[0].status).toBe('completed');
            expect(steps[1].status).toBe('completed');
            expect(steps[1].actionId).toBe('SND-202');
            expect(steps[1].nik).toBe('908888');
            expect(steps[1].name).toBe('BUDI DRIVER');

            expect(steps[2].status).toBe('active');
            expect(steps[2].statusLabel).toBe('Dalam Perjalanan');
        });

        it('handles "closed" status: all 3 steps completed', () => {
            const row: InOutTagRow = {
                ...baseInOutRow,
                end_status: 'closed',
                send_id: 'SND-202',
                nik_send: '908888',
                send_by_name: 'BUDI DRIVER',
                send_time: '2026-10-27T09:15:00.000Z',
                accept_id: 'ACC-303',
                nik_accept: '907777',
                accept_by_name: 'SITI GUDANG',
                accept_time: '2026-10-27T10:45:00.000Z',
            };

            const steps = getTimelineSteps(row);
            expect(steps).toHaveLength(3);

            expect(steps[0].status).toBe('completed');
            expect(steps[1].status).toBe('completed');
            expect(steps[2].status).toBe('completed');
            expect(steps[2].actionId).toBe('ACC-303');
            expect(steps[2].nik).toBe('907777');
            expect(steps[2].name).toBe('SITI GUDANG');
        });

        it('handles cancellation before send: Step 1 completed, Step 2 cancelled with parsed NIK, Step 3 pending', () => {
            const row: InOutTagRow = {
                ...baseInOutRow,
                end_status: 'cancel',
                notes: '[BATAL - 906627]: Salah permintaan stok material',
            };

            const steps = getTimelineSteps(row);
            expect(steps).toHaveLength(3);

            expect(steps[0].status).toBe('completed');
            expect(steps[1].status).toBe('cancelled');
            expect(steps[1].statusLabel).toBe('Dibatalkan');
            expect(steps[1].nik).toBe('906627');

            expect(steps[2].status).toBe('pending');
            expect(steps[2].statusLabel).toBe('Tidak Diproses');
        });

        it('handles cancellation after send: Step 1 & 2 completed, Step 3 cancelled with parsed NIK', () => {
            const row: InOutTagRow = {
                ...baseInOutRow,
                end_status: 'cancel',
                send_id: 'SND-202',
                nik_send: '908888',
                send_by_name: 'BUDI DRIVER',
                send_time: '2026-10-27T09:15:00.000Z',
                notes: '[BATAL - 909999]: Barang rusak dalam perjalanan saat pengiriman',
            };

            const steps = getTimelineSteps(row);
            expect(steps).toHaveLength(3);

            expect(steps[0].status).toBe('completed');
            expect(steps[1].status).toBe('completed');
            expect(steps[2].status).toBe('cancelled');
            expect(steps[2].statusLabel).toBe('Dibatalkan');
            expect(steps[2].nik).toBe('909999');
        });
    });

    describe('Return Material flow (2 stages: Pengajuan Return -> Penerimaan Gudang)', () => {
        const baseReturnRow: InOutTagRow = {
            id: 201,
            id_trx: 'RET-MATERIAL-001',
            request_id: null,
            send_id: null,
            accept_id: null,
            end_status: 'requested',
            request_time: '2026-10-27T07:30:00.000Z',
            name_vendor: null,
            from_wh_name: 'Technician: TEKNISI JOKO',
            to_wh_name: 'Gudang Utama',
            type: 'return',
            created_by: '11223344',
            created_by_name: 'TEKNISI JOKO',
            nik_accept: null,
            accept_by_name: null,
            accept_time: null,
            notes: null,
        };

        it('handles active return: Step 1 completed, Step 2 active', () => {
            const steps = getTimelineSteps(baseReturnRow);
            expect(steps).toHaveLength(2);

            expect(steps[0].id).toBe('request');
            expect(steps[0].title).toBe('Pengajuan Return');
            expect(steps[0].status).toBe('completed');
            expect(steps[0].nik).toBe('11223344');
            expect(steps[0].name).toBe('TEKNISI JOKO');

            expect(steps[1].id).toBe('accept');
            expect(steps[1].title).toBe('Penerimaan Gudang');
            expect(steps[1].status).toBe('active');
            expect(steps[1].statusLabel).toBe('Menunggu Penerimaan');
        });

        it('handles completed return: Step 1 & 2 completed', () => {
            const row: InOutTagRow = {
                ...baseReturnRow,
                end_status: 'closed',
                accept_id: 'ACC-RET-505',
                nik_accept: '906627',
                accept_by_name: 'IMAM FARDI',
                accept_time: '2026-10-27T08:45:00.000Z',
            };

            const steps = getTimelineSteps(row);
            expect(steps).toHaveLength(2);

            expect(steps[0].status).toBe('completed');
            expect(steps[1].status).toBe('completed');
            expect(steps[1].statusLabel).toBe('Diterima');
            expect(steps[1].actionId).toBe('ACC-RET-505');
            expect(steps[1].nik).toBe('906627');
            expect(steps[1].name).toBe('IMAM FARDI');
        });

        it('handles cancelled return: Step 1 completed, Step 2 cancelled with parsed NIK', () => {
            const row: InOutTagRow = {
                ...baseReturnRow,
                end_status: 'cancel',
                notes: '[BATAL - 906627]: Pengajuan salah tipe material',
            };

            const steps = getTimelineSteps(row);
            expect(steps).toHaveLength(2);

            expect(steps[0].status).toBe('completed');
            expect(steps[1].status).toBe('cancelled');
            expect(steps[1].statusLabel).toBe('Dibatalkan');
            expect(steps[1].nik).toBe('906627');
        });
    });
});
