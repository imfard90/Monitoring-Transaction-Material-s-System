import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSessionUser = vi.fn();
const mockWarehouseScope = vi.fn();
const mockGetBatchTechnicianIntechStock = vi.fn();
const mockGetTechnicianIntechStock = vi.fn();

const mockExecute = vi.fn();
const mockExecuteTakeFirst = vi.fn();

vi.mock('@/lib/auth-server', () => ({
    getSessionUser: () => mockGetSessionUser(),
}));

vi.mock('@/lib/policies', () => ({
    warehouseScope: (...args: any[]) => mockWarehouseScope(...args),
}));

vi.mock('@/lib/repositories/inventory.repository', () => ({
    inventoryRepository: {
        getBatchTechnicianIntechStock: (...args: any[]) =>
            mockGetBatchTechnicianIntechStock(...args),
        getTechnicianIntechStock: (...args: any[]) => mockGetTechnicianIntechStock(...args),
    },
}));

vi.mock('@/lib/lensa-scraper/lensa-scraper', () => ({
    scrapeStockTeknisi: vi.fn(),
}));

vi.mock('@/lib/crypto/decrypt-lensa', () => ({
    decryptLensaPassword: vi.fn((pwd: string) => pwd),
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
    },
}));

const mockSelectQuery: any = {
    leftJoin: () => mockSelectQuery,
    innerJoin: () => mockSelectQuery,
    select: () => mockSelectQuery,
    where: () => mockSelectQuery,
    orderBy: () => mockSelectQuery,
    limit: () => mockSelectQuery,
    offset: () => mockSelectQuery,
    execute: () => mockExecute(),
    executeTakeFirst: () => mockExecuteTakeFirst(),
};

const mockUpdateQuery: any = {
    set: () => mockUpdateQuery,
    where: () => mockUpdateQuery,
    execute: vi.fn(),
};

vi.mock('@/lib/db/db', () => ({
    db: {
        selectFrom: () => mockSelectQuery,
        updateTable: () => mockUpdateQuery,
    },
}));

vi.mock('kysely', () => ({
    sql: (strings: TemplateStringsArray, ...values: any[]) => ({ strings, values }),
}));

const { getTeknisiStockList, getStockComparison, getLiveStockComparison, getTeknisiList } =
    await import('@/app/(DashboardLayout)/reference/_actions/stock-comparison-actions');

