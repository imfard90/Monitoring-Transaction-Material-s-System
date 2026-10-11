import { apiSuccessResponse, problemResponse } from '@/lib/api-response';
import { authenticateApiRequest } from '@/lib/security/api-auth';
import { getStockBalancesForApiUser } from '@/lib/services/stock-api.service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/stock
 *
 * Mengambil saldo stok material (stock balance) di MTMS.
 * Autentikasi: Bearer <API_KEY> (format: mtms_live_*)
 * Rate limit: Maksimal 1 request per 5 menit per user pemilik API (shared antar semua endpoint API).
 * Akses data:
 * - User Staff: hanya gudang yang dipetakan (PIC 1 / PIC 2).
 * - User Non-Staff: semua gudang.
 */
export async function GET(request: Request) {
    const authResult = await authenticateApiRequest(request);

    if (!authResult.ok) {
        if (authResult.status === 429) {
            return problemResponse({
                type: 'https://mtms-app.credea.biz.id/problems/rate-limit-exceeded',
                title: authResult.title,
                status: 429,
                detail: authResult.detail,
                retryAt: authResult.retryAt,
                headers: {
                    'Retry-After': String(authResult.retryAfterSeconds),
                },
            });
        }

        if (authResult.status === 403) {
            return problemResponse({
                type: 'https://mtms-app.credea.biz.id/problems/forbidden',
                title: authResult.title,
                status: 403,
                detail: authResult.detail,
            });
        }

        return problemResponse({
            type: 'https://mtms-app.credea.biz.id/problems/unauthorized',
            title: authResult.title,
            status: 401,
            detail: authResult.detail,
        });
    }

    try {
        const stocks = await getStockBalancesForApiUser(authResult.user);
        return apiSuccessResponse(stocks, {
            total: stocks.length,
        });
    } catch (error) {
        return problemResponse({
            type: 'https://mtms-app.credea.biz.id/problems/internal-server-error',
            title: 'Internal Server Error',
            status: 500,
            detail: error instanceof Error ? error.message : 'Terjadi kesalahan pada sistem saat mengambil saldo stok.',
        });
    }
}
