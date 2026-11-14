import type { Pool } from 'pg';
import * as dbModule from '@/lib/db/db';
import { dbLogger } from '@/lib/logger';
import type { KproCompworkRecord } from '../kpro/kpro-types';

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
    batchUpsertCompwork(records: KproCompworkRecord[], chunkSize?: number): Promise<number>;
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
        async recordUploadLog(rowCount: number, updatedBy: number = 1): Promise<void> {
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
         * Melakukan batch UPSERT untuk data COMPWORK langsung ke tabel public.data_kpro.
         * Menggunakan parameterized chunk query agar aman dari SQL injection dan hemat memory.
         */
        async batchUpsertCompwork(
            records: KproCompworkRecord[],
            chunkSize: number = 500
        ): Promise<number> {
            if (records.length === 0) return 0;

            const pool = getPool();
            const client = await pool.connect();
            let totalUpserted = 0;

            try {
                await client.query('BEGIN');

                for (let i = 0; i < records.length; i += chunkSize) {
                    const chunk = records.slice(i, i + chunkSize);

                    // Daftar kolom (64 kolom)
                    const columns = [
                        'wonum',
                        'crmordertype',
                        'scorderno',
                        'servicenum',
                        'ncli',
                        'flag_order',
                        'regional_baru',
                        'district_baru',
                        'datel_baru',
                        'sto',
                        'regional_lama',
                        'district_lama',
                        'datel_lama',
                        'package_name',
                        'product',
                        'jenis_product',
                        'customer_name',
                        'customer_address',
                        'no_hp',
                        'latitude_ins',
                        'longitude_ins',
                        'datecreated',
                        'tgl_manja',
                        'actstart',
                        'schedule_labor',
                        'statusdate',
                        'tanggal_approval',
                        'status_survey',
                        'status_task',
                        'status',
                        'status_approval',
                        'status_odp',
                        'desc_task',
                        'engineermemo',
                        'catatan_teknisi',
                        'keterangan_pi',
                        'engineermemo_akhir',
                        'amcrew',
                        'laborcode',
                        'laborname',
                        'chief_code',
                        'chief_name',
                        'ownergroup',
                        'errorcode',
                        'suberrorcode',
                        'errorcode_akhir',
                        'suberrorcode_akhir',
                        'measurement',
                        'odp_name',
                        'odp_name_ut',
                        'new_reservationid',
                        'tiket_id',
                        'flag_wsa',
                        'flag_pda',
                        'homepassid',
                        'tgl_pi_awal',
                        'tgl_pi_akhir',
                        'tgl_fallout_awal',
                        'tgl_fallout_akhir',
                        'territory_tif',
                        'district_tif',
                        'long_inst_ut',
                        'lat_inst_ut',
                        'long_retag_ut',
                        'lat_retag_ut',
                    ];

                    const valueRows: string[] = [];
                    const values: unknown[] = [];
                    let paramIdx = 1;

                    for (const row of chunk) {
                        const rowPlaceholders: string[] = [];
                        for (const col of columns) {
                            rowPlaceholders.push(`$${paramIdx++}`);
                            values.push(row[col as keyof KproCompworkRecord]);
                        }
                        // Tambahkan created_at dan updated_at
                        valueRows.push(`(${rowPlaceholders.join(', ')}, NOW(), NOW())`);
                    }

                    // On conflict set clause (kecuali wonum dan created_at)
                    const updateSets = columns
                        .filter((c) => c !== 'wonum')
                        .map((c) => `${c} = EXCLUDED.${c}`)
                        .join(',\n                        ');

                    const sql = `
                        INSERT INTO public.data_kpro (
                            ${columns.join(', ')},
                            created_at,
                            updated_at
                        )
                        VALUES ${valueRows.join(',\n')}
                        ON CONFLICT (wonum) DO UPDATE SET
                            ${updateSets},
                            updated_at = NOW();
                    `;

                    await client.query(sql, values);
                    totalUpserted += chunk.length;
                }

                await client.query('COMMIT');
                return totalUpserted;
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
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

