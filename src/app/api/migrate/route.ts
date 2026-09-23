import { sql } from 'kysely';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db/db';

export async function GET() {
    try {
        const res1 =
            await sql`SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'sp_return_material'`.execute(
                db
            );
        const res2 =
            await sql`SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'sp_record_material_used'`.execute(
                db
            );

        return NextResponse.json({
            success: true,
            sp_return_material: res1.rows,
            sp_record_material_used: res2.rows,
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
