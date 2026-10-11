import { hashApiKey, isValidApiKeyFormat } from '@/lib/security/api-key';
import { checkAndConsumeApiRateLimit } from '@/lib/security/api-rate-limit';
import { db } from '@/lib/db/db';

export type ApiAuthResult =
    | {
          ok: true;
          user: {
              id: string;
              nik: string;
              name: string;
              email: string;
              appr_api: boolean;
          };
      }
    | {
          ok: false;
          status: 401;
          title: string;
          detail: string;
      }
    | {
          ok: false;
          status: 403;
          title: string;
          detail: string;
      }
    | {
          ok: false;
          status: 429;
          title: string;
          detail: string;
          retryAfterSeconds: number;
          retryAt: string;
      };

/**
 * Authenticates an incoming API request using Bearer API key.
 *
 * Sequence of evaluation according to requirements:
 * 1. Extract Bearer token and validate format.
 * 2. Hash token and query auth.user.
 *    If user not found -> 401 Unauthorized.
 * 3. Rate limiting is checked and consumed ATOMICALLY per user (1 request / 5 min).
 *    Quota is consumed immediately before checking approval status.
 *    If rate limit exceeded -> 429 Too Many Requests (with retryAfter & retryAt).
 * 4. Check user.appr_api flag.
 *    If not approved -> 403 Forbidden (quota was already consumed).
 * 5. Return authenticated user.
 */
export async function authenticateApiRequest(req: Request): Promise<ApiAuthResult> {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return {
            ok: false,
            status: 401,
            title: 'Unauthorized',
            detail: 'Header Authorization Bearer dengan MTMS API Key diperlukan.',
        };
    }

    const token = authHeader.substring(7).trim();

    if (!isValidApiKeyFormat(token)) {
        return {
            ok: false,
            status: 401,
            title: 'Unauthorized',
            detail: 'Format API Key tidak valid. Format yang benar diawali dengan "mtms_live_".',
        };
    }

    const hashedKey = hashApiKey(token);

    const user = await db
        .selectFrom('auth.user')
        .select(['id', 'nik', 'name', 'email', 'appr_api'])
        .where('api_key', '=', hashedKey)
        .executeTakeFirst();

    if (!user) {
        return {
            ok: false,
            status: 401,
            title: 'Unauthorized',
            detail: 'API Key tidak valid atau telah dicabut.',
        };
    }

    // Rate limit quota is consumed now per user across all API endpoints
    const rateLimitResult = await checkAndConsumeApiRateLimit(user.id);
    if (!rateLimitResult.allowed) {
        return {
            ok: false,
            status: 429,
            title: 'Too Many Requests',
            detail: 'Batas pemanggilan API terlampaui. Setiap akun dibatasi maksimal 1 permintaan per 5 menit.',
            retryAfterSeconds: rateLimitResult.retryAfterSeconds,
            retryAt: rateLimitResult.retryAt ?? new Date(Date.now() + 300000).toISOString(),
        };
    }

    // Check approval status (quota has already been consumed)
    if (!user.appr_api) {
        return {
            ok: false,
            status: 403,
            title: 'Forbidden',
            detail: 'Akses API untuk akun ini belum disetujui atau sedang dinonaktifkan oleh Administrator.',
        };
    }

    return {
        ok: true,
        user: {
            id: user.id,
            nik: user.nik,
            name: user.name,
            email: user.email,
            appr_api: Boolean(user.appr_api),
        },
    };
}
