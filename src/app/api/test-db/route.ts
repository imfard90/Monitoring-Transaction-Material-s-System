import { NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
export async function GET() {
    const tech = await db.selectFrom('hr.technicians').select('nik').limit(1).execute();
    return NextResponse.json({ type: typeof tech[0]?.nik, val: tech[0]?.nik });
}
