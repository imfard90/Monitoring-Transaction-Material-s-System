'use server';

import { revalidatePath } from 'next/cache';
import { sql } from 'kysely';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { redis } from '@/lib/redis';

export async function getOutLensaRefList() {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        let whNames: string[] = [];
        if (isStaff && warehouseIds.length > 0) {
            const whs = await db
                .selectFrom('inventory.mas_wh')
                .select('name')
                .where('id', 'in', warehouseIds)
                .execute();
            whNames = whs.map((w: any) => w.name);
            if (whNames.includes('SO Karangpilang')) whNames.push('SO Karang Pilang');
            if (whNames.includes('SO Karang Pilang')) whNames.push('SO Karangpilang');
        }

        if (isStaff && whNames.length === 0) {
            return { success: true, data: [] };
        }

        await sql`
            UPDATE inventory.out_lensa_ref_header h
            SET sap_out_check = TRUE
            FROM inventory.sap_out_header s
            WHERE h.gi_number = s.sap_number AND (h.sap_out_check IS FALSE OR h.sap_out_check IS NULL)
        `.execute(db);

        let query = db
            .selectFrom('inventory.out_lensa_ref_header')
            .selectAll()
            .orderBy('formatted_date', 'desc');

        if (isStaff && whNames.length > 0) {
            query = query.where('nama_gudang', 'in', whNames);
        }

        const headers = await query.execute();

        const headerIds = headers.map((h: any) => h.id);

        let details: any[] = [];
        if (headerIds.length > 0) {
            details = await db
                .selectFrom('inventory.out_lensa_ref_list')
                .selectAll()
                .where('header_id', 'in', headerIds)
                .execute();
        }

        const data = headers.map((h: any) => ({
            ...h,
            materials: details.filter((d) => d.header_id === h.id),
        }));

        return { success: true, data };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

async function asyncPool(poolLimit: number, array: any[], iteratorFn: (item: any) => Promise<any>) {
    const ret: Promise<any>[] = [];
    const executing: Promise<void>[] = [];
    for (const item of array) {
        const p = Promise.resolve().then(() => iteratorFn(item));
        ret.push(p);

        if (poolLimit <= array.length) {
            const e: any = p.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);
            if (executing.length >= poolLimit) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(ret);
}


export async function checkScrapingStatus(jobId: string) {
    const data = await redis.get(`job:${jobId}`);
    if (!data) return { status: 'not_found' };

    const parsed = JSON.parse(data);
    if (parsed.status === 'success') {
        revalidatePath('/apps/out-lensa-ref');
    }
    return parsed;
}


export async function getOutLensaRefDetails(headerId: string) {
    try {
        const details = await db
            .selectFrom('inventory.out_lensa_ref_list')
            .selectAll()
            .where('header_id', '=', headerId)
            .execute();

        const header = await db
            .selectFrom('inventory.out_lensa_ref_header')
            .select(['gi_number'])
            .where('id', '=', headerId)
            .executeTakeFirst();

        let sapItems: any[] = [];
        if (header?.gi_number) {
            const sapHeader = await db
                .selectFrom('inventory.sap_out_header')
                .select(['id'])
                .where('sap_number', '=', header.gi_number)
                .executeTakeFirst();

            if (sapHeader) {
                sapItems = await db
                    .selectFrom('inventory.sap_out_items as si')
                    .innerJoin('inventory.materials as m', 'm.id', 'si.designator_id')
                    .select(['m.code as material_id', 'si.qty_req'])
                    .where('si.header_id', '=', sapHeader.id)
                    .execute();
            }
        }

        const data = details.map((d: any) => {
            let matched = false;
            if (sapItems.length > 0) {
                const sapItem = sapItems.find(
                    (si: any) =>
                        si.material_id === d.material_id &&
                        Number(si.qty_req) === Number(d.qty_approve)
                );
                if (sapItem) matched = true;
            }
            return {
                ...d,
                sap_out_matched: matched,
            };
        });

        return { success: true, data };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}