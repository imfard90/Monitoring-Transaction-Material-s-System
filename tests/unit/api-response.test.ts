import { describe, expect, it } from 'vitest';
import { apiSuccessResponse, problemResponse } from '@/lib/api-response';

describe('API Response Formatter', () => {
    it('formats RFC 9457 Problem Details correctly', async () => {
        const response = problemResponse({
            type: 'https://mtms-app.credea.biz.id/problems/forbidden',
            title: 'Forbidden',
            status: 403,
            detail: 'Akses API belum disetujui.',
            extraInfo: 'custom-val',
        });

        expect(response.status).toBe(403);
        expect(response.headers.get('content-type')).toContain('application/problem+json');
        expect(response.headers.get('cache-control')).toContain('no-store');

        const body = await response.json();
        expect(body).toEqual({
            type: 'https://mtms-app.credea.biz.id/problems/forbidden',
            title: 'Forbidden',
            status: 403,
            detail: 'Akses API belum disetujui.',
            extraInfo: 'custom-val',
        });
    });

    it('formats Success Envelope with data and meta correctly', async () => {
        const data = [
            { branch: 'Lamongan', warehouse: 'SO Lamongan', material_code: 'MAT-01', designator: 'FO 1 Core', qty_stock: 100 },
        ];
        const response = apiSuccessResponse(data);

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('application/json');
        expect(response.headers.get('cache-control')).toContain('no-cache');
        expect(response.headers.get('cache-control')).toContain('private');

        const body = await response.json();
        expect(body.data).toEqual(data);
        expect(body.meta.total).toBe(1);
        expect(body.meta.timestamp).toBeTruthy();
    });
});
