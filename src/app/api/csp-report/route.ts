import { rateLimit } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/logger';

const MAX_REPORT_BYTES = 16_384;
const MAX_REPORTS_PER_MINUTE = 30;

export async function POST(request: Request): Promise<Response> {
    const contentType = request.headers.get('content-type')?.split(';')[0].trim();
    if (
        contentType !== 'application/csp-report' &&
        contentType !== 'application/reports+json' &&
        contentType !== 'application/json'
    ) {
        return new Response(null, { status: 415 });
    }

    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > MAX_REPORT_BYTES) {
        return new Response(null, { status: 413 });
    }

    const clientKey = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const rate = await rateLimit(`csp-report:${clientKey}`, MAX_REPORTS_PER_MINUTE, 60);
    if (!rate.success) {
        return new Response(null, { status: 429 });
    }

    const body = await request.text();
    if (Buffer.byteLength(body, 'utf8') > MAX_REPORT_BYTES) {
        return new Response(null, { status: 413 });
    }

    try {
        const report: unknown = JSON.parse(body);
        if (!report || typeof report !== 'object') {
            return new Response(null, { status: 400 });
        }

        securityLogger.info('CSP violation report received');
        return new Response(null, { status: 204 });
    } catch {
        return new Response(null, { status: 400 });
    }
}

export async function OPTIONS(): Promise<Response> {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