describe('stock-comparison-actions unit tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getTeknisiStockList', () => {
        it('calculates status as match, selisih, failed, and not_scraped accurately', async () => {
            mockGetSessionUser.mockResolvedValueOnce({
                nik: 'ADM01',
                isStaff: false,
            });
            mockWarehouseScope.mockReturnValueOnce(null);

            // Technicians from hr.technicians
            mockExecute.mockResolvedValueOnce([
                {
                    nik: 'TECH01',
                    name: 'Budi Match',
                    wh_id: 1,
                    branch: 'SBY',
                    service_area: 'SA1',
                    warehouse_name: 'WH1',
                    ref_intech_lensa: {
                        status: 'success',
                        scraped_at: '2026-10-25T10:00:00Z',
                        materials: [
                            {
                                id_material: 'MAT-A',
                                nama_material: 'Drop Core',
                                stock_teknisi: '5',
                            },
                        ],
                    },
                },
                {
                    nik: 'TECH02',
                    name: 'Andi Selisih',
                    wh_id: 1,
                    branch: 'SBY',
                    service_area: 'SA1',
                    warehouse_name: 'WH1',
                    ref_intech_lensa: {
                        status: 'success',
                        scraped_at: '2026-10-25T10:00:00Z',
                        materials: [
                            {
                                id_material: 'MAT-A',
                                nama_material: 'Drop Core',
                                stock_teknisi: '10',
                            },
                        ],
                    },
                },
                {
                    nik: 'TECH03',
                    name: 'Citra Failed',
                    wh_id: 1,
                    branch: 'SBY',
                    service_area: 'SA1',
                    warehouse_name: 'WH1',
                    ref_intech_lensa: {
                        status: 'failed',
                        scraped_at: '2026-10-25T10:00:00Z',
                    },
                },
                {
                    nik: 'TECH04',
                    name: 'Doni Not Scraped',
                    wh_id: 1,
                    branch: 'SBY',
                    service_area: 'SA1',
                    warehouse_name: 'WH1',
                    ref_intech_lensa: null,
                },
            ]);

            // MTMS stock from batch repo method
            mockGetBatchTechnicianIntechStock.mockResolvedValueOnce([
                { nik_teknisi: 'TECH01', material_code: 'MAT-A', qty_intech: 5 }, // Exact match with 5
                { nik_teknisi: 'TECH02', material_code: 'MAT-A', qty_intech: 3 }, // Selisih: 10 vs 3
            ]);

            const result = await getTeknisiStockList();

            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(4);

            const [tech1, tech2, tech3, tech4] = result.data!;

            // TECH01: match
            expect(tech1.nik).toBe('TECH01');
            expect(tech1.status).toBe('match');
            expect(tech1.total_selisih).toBe(0);

            // TECH02: selisih
            expect(tech2.nik).toBe('TECH02');
            expect(tech2.status).toBe('selisih');
            expect(tech2.total_selisih).toBe(1);

            // TECH03: failed
            expect(tech3.nik).toBe('TECH03');
            expect(tech3.status).toBe('failed');

            // TECH04: not_scraped
            expect(tech4.nik).toBe('TECH04');
            expect(tech4.status).toBe('not_scraped');
        });

        it('applies exclude_intech_lensa when calculating status and total_selisih', async () => {
            mockGetSessionUser.mockResolvedValueOnce({
                nik: 'ADM01',
                isStaff: false,
            });
            mockWarehouseScope.mockReturnValueOnce(null);

            mockExecute.mockResolvedValueOnce([
                {
                    nik: 'TECH_EXCLUDE',
                    name: 'Budi Exclude',
                    wh_id: 1,
                    branch: 'SBY',
                    service_area: 'SA1',
                    warehouse_name: 'WH1',
                    ref_intech_lensa: {
                        status: 'success',
                        scraped_at: '2026-10-25T10:00:00Z',
                        materials: [
                            {
                                id_material: 'MAT-A',
                                nama_material: 'Drop Core',
                                stock_teknisi: '10',
                            },
                        ],
                    },
                    exclude_intech_lensa: [
                        {
                            id_material: 'MAT-A',
                            nama_material: 'Drop Core',
                            qty: 5,
                        },
                    ],
                },
            ]);

            mockGetBatchTechnicianIntechStock.mockResolvedValueOnce([
                {
                    nik_teknisi: 'TECH_EXCLUDE',
                    material_code: 'MAT-A',
                    qty_intech: 5,
                },
            ]);

            const result = await getTeknisiStockList();
            expect(result.success).toBe(true);
            expect(result.data?.[0].status).toBe('match');
            expect(result.data?.[0].total_selisih).toBe(0);
        });
    });

    describe('getStockComparison', () => {
        it('rejects empty or whitespace NIK via Zod validation', async () => {
            const result = await getStockComparison('   ');
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/NIK/i);
        });

        it('enforces warehouse scoping for staff user', async () => {
            mockGetSessionUser.mockResolvedValueOnce({
                nik: 'STF01',
                isStaff: true,
            });
            mockWarehouseScope.mockReturnValueOnce([1, 2]);

            // Technician assigned to wh_id 99 (not in [1, 2])
            mockExecuteTakeFirst.mockResolvedValueOnce({
                nik: 'TECH99',
                name: 'Teknisi Luar',
                wh_id: 99,
                ref_intech_lensa: null,
            });

            const result = await getStockComparison('TECH99');
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/Akses ditolak/i);
        });

        it('adjusts stock_lensa and sets exclude_qty and match_status in getStockComparison', async () => {
            mockGetSessionUser.mockResolvedValueOnce({
                nik: 'ADM01',
                isStaff: false,
            });
            mockWarehouseScope.mockReturnValueOnce(null);

            mockExecuteTakeFirst.mockResolvedValueOnce({
                nik: 'TECH_EX',
                name: 'Budi Ex',
                wh_id: 1,
                branch: 'SBY',
                service_area: 'SA1',
                warehouse_name: 'WH1',
                ref_intech_lensa: {
                    status: 'success',
                    scraped_at: '2026-10-25T10:00:00Z',
                    materials: [
                        {
                            id_material: 'MAT-A',
                            nama_material: 'Drop Core',
                            stock_teknisi: '8',
                            satuan: 'M',
                        },
                    ],
                },
                exclude_intech_lensa: [
                    {
                        id_material: 'MAT-A',
                        nama_material: 'Drop Core',
                        qty: 3,
                    },
                ],
            });

            mockGetTechnicianIntechStock.mockResolvedValueOnce([
                {
                    material_code: 'MAT-A',
                    material_name: 'Drop Core',
                    qty_intech: 5,
                },
            ]);

            const result = await getStockComparison('TECH_EX');
            expect(result.success).toBe(true);
            const item = result.data?.items[0];
            expect(item?.raw_stock_lensa).toBe(8);
            expect(item?.exclude_qty).toBe(3);
            expect(item?.stock_lensa).toBe(5); // 8 - 3
            expect(item?.stock_mtms).toBe(5);
            expect(item?.selisih).toBe(0);
            expect(item?.match_status).toBe('match');
        });
    });

    describe('getLiveStockComparison', () => {
        it('blocks staff user from initiating live scraping', async () => {
            mockGetSessionUser.mockResolvedValueOnce({
                nik: 'STF01',
                isStaff: true,
            });

            const result = await getLiveStockComparison('TECH01');
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/Hanya non-staff/i);
        });
    });

    describe('getTeknisiList', () => {
        it('returns technicians with both name and nama properties', async () => {
            mockGetSessionUser.mockResolvedValueOnce({
                nik: 'ADM01',
                isStaff: false,
            });
            mockWarehouseScope.mockReturnValueOnce(null);

            mockExecute.mockResolvedValueOnce([
                { nik: 'T01', name: 'Agus' },
                { nik: 'T02', name: 'Bambang' },
            ]);

            const result = await getTeknisiList();
            expect(result.success).toBe(true);
            expect(result.data).toEqual([
                { nik: 'T01', name: 'Agus', nama: 'Agus' },
                { nik: 'T02', name: 'Bambang', nama: 'Bambang' },
            ]);
        });
    });
});
