import { securityLogger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

const MAX_REPORT_BYTES = 16_384;
const MAX_REPORTS_PER_MINUTE = 120;

/**
 * Mendeteksi apakah pelanggaran CSP berasal dari ekstensi browser pihak ketiga,
 * pseudo-protocol, atau injeksi script lokal yang tidak berbahaya bagi server MTMS.
 */
export function isNoiseViolation(blockedUri?: string, sourceFile?: string): boolean {
    const target = (blockedUri || '').toLowerCase().trim();
    const source = (sourceFile || '').toLowerCase().trim();

    // 1. Ekstensi browser (Chrome, Firefox, Safari, Edge, dsb.)
    if (
        target.startsWith('chrome-extension://') ||
        target.startsWith('moz-extension://') ||
        target.startsWith('safari-extension://') ||
        target.startsWith('safari-web-extension://') ||
        target.startsWith('edge-extension://') ||
        target.startsWith('extension://') ||
        target.startsWith('app://') ||
        target.startsWith('resource://') ||
        target.startsWith('mxaddon://') ||
        target.startsWith('webview://')
    ) {
        return true;
    }

    if (
        source.startsWith('chrome-extension://') ||
        source.startsWith('moz-extension://') ||
        source.startsWith('safari-extension://') ||
        source.startsWith('safari-web-extension://') ||
        source.startsWith('edge-extension://')
    ) {
        return true;
    }

    // 2. Pseudo-URI atau inline eval dari tool dev/ekstensi
    if (
        target === 'about:blank' ||
        target === 'about:srcdoc' ||
        target === 'about:' ||
        target === 'eval' ||
        target === 'inline' ||
        target === 'blob' ||
        target === 'data'
    ) {
        return true;
    }

    return false;
}

interface CspReportBody {
    'csp-report'?: {
        'document-uri'?: string;
        referrer?: string;
        'violated-directive'?: string;
        'effective-directive'?: string;
        'original-policy'?: string;
        disposition?: string;
        'blocked-uri'?: string;
        'line-number'?: number;
        'source-file'?: string;
        'status-code'?: number;
        'script-sample'?: string;
    };
    body?: {
        blockedURL?: string;
        disposition?: string;
        documentURL?: string;
        effectiveDirective?: string;
        originalPolicy?: string;
        sourceFile?: string;
        statusCode?: number;
    };
}

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
        // Drop excessive background violation reports silently with 204 to prevent console 429 flood
        return new Response(null, { status: 204 });
    }

    const body = await request.text();
    if (Buffer.byteLength(body, 'utf8') > MAX_REPORT_BYTES) {
        return new Response(null, { status: 413 });
    }

    try {
        const parsed: unknown = JSON.parse(body);
        if (!parsed || (typeof parsed !== 'object' && !Array.isArray(parsed))) {
            return new Response(null, { status: 400 });
        }

        // Tangani format single object (csp-report) atau reporting API v1 (array)
        const reports: CspReportBody[] = Array.isArray(parsed)
            ? (parsed as CspReportBody[])
            : [parsed as CspReportBody];

        for (const item of reports) {
            const blockedUri = item['csp-report']?.['blocked-uri'] || item.body?.blockedURL || '';
            const sourceFile = item['csp-report']?.['source-file'] || item.body?.sourceFile || '';
            const violatedDirective =
                item['csp-report']?.['violated-directive'] ||
                item['csp-report']?.['effective-directive'] ||
                item.body?.effectiveDirective ||
                '';
            const documentUri =
                item['csp-report']?.['document-uri'] || item.body?.documentURL || '';
            const disposition =
                item['csp-report']?.disposition || item.body?.disposition || 'enforce';

            // Filter out extension noise
            if (isNoiseViolation(blockedUri, sourceFile)) {
                continue;
            }

            // Catat pelanggaran nyata pada level warn
            securityLogger.warn('Real CSP violation detected', undefined, {
                blockedUri,
                sourceFile,
                violatedDirective,
                documentUri,
                disposition,
            });
        }

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
