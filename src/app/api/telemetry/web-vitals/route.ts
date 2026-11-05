import { z } from 'zod';
import { actionLogger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

const MAX_PAYLOAD_BYTES = 4_096;
const MAX_REPORTS_PER_MINUTE = 60;

const webVitalSchema = z.object({
    id: z.string().max(100).optional(),
    name: z.enum(['FCP', 'LCP', 'CLS', 'FID', 'INP', 'TTFB']),
    value: z.number().nonnegative(),
    rating: z.enum(['good', 'needs-improvement', 'poor']).optional(),
    delta: z.number().optional(),
    navigationType: z.string().max(50).optional(),
});

export async function POST(request: Request): Promise<Response> {
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > MAX_PAYLOAD_BYTES) {
        return new Response(null, { status: 413 });
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const rate = await rateLimit(`web-vitals:${clientIp}`, MAX_REPORTS_PER_MINUTE, 60);
    if (!rate.success) {
        return new Response(null, { status: 204 });
    }

    try {
        const text = await request.text();
        if (Buffer.byteLength(text, 'utf8') > MAX_PAYLOAD_BYTES) {
            return new Response(null, { status: 413 });
        }

        const json: unknown = JSON.parse(text);
        const parsed = webVitalSchema.safeParse(json);
        if (!parsed.success) {
            return new Response(null, { status: 400 });
        }

        const { name, value, rating, navigationType } = parsed.data;

        if (rating === 'poor') {
            actionLogger.warn(
                `[WebVitals:Poor] ${name} = ${value.toFixed(2)} (${rating}, nav: ${navigationType ?? 'navigate'})`
            );
        } else if (rating === 'needs-improvement') {
            actionLogger.info(
                `[WebVitals:NeedsImprovement] ${name} = ${value.toFixed(2)} (${rating}, nav: ${navigationType ?? 'navigate'})`
            );
        } else {
            actionLogger.debug(`[WebVitals:Good] ${name} = ${value.toFixed(2)}`);
        }

        return new Response(null, { status: 204 });
    } catch {
        return new Response(null, { status: 400 });
    }
}

export async function OPTIONS(): Promise<Response> {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}

