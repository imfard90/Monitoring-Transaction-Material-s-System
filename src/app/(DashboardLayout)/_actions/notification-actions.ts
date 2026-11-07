'use server';

import { sql } from 'kysely';
import { getSessionUser } from '@/lib/auth-server';
import { notificationLru } from '@/lib/cache/lru-cache';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { resolveWarehouseScope, warehouseScopeCacheKey } from '@/lib/policies';
import { inventoryRepository } from '@/lib/repositories/inventory.repository';
import { expandWarehouseAliases } from '@/lib/warehouse-helper';

export interface NotificationCategorySummary {
    id: 'inout_tag' | 'return_material' | 'out_sap' | 'rekon_lensa';
    title: string;
    count: number;
    href: string;
    badgeLabel: string;
    icon: string;
    color: string;
    badgeVariant: 'info' | 'warning' | 'destructive' | 'success';
}

export interface UrgentNotificationItem {
    id: string;
    category: 'inout_tag' | 'return_material' | 'out_sap' | 'rekon_lensa';
    categoryLabel: string;
    title: string;
    subtitle: string;
    time?: string | Date | null;
    href: string;
    statusText: string;
    statusVariant: 'info' | 'warning' | 'destructive' | 'success';
}

export interface NotificationPayload {
    total: number;
    categories: NotificationCategorySummary[];
    urgentItems: UrgentNotificationItem[];
}

