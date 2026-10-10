/**
 * HR Repository — consolidated reference-data queries for HR domain.
 *
 * Previously, `getTechnicians` and `getBranches` were duplicated across:
 *   - management/technician/actions.ts (admin view, all records)
 *   - out-sap/_actions/out-sap-actions.ts (scoped view for forms)
 *
 * This repository provides the canonical query implementations. Server actions
 * wrap these with auth + error handling.
 */
import { db } from '@/lib/db/db';

export const hrRepository = {
  /**
   * Get all technicians with optional service-area filter.
   * Joins branches and mitras for display columns.
   */
  getTechnicians: (options?: { serviceArea?: string }) => {
    let query = db
      .selectFrom('hr.technicians as t')
      .leftJoin('hr.branches as b', 'b.id', 't.branch_id')
      .leftJoin('hr.mitras as m', 'm.id', 't.mitra_id')
      .select([
        't.id',
        't.nik',
        't.name',
        't.is_active',
        't.branch_id',
        't.mitra_id',
        'b.service_area',
        'm.mitra_name',
      ]);

    if (options?.serviceArea) {
      query = query.where('b.service_area', '=', options.serviceArea);
    }

    return query.orderBy('t.name', 'asc').execute();
  },

  /**
   * Get technician by NIK (single record).
   */
  getTechnicianByNik: (nik: string) =>
    db
      .selectFrom('hr.technicians as t')
      .leftJoin('hr.branches as b', 'b.id', 't.branch_id')
      .select(['t.nik', 't.name', 'b.service_area as sa'])
      .where('t.nik', '=', nik)
      .executeTakeFirst(),

  /**
   * Get all branches, optionally scoped to a specific branch name.
   */
  getBranches: (options?: { branchName?: string }) => {
    let query = db
      .selectFrom('hr.branches')
      .select(['id', 'service_area', 'branch']);

    if (options?.branchName) {
      query = query.where('branch', '=', options.branchName);
    }

    return query.orderBy('service_area', 'asc').execute();
  },

  /**
   * Get all mitras.
   */
  getMitras: () =>
    db
      .selectFrom('hr.mitras')
      .select(['id', 'mitra_name'])
      .orderBy('mitra_name', 'asc')
      .execute(),
};
