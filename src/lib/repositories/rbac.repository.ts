import { type Kysely, sql, type Transaction } from 'kysely';
import type { DB } from '@/lib/db/database.types';
import { db } from '@/lib/db/db';
import type { RoleKey, ScopeBoundary } from '@/lib/policies/rbac';

export interface RoleRecord {
    id: number;
    role_key: RoleKey;
    role_name: string;
    hierarchy_level: number;
    description: string | null;
}

export interface PermissionRecord {
    id: number;
    permission_key: string;
    module: string;
    description: string | null;
}

export interface UserScopeRow {
    id: string;
    user_nik: string;
    role_id: number;
    role_key: RoleKey;
    role_name: string;
    hierarchy_level: number;
    area: string | null;
    regional: string | null;
    branch: string | null;
    service_area: string | null;
    warehouse_id: number | null;
    is_primary: boolean;
    valid_from: Date;
    valid_until: Date | null;
}

export interface SaveUserScopeInput {
    userNik: string;
    roleKey: RoleKey;
    area?: string | null;
    regional?: string | null;
    branch?: string | null;
    serviceArea?: string | null;
    warehouseIds?: number[];
    validUntil?: Date | null;
    actorNik: string;
}

export function createRbacRepository(dbClient: Kysely<DB> | Transaction<DB>) {
    return {
        async getRoles(): Promise<RoleRecord[]> {
            const rows = await dbClient
                .selectFrom('auth.roles')
                .select(['id', 'role_key', 'role_name', 'hierarchy_level', 'description'])
                .orderBy('hierarchy_level', 'asc')
                .execute();
            return rows as RoleRecord[];
        },

        async getPermissions(): Promise<PermissionRecord[]> {
            return dbClient
                .selectFrom('auth.permissions')
                .select(['id', 'permission_key', 'module', 'description'])
                .orderBy('module', 'asc')
                .orderBy('permission_key', 'asc')
                .execute();
        },

        async getPermissionsByRoleId(roleId: number): Promise<string[]> {
            const rows = await dbClient
                .selectFrom('auth.role_permissions as rp')
                .innerJoin('auth.permissions as p', 'p.id', 'rp.permission_id')
                .select('p.permission_key')
                .where('rp.role_id', '=', roleId)
                .execute();
            return rows.map((r) => r.permission_key);
        },

        async getRolePermissionMatrix(): Promise<{
            roles: RoleRecord[];
            permissions: PermissionRecord[];
            rolePermissions: Record<number, string[]>;
        }> {
            const [roles, permissions, mappings] = await Promise.all([
                this.getRoles(),
                this.getPermissions(),
                dbClient
                    .selectFrom('auth.role_permissions as rp')
                    .innerJoin('auth.permissions as p', 'p.id', 'rp.permission_id')
                    .select(['rp.role_id', 'p.permission_key'])
                    .execute(),
            ]);

            const rolePermissions: Record<number, string[]> = {};
            for (const r of roles) {
                rolePermissions[r.id] = [];
            }
            for (const m of mappings) {
                if (!rolePermissions[m.role_id]) {
                    rolePermissions[m.role_id] = [];
                }
                rolePermissions[m.role_id].push(m.permission_key);
            }

            return { roles, permissions, rolePermissions };
        },

        async saveRolePermissions(
            roleId: number,
            permissionKeys: string[]
        ): Promise<{ affectedNiks: string[] }> {
            return dbClient.transaction().execute(async (trx) => {
                const role = await trx
                    .selectFrom('auth.roles')
                    .select(['id', 'role_key', 'hierarchy_level'])
                    .where('id', '=', roleId)
                    .executeTakeFirst();

                if (!role) {
                    throw new Error('Role tidak ditemukan.');
                }

                const uniqueKeys = Array.from(new Set(permissionKeys));
                let permIds: number[] = [];

                if (uniqueKeys.length > 0) {
                    const perms = await trx
                        .selectFrom('auth.permissions')
                        .select(['id', 'permission_key'])
                        .where(
                            sql<boolean>`${sql.ref('permission_key')} = ANY(${uniqueKeys}::text[])`
                        )
                        .execute();
                    permIds = perms.map((p) => p.id);
                }

                await trx
                    .deleteFrom('auth.role_permissions')
                    .where('role_id', '=', roleId)
                    .execute();

                if (permIds.length > 0) {
                    await trx
                        .insertInto('auth.role_permissions')
                        .values(
                            permIds.map((permissionId) => ({
                                role_id: roleId,
                                permission_id: permissionId,
                            }))
                        )
                        .onConflict((oc) => oc.doNothing())
                        .execute();
                }

                const affectedRows = await trx
                    .selectFrom('auth.user_scopes')
                    .select('user_nik')
                    .where('role_id', '=', roleId)
                    .distinct()
                    .execute();

                return {
                    affectedNiks: affectedRows.map((r) => r.user_nik),
                };
            });
        },

        async getAllActiveUserScopes(): Promise<
            Array<UserScopeRow & { warehouse_name: string | null }>
        > {
            const rows = await dbClient
                .selectFrom('auth.user_scopes as us')
                .innerJoin('auth.roles as r', 'r.id', 'us.role_id')
                .leftJoin('inventory.mas_wh as wh', 'wh.id', 'us.warehouse_id')
                .select([
                    'us.id',
                    'us.user_nik',
                    'us.role_id',
                    'r.role_key',
                    'r.role_name',
                    'r.hierarchy_level',
                    'us.area',
                    'us.regional',
                    'us.branch',
                    'us.service_area',
                    'us.warehouse_id',
                    'wh.name as warehouse_name',
                    'us.is_primary',
                    'us.valid_from',
                    'us.valid_until',
                ])
                .where(sql<boolean>`us.valid_from <= NOW()`)
                .where(sql<boolean>`(us.valid_until IS NULL OR us.valid_until > NOW())`)
                .orderBy('r.hierarchy_level', 'asc')
                .orderBy('us.is_primary', 'desc')
                .execute();
            return rows as Array<UserScopeRow & { warehouse_name: string | null }>;
        },

        async getActiveUserScopes(userNik: string): Promise<UserScopeRow[]> {
            const rows = await dbClient
                .selectFrom('auth.user_scopes as us')
                .innerJoin('auth.roles as r', 'r.id', 'us.role_id')
                .select([
                    'us.id',
                    'us.user_nik',
                    'us.role_id',
                    'r.role_key',
                    'r.role_name',
                    'r.hierarchy_level',
                    'us.area',
                    'us.regional',
                    'us.branch',
                    'us.service_area',
                    'us.warehouse_id',
                    'us.is_primary',
                    'us.valid_from',
                    'us.valid_until',
                ])
                .where('us.user_nik', '=', userNik)
                .where(sql<boolean>`us.valid_from <= NOW()`)
                .where(sql<boolean>`(us.valid_until IS NULL OR us.valid_until > NOW())`)
                .orderBy('r.hierarchy_level', 'asc')
                .orderBy('us.is_primary', 'desc')
                .execute();
            return rows as UserScopeRow[];
        },

        /**
         * Resolves warehouse IDs based on active user_scopes and hr.branches hierarchy.
         */
        async resolveWarehouseIdsFromScopes(scopes: UserScopeRow[]): Promise<{
            warehouseIds: number[];
            scopeBoundary: ScopeBoundary;
        }> {
            if (scopes.length === 0) {
                return {
                    warehouseIds: [],
                    scopeBoundary: { area: null, regional: null, branch: null, serviceArea: null },
                };
            }

            const primary = scopes[0];
            const scopeBoundary: ScopeBoundary = {
                area: primary.area,
                regional: primary.regional,
                branch: primary.branch,
                serviceArea: primary.service_area,
            };

            // Level 6: Teknisi — tidak memiliki akses gudang
            if (primary.hierarchy_level >= 6) {
                return { warehouseIds: [], scopeBoundary };
            }

            // Level 5: Staff Gudang — langsung ambil warehouse_id dari scopes
            if (primary.hierarchy_level === 5) {
                const directIds = Array.from(
                    new Set(
                        scopes
                            .map((s) => s.warehouse_id)
                            .filter((id): id is number => id !== null && id > 0)
                    )
                );
                return { warehouseIds: directIds, scopeBoundary };
            }

            // Level 1..4: Resolve dari inventory.mas_wh join hr.branches
            let query = dbClient
                .selectFrom('inventory.mas_wh as wh')
                .innerJoin('hr.branches as br', (join) =>
                    join.on(sql<boolean>`UPPER(TRIM(br.branch)) = UPPER(TRIM(wh.branch))`)
                )
                .select('wh.id')
                .distinct();

            if (primary.hierarchy_level === 1 && primary.area) {
                query = query.where(
                    sql<boolean>`UPPER(TRIM(br.area)) = UPPER(TRIM(${primary.area}))`
                );
            } else if (primary.hierarchy_level === 2 && primary.regional) {
                query = query.where(
                    sql<boolean>`UPPER(TRIM(br.regional)) = UPPER(TRIM(${primary.regional}))`
                );
            } else if (primary.hierarchy_level === 3 && primary.branch) {
                query = query.where(
                    sql<boolean>`UPPER(TRIM(br.branch)) = UPPER(TRIM(${primary.branch}))`
                );
            } else if (primary.hierarchy_level === 4 && primary.service_area) {
                query = query.where(
                    sql<boolean>`UPPER(TRIM(br.service_area)) = UPPER(TRIM(${primary.service_area}))`
                );
            } else {
                return { warehouseIds: [], scopeBoundary };
            }

            const whRows = await query.execute();
            return {
                warehouseIds: whRows.map((w) => w.id),
                scopeBoundary,
            };
        },

        async getScopeHierarchyOptions() {
            const [branches, warehouses] = await Promise.all([
                dbClient
                    .selectFrom('hr.branches')
                    .select(['id', 'area', 'regional', 'branch', 'service_area'])
                    .orderBy('area', 'asc')
                    .orderBy('regional', 'asc')
                    .orderBy('branch', 'asc')
                    .orderBy('service_area', 'asc')
                    .execute(),
                dbClient
                    .selectFrom('inventory.mas_wh')
                    .select(['id', 'name', 'branch', 'pic_1', 'pic_2'])
                    .orderBy('name', 'asc')
                    .execute(),
            ]);

            return { branches, warehouses };
        },

        /**
         * Menyimpan konfigurasi Role + Scope user ke auth.user_scopes secara atomik.
         * Untuk STAFF_GUDANG, juga menyinkronkan pic_1/pic_2 di inventory.mas_wh
         * agar cronjob Lensa Scraper tetap mengenali kredensial akun gudang.
         */
        async saveUserScopeMapping(input: SaveUserScopeInput): Promise<void> {
            await dbClient.transaction().execute(async (trx) => {
                const role = await trx
                    .selectFrom('auth.roles')
                    .select(['id', 'role_key', 'hierarchy_level'])
                    .where('role_key', '=', input.roleKey)
                    .executeTakeFirst();

                if (!role) {
                    throw new Error(`Role ${input.roleKey} tidak ditemukan.`);
                }

                // Hapus scope lama milik user
                await trx
                    .deleteFrom('auth.user_scopes')
                    .where('user_nik', '=', input.userNik)
                    .execute();

                const whIds = Array.from(new Set(input.warehouseIds ?? []));

                if (input.roleKey === 'STAFF_GUDANG') {
                    if (whIds.length > 0) {
                        const whRows = await trx
                            .selectFrom('inventory.mas_wh as wh')
                            .leftJoin('hr.branches as br', (join) =>
                                join.on(
                                    sql<boolean>`UPPER(TRIM(br.branch)) = UPPER(TRIM(wh.branch))`
                                )
                            )
                            .select(['wh.id', 'wh.branch', 'br.area', 'br.regional'])
                            .where(sql<boolean>`${sql.ref('wh.id')} = ANY(${whIds}::int[])`)
                            .execute();

                        for (let i = 0; i < whRows.length; i++) {
                            const w = whRows[i];
                            await trx
                                .insertInto('auth.user_scopes')
                                .values({
                                    user_nik: input.userNik,
                                    role_id: role.id,
                                    area: w.area ?? input.area ?? null,
                                    regional: w.regional ?? input.regional ?? null,
                                    branch: w.branch ?? input.branch ?? null,
                                    service_area: input.serviceArea ?? null,
                                    warehouse_id: w.id,
                                    is_primary: i === 0,
                                    valid_until: input.validUntil ?? null,
                                    created_by: input.actorNik,
                                })
                                .execute();
                        }
                    }

                    // Sinkronkan pic_1 / pic_2 di mas_wh untuk Lensa Scraper
                    await trx
                        .updateTable('inventory.mas_wh')
                        .set({ pic_1: null })
                        .where('pic_1', '=', input.userNik)
                        .$if(whIds.length > 0, (qb) =>
                            qb.where(sql<boolean>`NOT (${sql.ref('id')} = ANY(${whIds}::int[]))`)
                        )
                        .execute();

                    await trx
                        .updateTable('inventory.mas_wh')
                        .set({ pic_2: null })
                        .where('pic_2', '=', input.userNik)
                        .$if(whIds.length > 0, (qb) =>
                            qb.where(sql<boolean>`NOT (${sql.ref('id')} = ANY(${whIds}::int[]))`)
                        )
                        .execute();

                    if (whIds.length > 0) {
                        const targetWhs = await trx
                            .selectFrom('inventory.mas_wh')
                            .select(['id', 'pic_1', 'pic_2'])
                            .where(sql<boolean>`${sql.ref('id')} = ANY(${whIds}::int[])`)
                            .execute();

                        for (const wh of targetWhs) {
                            if (wh.pic_1 === input.userNik || wh.pic_2 === input.userNik) continue;
                            if (!wh.pic_1) {
                                await trx
                                    .updateTable('inventory.mas_wh')
                                    .set({ pic_1: input.userNik })
                                    .where('id', '=', wh.id)
                                    .execute();
                            } else if (!wh.pic_2) {
                                await trx
                                    .updateTable('inventory.mas_wh')
                                    .set({ pic_2: input.userNik })
                                    .where('id', '=', wh.id)
                                    .execute();
                            }
                        }
                    }
                } else {
                    await trx
                        .insertInto('auth.user_scopes')
                        .values({
                            user_nik: input.userNik,
                            role_id: role.id,
                            area: input.area ?? null,
                            regional: input.regional ?? null,
                            branch: input.branch ?? null,
                            service_area: input.serviceArea ?? null,
                            warehouse_id: null,
                            is_primary: true,
                            valid_until: input.validUntil ?? null,
                            created_by: input.actorNik,
                        })
                        .execute();
                }
            });
        },
    };
}

export const rbacRepository = createRbacRepository(db);