export async function getPendingNotifications(): Promise<{
    success: boolean;
    data?: NotificationPayload;
    error?: string;
}> {
    try {
        const user = await getSessionUser();
        const { isStaff, warehouseIds } = user;
        const scope = resolveWarehouseScope(user);

        const defaultCategories: NotificationCategorySummary[] = [
            {
                id: 'inout_tag',
                title: 'Inout Tag',
                count: 0,
                href: '/apps/inout-tag',
                badgeLabel: 'Kirim / Terima',
                icon: 'solar:routing-2-bold-duotone',
                color: 'text-info',
                badgeVariant: 'info',
            },
            {
                id: 'return_material',
                title: 'Retur Material',
                count: 0,
                href: '/form/return-material',
                badgeLabel: 'Menunggu Konfirmasi',
                icon: 'solar:refresh-circle-bold-duotone',
                color: 'text-amber-500',
                badgeVariant: 'warning',
            },
            {
                id: 'out_sap',
                title: 'Out SAP (Check False)',
                count: 0,
                href: '/form/out-sap',
                badgeLabel: 'Belum Input SAP',
                icon: 'solar:bill-check-bold-duotone',
                color: 'text-rose-500',
                badgeVariant: 'destructive',
            },
            {
                id: 'rekon_lensa',
                title: 'Rekon Lensa',
                count: 0,
                href: '/form/rekon-lensa',
                badgeLabel: 'Belum Direkon',
                icon: 'solar:archive-check-bold-duotone',
                color: 'text-emerald-500',
                badgeVariant: 'success',
            },
        ];

        // Fail-closed for staff without assigned warehouses
        if (scope.kind === 'none') {
            return {
                success: true,
                data: {
                    total: 0,
                    categories: defaultCategories,
                    urgentItems: [],
                },
            };
        }

        // Cache key MUST include the warehouse scope — otherwise users with different
        // warehouse assignments share the same cached notification payload.
        const cacheKey = `notif:${user.nik}:${warehouseScopeCacheKey(scope)}`;
        const cached = notificationLru.get(cacheKey) as NotificationPayload | undefined;
        if (cached) {
            return { success: true, data: cached };
        }

        // Determine warehouse names for Staff (uses cached inventoryRepository)
        let whNames: string[] = [];
        if (isStaff && warehouseIds && warehouseIds.length > 0) {
            const whs = await inventoryRepository.getWarehouses(warehouseIds);
            whNames = expandWarehouseAliases(
                whs
                    .map((w) => w.name as string)
                    .filter((name): name is string => typeof name === 'string' && name.length > 0)
            );
        }

        // 1. Inout Tag Queries
        let inoutCountQuery = db
            .selectFrom('inventory.inout_tag_header as h')
            .select(sql<number>`COUNT(h.id)`.as('total'))
            .where('h.end_status', 'in', ['requested', 'in_transit']);

        let inoutRecentQuery = db
            .selectFrom('inventory.inout_tag_header as h')
            .leftJoin('inventory.mas_wh as wh_from', 'wh_from.id', 'h.from_wh_id')
            .leftJoin('inventory.mas_wh as wh_to', 'wh_to.id', 'h.to_wh_id')
            .select([
                'h.id',
                'h.id_trx',
                'h.end_status',
                'h.request_time',
                'wh_from.name as from_wh_name',
                'wh_to.name as to_wh_name',
            ])
            .where('h.end_status', 'in', ['requested', 'in_transit']);

        if (scope.kind === 'scoped') {
            inoutCountQuery = inoutCountQuery.where((eb) =>
                eb.or([
                    eb.and([
                        eb('h.end_status', '=', 'requested'),
                        eb('h.from_wh_id', 'in', scope.ids),
                    ]),
                    eb.and([
                        eb('h.end_status', '=', 'in_transit'),
                        eb('h.to_wh_id', 'in', scope.ids),
                    ]),
                ])
            );
            inoutRecentQuery = inoutRecentQuery.where((eb) =>
                eb.or([
                    eb.and([
                        eb('h.end_status', '=', 'requested'),
                        eb('h.from_wh_id', 'in', scope.ids),
                    ]),
                    eb.and([
                        eb('h.end_status', '=', 'in_transit'),
                        eb('h.to_wh_id', 'in', scope.ids),
                    ]),
                ])
            );
        }

        // 2. Return Material Queries
        let returnCountQuery = db
            .selectFrom('inventory.return_material_header as r')
            .select(sql<number>`COUNT(r.id)`.as('total'))
            .where('r.end_status', 'in', ['pending', 'wait_approve', 'requested']);

        let returnRecentQuery = db
            .selectFrom('inventory.return_material_header as r')
            .leftJoin('inventory.mas_wh as wh', 'wh.id', 'r.warehouse_id')
            .leftJoin('hr.technicians as t', 't.nik', 'r.nik_teknisi')
            .select([
                'r.id',
                'r.id_trx',
                'r.nik_teknisi',
                't.name as technician_name',
                'wh.name as warehouse_name',
                'r.created_at as request_time',
                'r.end_status',
            ])
            .where('r.end_status', 'in', ['pending', 'wait_approve', 'requested']);

        if (scope.kind === 'scoped') {
            const whIdsAsStrings = scope.ids.map(String);
            returnCountQuery = returnCountQuery.where('r.warehouse_id', 'in', whIdsAsStrings);
            returnRecentQuery = returnRecentQuery.where('r.warehouse_id', 'in', whIdsAsStrings);
        }

        // 3. Out SAP Check False Queries (inventory.out_lensa_ref_header)
        let outSapCountQuery = db
            .selectFrom('inventory.out_lensa_ref_header as o')
            .select(sql<number>`COUNT(o.id)`.as('total'))
            .where((eb) =>
                eb.or([eb('o.sap_out_check', '=', false), eb('o.sap_out_check', 'is', null)])
            );

        let outSapRecentQuery = db
            .selectFrom('inventory.out_lensa_ref_header as o')
            .select([
                'o.id',
                'o.reservation_id',
                'o.gi_number',
                'o.nama_gudang',
                'o.nik_pemakai',
                'o.formatted_date as request_time',
            ])
            .where((eb) =>
                eb.or([eb('o.sap_out_check', '=', false), eb('o.sap_out_check', 'is', null)])
            );

        if (isStaff && whNames.length > 0) {
            outSapCountQuery = outSapCountQuery.where('o.nama_gudang', 'in', whNames);
            outSapRecentQuery = outSapRecentQuery.where('o.nama_gudang', 'in', whNames);
        }

        // 4. Rekon Lensa Belum Rekon Queries (inventory.wo_lensa_header)
        let rekonCountQuery = db
            .selectFrom('inventory.wo_lensa_header as w')
            .select(sql<number>`COUNT(w.id)`.as('total'))
            .where((eb) =>
                eb.or([eb('w.rekon_check', '=', false), eb('w.rekon_check', 'is', null)])
            );

        let rekonRecentQuery = db
            .selectFrom('inventory.wo_lensa_header as w')
            .select([
                'w.id',
                'w.wo_number',
                'w.nama_gudang',
                'w.nik_pemakai',
                'w.type as wo_type',
                'w.formatted_date as request_time',
            ])
            .where((eb) =>
                eb.or([eb('w.rekon_check', '=', false), eb('w.rekon_check', 'is', null)])
            );

        if (isStaff && whNames.length > 0) {
            rekonCountQuery = rekonCountQuery.where('w.nama_gudang', 'in', whNames);
            rekonRecentQuery = rekonRecentQuery.where('w.nama_gudang', 'in', whNames);
        }

        // Execute queries in parallel
        const [
            inoutCountRes,
            inoutRecentRes,
            returnCountRes,
            returnRecentRes,
            outSapCountRes,
            outSapRecentRes,
            rekonCountRes,
            rekonRecentRes,
        ] = await Promise.all([
            inoutCountQuery.executeTakeFirst(),
            inoutRecentQuery.orderBy('h.request_time', 'desc').limit(3).execute(),
            returnCountQuery.executeTakeFirst(),
            returnRecentQuery.orderBy('r.created_at', 'desc').limit(3).execute(),
            outSapCountQuery.executeTakeFirst(),
            outSapRecentQuery.orderBy('o.formatted_date', 'desc').limit(3).execute(),
            rekonCountQuery.executeTakeFirst(),
            rekonRecentQuery.orderBy('w.formatted_date', 'desc').limit(3).execute(),
        ]);

        const inoutCount = Number(inoutCountRes?.total ?? 0);
        const returnCount = Number(returnCountRes?.total ?? 0);
        const outSapCount = Number(outSapCountRes?.total ?? 0);
        const rekonCount = Number(rekonCountRes?.total ?? 0);
        const total = inoutCount + returnCount + outSapCount + rekonCount;

        const categories: NotificationCategorySummary[] = [
            {
                id: 'inout_tag',
                title: 'Inout Tag',
                count: inoutCount,
                href: '/apps/inout-tag',
                badgeLabel: 'Kirim / Terima',
                icon: 'solar:routing-2-bold-duotone',
                color: 'text-info',
                badgeVariant: 'info',
            },
            {
                id: 'return_material',
                title: 'Retur Material',
                count: returnCount,
                href: '/form/return-material',
                badgeLabel: 'Menunggu Konfirmasi',
                icon: 'solar:refresh-circle-bold-duotone',
                color: 'text-amber-500',
                badgeVariant: 'warning',
            },
            {
                id: 'out_sap',
                title: 'Out SAP (Check False)',
                count: outSapCount,
                href: '/form/out-sap',
                badgeLabel: 'Belum Input SAP',
                icon: 'solar:bill-check-bold-duotone',
                color: 'text-rose-500',
                badgeVariant: 'destructive',
            },
            {
                id: 'rekon_lensa',
                title: 'Rekon Lensa',
                count: rekonCount,
                href: '/form/rekon-lensa',
                badgeLabel: 'Belum Direkon',
                icon: 'solar:archive-check-bold-duotone',
                color: 'text-emerald-500',
                badgeVariant: 'success',
            },
        ];

        // Format urgent items
        const urgentItems: UrgentNotificationItem[] = [];

        for (const item of inoutRecentRes) {
            const isSend = item.end_status === 'requested';
            urgentItems.push({
                id: `inout_${item.id}`,
                category: 'inout_tag',
                categoryLabel: 'Inout Tag',
                title: String(item.id_trx || `TAG #${item.id}`),
                subtitle: `${item.from_wh_name || 'Gudang'} → ${item.to_wh_name || 'Gudang'}`,
                time: item.request_time,
                href: '/apps/inout-tag',
                statusText: isSend ? 'Perlu Kirim' : 'Perlu Terima',
                statusVariant: isSend ? 'warning' : 'info',
            });
        }

        for (const item of returnRecentRes) {
            urgentItems.push({
                id: `return_${item.id}`,
                category: 'return_material',
                categoryLabel: 'Retur Material',
                title: String(item.id_trx || `RET #${item.id}`),
                subtitle: `Teknisi: ${item.nik_teknisi}${item.technician_name ? ` (${item.technician_name})` : ''} • ${item.warehouse_name || 'Gudang'}`,
                time: item.request_time,
                href: '/form/return-material',
                statusText: 'Perlu Konfirmasi',
                statusVariant: 'warning',
            });
        }

        for (const item of outSapRecentRes) {
            urgentItems.push({
                id: `outsap_${item.id}`,
                category: 'out_sap',
                categoryLabel: 'Out SAP',
                title: item.reservation_id
                    ? `Reservasi: ${item.reservation_id}`
                    : `Ref #${item.id}`,
                subtitle: `${item.nama_gudang || 'Gudang'} • GI: ${item.gi_number || '-'} • Teknisi: ${item.nik_pemakai || '-'}`,
                time: item.request_time,
                href: '/form/out-sap',
                statusText: 'Check False',
                statusVariant: 'destructive',
            });
        }

        for (const item of rekonRecentRes) {
            urgentItems.push({
                id: `rekon_${item.id}`,
                category: 'rekon_lensa',
                categoryLabel: 'Rekon Lensa',
                title: item.wo_number ? `WO: ${item.wo_number}` : `WO #${item.id}`,
                subtitle: `${item.nama_gudang || 'Gudang'} • Teknisi: ${item.nik_pemakai || '-'} • Tipe: ${item.wo_type || '-'}`,
                time: item.request_time,
                href: '/form/rekon-lensa',
                statusText: 'Belum Rekon',
                statusVariant: 'success',
            });
        }

        // Sort urgent items by time descending
        urgentItems.sort((a, b) => {
            const timeA = a.time ? new Date(a.time).getTime() : 0;
            const timeB = b.time ? new Date(b.time).getTime() : 0;
            return timeB - timeA;
        });

        const payload: NotificationPayload = {
            total,
            categories,
            urgentItems,
        };
        notificationLru.set(cacheKey, payload, { ttl: 20 * 1000 });

        return {
            success: true,
            data: payload,
        };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch pending notifications:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
