import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { getStockComparison } from '@/app/(DashboardLayout)/reference/_actions/stock-comparison-actions';
import { actionLogger } from '@/lib/logger';
import { z } from 'zod';

const ParamsSchema = z.object({
    nik: z.string().trim().min(1, 'NIK wajib diisi'),
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ nik: string }> }) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const rawParams = await params;
        const parsed = ParamsSchema.safeParse(rawParams);
        if (!parsed.success) {
            return NextResponse.json(
                { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid parameter' },
                { status: 400 }
            );
        }

        const result = await getStockComparison(parsed.data.nik);

        if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            data: result.data,
        });
    } catch (error) {
        actionLogger.error(
            'Stock comparison API error:',
            error instanceof Error ? error : new Error(String(error))
        );
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
