import { NextResponse } from 'next/server';

export interface ProblemDetailsOptions {
    type?: string;
    title: string;
    status: number;
    detail: string;
    instance?: string;
    headers?: Record<string, string>;
    [key: string]: unknown;
}

/**
 * Standard RFC 9457 Problem Details error response.
 * Uses Content-Type: application/problem+json.
 */
export function problemResponse({
    type = 'about:blank',
    title,
    status,
    detail,
    instance,
    headers = {},
    ...extra
}: ProblemDetailsOptions): NextResponse {
    const payload: Record<string, unknown> = {
        type,
        title,
        status,
        detail,
    };

    if (instance) {
        payload.instance = instance;
    }

    for (const [key, val] of Object.entries(extra)) {
        if (val !== undefined) {
            payload[key] = val;
        }
    }

    return NextResponse.json(payload, {
        status,
        headers: {
            'Content-Type': 'application/problem+json',
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
            ...headers,
        },
    });
}

/**
 * Standardized success response with data and metadata.
 * Private cache disabled by default.
 */
export function apiSuccessResponse<T>(
    data: T,
    meta: Record<string, unknown> = {},
    customHeaders: Record<string, string> = {}
): NextResponse {
    const defaultMeta: Record<string, unknown> = {
        total: Array.isArray(data) ? data.length : 1,
        timestamp: new Date().toISOString(),
        ...meta,
    };

    return NextResponse.json(
        {
            data,
            meta: defaultMeta,
        },
        {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
                ...customHeaders,
            },
        }
    );
}
