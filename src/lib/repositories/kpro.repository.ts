import type { Pool } from 'pg';
import * as dbModule from '@/lib/db/db';
import { dbLogger } from '@/lib/logger';

export interface KproRepository {
    createImportJob(fileName: string, fileSize: number): Promise<number>;
    updateImportJob(
        jobId: number,
        status: 'COMPLETED' | 'FAILED',
        stats: {
            totalRows?: number;
            processedRows?: number;
            successRows?: number;
            errorRows?: number;
        }
    ): Promise<void>;
    recordUploadLog(rowCount: number, updatedBy?: number): Promise<void>;
    insertRawStagingBatch(
        jobId: number,
        rows: Record<string, string>[],
        chunkSize?: number
    ): Promise<number>;
    callProcessKproStaging(jobId: number): Promise<{
        totalStaging: number;
        compworkUpserted: number;
        errorCount: number;
    }>;
    refreshKproMaterializedViewSafe(): Promise<boolean>;
    getLastSyncInfo(): Promise<{
        lastUpdatedAt: Date | null;
        totalRecords: number;
        lastJobStatus: string | null;
    }>;
}

export function createKproRepository(customPool?: Pool): KproRepository {
    const getPool = (): Pool => {
        if (customPool) return customPool;
        return dbModule.pool;
    };

    return {
        /**
         * Mencatat job import baru ke tabel etl.import_jobs dengan status 'PROCESSING'.
         */
        async createImportJob(fileName: string, fileSize: number): Promise<number> {
            const pool = getPool();
            const query = `
                INSERT INTO etl.import_jobs (file_name, file_size, status, created_at, started_at)
                VALUES ($1, $2, 'PROCESSING', NOW(), NOW())
                RETURNING id;
            `;
            const res = await pool.query<{ id: string | number }>(query, [fileName, fileSize]);
            return Number(res.rows[0].id);
        },

        /**
         * Memperbarui status dan ringkasan metrik pemrosesan pada etl.import_jobs.
         */
        async updateImportJob(
            jobId: number,
            status: 'COMPLETED' | 'FAILED',
            stats: {
                totalRows?: number;
                processedRows?: number;
                successRows?: number;
                errorRows?: number;
            }
        ): Promise<void> {
            const pool = getPool();
            const query = `
                UPDATE etl.import_jobs
                SET status = $1,
                    finished_at = NOW(),
                    total_rows = COALESCE($2, total_rows),
                    processed_rows = COALESCE($3, processed_rows),
                    success_rows = COALESCE($4, success_rows),
                    error_rows = COALESCE($5, error_rows)
                WHERE id = $6;
            `;
            await pool.query(query, [
                status,
                stats.totalRows ?? null,
                stats.processedRows ?? null,
                stats.successRows ?? null,
                stats.errorRows ?? null,
                jobId,
            ]);
        },

        /**
         * Mencatat riwayat pembaruan tabel data_kpro ke etl.upload_logs.
         */
        async recordUploadLog(_rowCount: number, updatedBy: number = 1): Promise<void> {
            const pool = getPool();
            const query = `
                INSERT INTO etl.upload_logs (table_name, last_updated_at, updated_by, created_at)
                VALUES ('data_kpro', NOW(), $1, NOW());
            `;
            try {
                await pool.query(query, [updatedBy]);
            } catch (err) {
                dbLogger.warn('[KPRO-REPO] Failed to record upload_logs entry', {
                    error: String(err),
                });
            }
        },

        /**
         * Memasukkan data mentah baris tabel K-PRO ke etl.staging_data_kpro_raw
         * menggunakan bulk insert UNNEST berkinerja tinggi (Pilar 1 & Trik 2).
         * Bentuk teks query 100% statis dengan 2 parameter ($1: job_id, $2: text[]),
         * memaksimalkan PostgreSQL Plan Cache dan mengeliminasi interpolasi parameter dinamis.
         */
        async insertRawStagingBatch(
            jobId: number,
            rows: Record<string, string>[],
            chunkSize: number = 1000
        ): Promise<number> {
            if (rows.length === 0) return 0;
            const pool = getPool();
            const client = await pool.connect();
            let totalInserted = 0;

            const query = `
                INSERT INTO etl.staging_data_kpro_raw (job_id, raw_data, imported_at)
                SELECT $1, u.val::jsonb, NOW()
                FROM UNNEST($2::text[]) AS u(val);
            `;

            try {
                await client.query('BEGIN');
                for (let i = 0; i < rows.length; i += chunkSize) {
                    const chunk = rows.slice(i, i + chunkSize);
                    const jsonStrings = chunk.map((r) => JSON.stringify(r));

                    await client.query(query, [jobId, jsonStrings]);
                    totalInserted += chunk.length;
                }
                await client.query('COMMIT');
                return totalInserted;
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        },

        /**
         * Memanggil Stored Procedure etl.sp_process_kpro_staging di database PostgreSQL.
         * SP ini melakukan filter status COMPWORK, safe type casting, bulk UPSERT ke
         * public.data_kpro, penghapusan data staging untuk job ini, dan pembaruan import_jobs.
         */
        async callProcessKproStaging(
            jobId: number
        ): Promise<{ totalStaging: number; compworkUpserted: number; errorCount: number }> {
            const pool = getPool();
            const query = `
                CALL etl.sp_process_kpro_staging($1, null, null, null);
            `;
            const res = await pool.query<{
                p_total_staging: number | string;
                p_compwork_upserted: number | string;
                p_error_count: number | string;
            }>(query, [jobId]);

            const row = res.rows[0];
            return {
                totalStaging: Number(row?.p_total_staging ?? 0),
                compworkUpserted: Number(row?.p_compwork_upserted ?? 0),
                errorCount: Number(row?.p_error_count ?? 0),
            };
        },

        /**
         * Memicu refresh aman materialized view analytics.mv_kpro_rekon_summary.
         * Menggunakan PostgreSQL Advisory Transaction Lock di database untuk mencegah bentrok
         * jika cron 30-menitan sedang berjalan bersamaan.
         */
        async refreshKproMaterializedViewSafe(): Promise<boolean> {
            const pool = getPool();
            try {
                const res = await pool.query<{ p_refreshed: boolean }>(
                    'CALL analytics.sp_refresh_kpro_mview_safe(null);'
                );
                return Boolean(res.rows[0]?.p_refreshed);
            } catch (err) {
                dbLogger.warn(
                    '[KPRO-REPO] Graceful skip on safe mview refresh:',
                    err instanceof Error ? err : { error: String(err) }
                );
                return false;
            }
        },

        /**
         * Mengambil statistik status sinkronisasi terakhir untuk tampilan web nantinya.
         */
        async getLastSyncInfo(): Promise<{
            lastUpdatedAt: Date | null;
            totalRecords: number;
            lastJobStatus: string | null;
        }> {
            const pool = getPool();
            const countRes = await pool.query<{ total: string }>(
                'SELECT count(*) as total FROM public.data_kpro;'
            );
            const totalRecords = Number(countRes.rows[0]?.total || 0);

            const jobRes = await pool.query<{ finished_at: Date; status: string }>(`
                SELECT finished_at, status 
                FROM etl.import_jobs 
                WHERE file_name LIKE 'kpro_%' 
                ORDER BY id DESC 
                LIMIT 1;
            `);

            const lastJob = jobRes.rows[0];

            return {
                lastUpdatedAt: lastJob ? new Date(lastJob.finished_at) : null,
                totalRecords,
                lastJobStatus: lastJob?.status || null,
            };
        },
    };
}

export const kproRepository = createKproRepository();
