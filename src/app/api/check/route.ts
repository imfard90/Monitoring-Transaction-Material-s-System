import { NextResponse } from 'next/server';
import { getWarehousePerformance } from '@/app/(DashboardLayout)/_actions/dashboard-actions';

export async function GET() {
    try {
        const data = await getWarehousePerformance();
        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
