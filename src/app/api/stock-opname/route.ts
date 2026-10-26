import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { AuthenticationError, AuthorizationError } from '@/lib/errors';
import { actionLogger } from '@/lib/logger';
import { canAccessWarehouse } from '@/lib/policies';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const MATCH_LIMIT = 20;
const MATCH_WINDOW_SEC = 60;
const MAX_MATERIALS = 2000;

const MatchSchema = z.object({
    materials: z
        .array(
            z.object({
                warehouse_id: z.coerce.number().int().positive(),
                material_code: z.string().trim().min(1).max(64),
                saldo_sap: z.coerce.number().int(),
            })
        )
        .min(1)
        .max(MAX_MATERIALS),
});

export async function POST(req: NextRequest) {
    try {
        const user = await getSessionUser().catch(() => null);
        if (!user?.nik) throw new AuthenticationError();

        const rate = await rateLimit(`stock-opname:${user.nik}`, MATCH_LIMIT, MATCH_WINDOW_SEC);
        if (!rate.success) {
            return NextResponse.json({ error: 'Terlalu banyak permintaan.' }, { status: 429 });
        }

        const parsed = MatchSchema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: 'Data materials wajib diisi.' }, { status: 400 });
        }

        // Filter materials according to staff warehouse authorization
        const authorizedMaterials: Array<{
            warehouse_id: number;
            material_code: string;
            saldo_sap: number;
        }> = [];

        for (const item of parsed.data.materials) {
            if (canAccessWarehouse(user, item.warehouse_id)) {
                authorizedMaterials.push(item);
            }
        }

        if (authorizedMaterials.length === 0) {
            return NextResponse.json({ error: 'Akses gudang ditolak.' }, { status: 403 });
        }

        const warehouseIds = [...new Set(authorizedMaterials.map((item) => item.warehouse_id))];

        // Query MTMS current stock balance for the authorized warehouses
        const mtmsStock = await db
            .selectFrom('inventory.stock_balance')
            .innerJoin('inventory.mas_wh as wh', (join) =>
                join.onRef('inventory.stock_balance.warehouse_id', '=', 'wh.id')
            )
            .innerJoin('inventory.materials as mat', (join) =>
                join.onRef('inventory.stock_balance.designator_id', '=', 'mat.id')
            )
            .where('inventory.stock_balance.warehouse_id', 'in', warehouseIds)
            .select([
                'inventory.stock_balance.warehouse_id',
                'wh.name as warehouse_name',
                'mat.id as material_id',
                'mat.code as material_code',
                'mat.description as material_name',
                'inventory.stock_balance.qty_stock',
            ])
            .execute();

        const mtmsStockMap = new Map<string, { qty: number; name: string }>();
        for (const row of mtmsStock) {
            const key = `${row.warehouse_id}|${String(row.material_code).trim().toUpperCase()}`;
            mtmsStockMap.set(key, {
                qty: row.qty_stock ?? 0,
                name: row.material_name ?? '',
            });
        }

        // Map every authorized item from SAP against MTMS (robust outer match)
        const results = authorizedMaterials.map((item) => {
            const code = item.material_code.trim().toUpperCase();
            const key = `${item.warehouse_id}|${code}`;
            const existing = mtmsStockMap.get(key);
            const mtmsQty = existing ? existing.qty : 0;
            const matName = existing?.name ?? '';

            return {
                material_code: code,
                material_name: matName,
                qty_system: mtmsQty,
                qty_opname: item.saldo_sap,
                difference: item.saldo_sap - mtmsQty,
            };
        });

        actionLogger.info('Stock opname matched', {
            nik: user.nik,
            rows: parsed.data.materials.length,
            matches: results.length,
        });

        return NextResponse.json({ success: true, data: results });
    } catch (error: unknown) {
        if (error instanceof AuthenticationError) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (error instanceof AuthorizationError) {
            return NextResponse.json({ error: 'Akses gudang ditolak.' }, { status: 403 });
        }
        actionLogger.error(
            'stock-opname API error',
            error instanceof Error ? error : new Error(String(error))
        );
        return NextResponse.json({ error: 'Gagal membandingkan stok.' }, { status: 500 });
    }
}
