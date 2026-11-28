import type { Pool } from 'pg';
import * as dbModule from '@/lib/db/db';
import { dbLogger } from '@/lib/logger';

export interface LensaEltRepository {
    insertOutLensaStagingBatch(
        batchId: string,
        payload: unknown,
        sourceAction?: 'system' | 'manual',
        metadata?: {
            regional?: string;
            branchId?: string;
            serviceArea?: string;
            stoCode?: string;
        }
    ): Promise<void>;

    processOutLensaStaging(
        batchId: string
    ): Promise<{ processedCount: number; errorCount: number }>;

    insertWOLensaStagingBatch(
        batchId: string,
        payload: unknown,
        sourceAction?: 'system' | 'manual',
        metadata?: {
            regional?: string;
            branchId?: string;
            serviceArea?: string;
            stoCode?: string;
        }
    ): Promise<void>;

    processWOLensaStaging(batchId: string): Promise<{ processedCount: number; errorCount: number }>;

    refreshLensaMaterializedViewsSafe(): Promise<{
        outLensaRefreshed: boolean;
        woLensaRefreshed: boolean;
    }>;
}

export function createLensaEltRepository(customPool?: Pool): LensaEltRepository {
    const getPool = (): Pool => {
        if (customPool) return customPool;
        return dbModule.pool;
    };

    return {
        /**
         * Mengingest raw payload Out Lensa apa adanya ke tabel staging etl.stg_out_lensa_raw.
         */
        async insertOutLensaStagingBatch(
            batchId: string,
            payload: unknown,
            sourceAction: 'system' | 'manual' = 'system',
            metadata?: {
                regional?: string;
                branchId?: string;
                serviceArea?: string;
                stoCode?: string;
            }
        ): Promise<void> {
            const pool = getPool();
            const recordCount = Array.isArray(payload) ? payload.length : 1;
            const query = `
                INSERT INTO etl.stg_out_lensa_raw (
                    batch_id,
                    source_action,
                    source_system,
                    regional,
                    branch_id,
                    service_area,
                    sto_code,
                    raw_payload,
                    record_count,
                    status,
                    created_at
                ) VALUES ($1, $2, 'LENSA_OUT', $3, $4, $5, $6, $7::jsonb, $8, 'PENDING', NOW());
            `;
            await pool.query(query, [
                batchId,
                sourceAction,
                metadata?.regional || 'REGIONAL-5',
                metadata?.branchId || null,
                metadata?.serviceArea || null,
                metadata?.stoCode || null,
                JSON.stringify(payload),
                recordCount,
            ]);
        },

        /**
         * Memicu Stored Procedure inventory.sp_process_stg_out_lensa di database untuk transformasi dan upsert relasional.
         */
        async processOutLensaStaging(
            batchId: string
        ): Promise<{ processedCount: number; errorCount: number }> {
            const pool = getPool();
            const query = 'CALL inventory.sp_process_stg_out_lensa($1, null, null);';
            const res = await pool.query<{
                p_processed_count: number | string;
                p_error_count: number | string;
            }>(query, [batchId]);
            const row = res.rows[0];
            return {
                processedCount: Number(row?.p_processed_count ?? 0),
                errorCount: Number(row?.p_error_count ?? 0),
            };
        },

        /**
         * Mengingest raw payload WO Lensa apa adanya ke tabel staging etl.stg_wo_lensa_raw.
         */
        async insertWOLensaStagingBatch(
            batchId: string,
            payload: unknown,
            sourceAction: 'system' | 'manual' = 'system',
            metadata?: {
                regional?: string;
                branchId?: string;
                serviceArea?: string;
                stoCode?: string;
            }
        ): Promise<void> {
            const pool = getPool();
            const recordCount = Array.isArray(payload) ? payload.length : 1;
            const query = `
                INSERT INTO etl.stg_wo_lensa_raw (
                    batch_id,
                    source_action,
                    source_system,
                    regional,
                    branch_id,
                    service_area,
                    sto_code,
                    raw_payload,
                    record_count,
                    status,
                    created_at
                ) VALUES ($1, $2, 'LENSA_WO', $3, $4, $5, $6, $7::jsonb, $8, 'PENDING', NOW());
            `;
            await pool.query(query, [
                batchId,
                sourceAction,
                metadata?.regional || 'REGIONAL-5',
                metadata?.branchId || null,
                metadata?.serviceArea || null,
                metadata?.stoCode || null,
                JSON.stringify(payload),
                recordCount,
            ]);
        },

        /**
         * Memicu Stored Procedure inventory.sp_process_stg_wo_lensa di database untuk transformasi dan upsert relasional.
         */
        async processWOLensaStaging(
            batchId: string
        ): Promise<{ processedCount: number; errorCount: number }> {
            const pool = getPool();
            const query = 'CALL inventory.sp_process_stg_wo_lensa($1, null, null);';
            const res = await pool.query<{
                p_processed_count: number | string;
                p_error_count: number | string;
            }>(query, [batchId]);
            const row = res.rows[0];
            return {
                processedCount: Number(row?.p_processed_count ?? 0),
                errorCount: Number(row?.p_error_count ?? 0),
            };
        },

        /**
         * Memicu refresh aman MViews Lensa (mv_out_sap_lensa_summary & mv_wo_lensa_rekon_summary)
         * menggunakan PostgreSQL Advisory Transaction Lock untuk mencegah bentrok dengan pg_cron.
         */
        async refreshLensaMaterializedViewsSafe(): Promise<{
            outLensaRefreshed: boolean;
            woLensaRefreshed: boolean;
        }> {
            const pool = getPool();
            try {
                const res = await pool.query<{
                    p_out_lensa_refreshed: boolean;
                    p_wo_lensa_refreshed: boolean;
                }>('CALL analytics.sp_refresh_lensa_mviews_safe(null, null);');
                const row = res.rows[0];
                return {
                    outLensaRefreshed: Boolean(row?.p_out_lensa_refreshed),
                    woLensaRefreshed: Boolean(row?.p_wo_lensa_refreshed),
                };
            } catch (err) {
                dbLogger.warn(
                    '[LENSA-ELT-REPO] Graceful skip on safe mview refresh:',
                    err instanceof Error ? err : { error: String(err) }
                );
                return {
                    outLensaRefreshed: false,
                    woLensaRefreshed: false,
                };
            }
        },
    };
}

export const lensaEltRepository = createLensaEltRepository();
