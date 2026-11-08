import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSessionNik = vi.fn();
const mockGetSessionUser = vi.fn();
const mockCheckAndStoreIdempotency = vi.fn();
const mockInventoryRepoCreateOutSap = vi.fn();
const mockInventoryRepoRecordSapOut = vi.fn();
const mockGetWarehouses = vi.fn();
const mockListMaterials = vi.fn();
const mockRevalidatePath = vi.fn();
const mockDbExecute = vi.fn();
const mockDbExecuteTakeFirst = vi.fn();
const mockDbSelectFrom = vi.fn();
const mockScrapeReservation = vi.fn();
const mockDecryptLensaPassword = vi.fn();
const mockFindMatchingMasterWarehouse = vi.fn();

vi.mock('next/cache', () => ({
    revalidatePath: (path: string) => mockRevalidatePath(path),
}));

const mockRequireWarehouseAccess = vi.fn();

vi.mock('@/lib/auth-server', () => ({
    getSessionNik: () => mockGetSessionNik(),
    getSessionUser: () => mockGetSessionUser(),
    requireWarehouseAccess: (targetWarehouseId: number) =>
        mockRequireWarehouseAccess(targetWarehouseId),
}));

vi.mock('@/lib/security/idempotency', () => ({
    checkAndStoreIdempotency: (key: string, data: any, callback: any) =>
        mockCheckAndStoreIdempotency(key, data, callback),
}));

vi.mock('@/lib/repositories/inventory.repository', () => ({
    inventoryRepository: {
        createOutSap: (params: any) => mockInventoryRepoCreateOutSap(params),
        recordSapOut: (params: any) => mockInventoryRepoRecordSapOut(params),
        getWarehouses: () => mockGetWarehouses(),
        listMaterials: () => mockListMaterials(),
    },
}));

const mockGetTechnicianByNik = vi.fn();

vi.mock('@/lib/repositories/hr.repository', () => ({
    hrRepository: {
        getTechnicians: vi.fn(),
        getTechnicianByNik: (nik: string) => mockGetTechnicianByNik(nik),
    },
}));

function createChain() {
    const chain: any = {
        select: vi.fn(() => chain),
        selectAll: vi.fn(() => chain),
        where: vi.fn(() => chain),
        orderBy: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        execute: vi.fn((...args: any[]) => mockDbExecute(...args)),
        executeTakeFirst: vi.fn((...args: any[]) => mockDbExecuteTakeFirst(...args)),
    };
    return chain;
}

vi.mock('@/lib/db/db', () => ({
    db: {
        transaction: () => ({
            execute: (cb: any) => mockDbExecute(cb),
        }),
        selectFrom: (...args: any[]) => mockDbSelectFrom(...args),
    },
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
    },
}));

vi.mock('@/lib/lensa-scraper/lensa-scraper', () => ({
    scrapeReservation: (...args: any[]) => mockScrapeReservation(...args),
}));

vi.mock('@/lib/crypto/decrypt-lensa', () => ({
    decryptLensaPassword: (...args: any[]) => mockDecryptLensaPassword(...args),
}));

vi.mock('@/lib/cache/lru-cache', () => ({
    invalidateLiveStockCache: vi.fn(),
    invalidateNotificationCache: vi.fn(),
}));

vi.mock('@/lib/warehouse-helper', () => ({
    findMatchingMasterWarehouse: (...args: any[]) => mockFindMatchingMasterWarehouse(...args),
}));

const {
    createOutSap,
    updateOutSapStatusToIntech,
    resolveWarehouseLensaCredentials,
    getOutSapReservationData,
    getOutLensaReservationOptionsForAdmin,
} = await import(
    '@/app/(DashboardLayout)/form/out-sap/_actions/out-sap-actions'
);

describe('out-sap-actions Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSessionNik.mockResolvedValue('STAFF_TEST_NIK');
        mockGetSessionUser.mockResolvedValue({
            nik: 'STAFF_TEST_NIK',
            role: 'Staff',
            isStaff: true,
            warehouseIds: [1],
        });
        mockGetTechnicianByNik.mockResolvedValue({ nik: 'TKN001', name: 'Budi', sa: 'SA-SURABAYA', is_active: true });
        mockRequireWarehouseAccess.mockResolvedValue({
            nik: 'STAFF_TEST_NIK',
            role: 'Staff',
            isStaff: true,
            warehouseIds: [1],
        });
        mockCheckAndStoreIdempotency.mockImplementation((_key, data, cb) =>
            cb(data).then((res: any) => ({ isDuplicate: false, result: res }))
        );
        mockDbSelectFrom.mockImplementation(() => createChain());
        mockGetWarehouses.mockResolvedValue([
            { id: 1, name: 'GUDANG SURABAYA TIMUR', pic_1: 'PIC001', pic_2: 'PIC002' },
            { id: 2, name: 'GUDANG SIDOARJO', pic_1: 'PIC003', pic_2: null },
        ]);
        mockListMaterials.mockResolvedValue([
            { id: 10, code: 'MAT-01', name: 'Material 1' },
            { id: 20, code: 'MAT-02', name: 'Material 2' },
        ]);
        mockFindMatchingMasterWarehouse.mockImplementation((namaGudang: string, warehouses: any[]) => {
            return warehouses.find((w: any) =>
                namaGudang.toLowerCase().includes('surabaya') && w.id === 1
            ) || null;
        });
    });

    describe('createOutSap', () => {
        const validPayload = {
            idemKey: 'test-idem-key-1',
            warehouse_id: 1,
            nik_teknisi: 'TKN001',
            name_sa: 'SA-SURABAYA',
            id_reservasi: 'RES-001',
            sap_number: 'SAP-123456',
            request_id: 'REQ-001',
            items: [{ designator_id: 10, qty_req: 2, unit_price: 1500 }],
        };

        it('rejects when idemKey is missing', async () => {
            const res = await createOutSap({
                ...validPayload,
                idemKey: '',
            });

            expect(res.success).toBe(false);
            expect(res.error).toContain('Idempotency key required');
        });

        it('rejects when payload fails Zod schema validation', async () => {
            const res = await createOutSap({
                ...validPayload,
                warehouse_id: -1, // Invalid
            });

            expect(res.success).toBe(false);
            expect(res.error).toContain('Invalid input data');
        });

        it('rejects when technician is inactive', async () => {
            mockGetTechnicianByNik.mockResolvedValueOnce({
                nik: 'TKN001',
                name: 'Budi',
                is_active: false,
            });

            const res = await createOutSap(validPayload);

            expect(res.success).toBe(false);
            expect(res.error).toContain('nonaktif');
        });

        it('delegates to inventoryRepository.createOutSap and returns result', async () => {
            mockInventoryRepoCreateOutSap.mockResolvedValueOnce({
                headerId: 88,
                idTrx: 'TRX-OUT-KP-TKN001-26100001',
            });

            const res = await createOutSap(validPayload);

            expect(res.success).toBe(true);
            expect(res.header_id).toBe(88);
            expect(res.id_trx).toBe('TRX-OUT-KP-TKN001-26100001');
            expect(mockInventoryRepoCreateOutSap).toHaveBeenCalledWith({
                warehouseId: 1,
                nikTeknisi: 'TKN001',
                nameSa: 'SA-SURABAYA',
                idReservasi: 'RES-001',
                sapNumber: 'SAP-123456',
                requestId: 'REQ-001',
                createdBy: 'STAFF_TEST_NIK',
                items: [{ designator_id: 10, qty_req: 2, unit_price: 1500 }],
            });
            expect(mockRevalidatePath).toHaveBeenCalledWith('/stock-intech');
            expect(mockRevalidatePath).toHaveBeenCalledWith('/stock-inventory');
            expect(mockRevalidatePath).toHaveBeenCalledWith('/apps/out-material');
        });

        it('detects duplicate idempotency request and returns warning', async () => {
            mockCheckAndStoreIdempotency.mockResolvedValueOnce({
                isDuplicate: true,
                result: null,
            });

            const res = await createOutSap(validPayload);

            expect(res.success).toBe(false);
            expect(res.error).toContain('Transaksi ganda terdeteksi');
        });

        it('catches and formats repository failure', async () => {
            mockInventoryRepoCreateOutSap.mockRejectedValueOnce(
                new Error('Stok tidak mencukupi di warehouse 1')
            );

            const res = await createOutSap(validPayload);

            expect(res.success).toBe(false);
            expect(res.error).toBe('Stok tidak mencukupi di warehouse 1');
        });
    });

    describe('updateOutSapStatusToIntech', () => {
        it('updates status and calls inventoryRepository.recordSapOut', async () => {
            mockDbExecute.mockImplementation(async (cb: any) => {
                const fakeTrx = {
                    updateTable: () => ({
                        set: () => ({
                            where: () => ({
                                execute: vi.fn(),
                            }),
                        }),
                    }),
                    selectFrom: () => ({
                        select: () => ({
                            where: () => ({
                                executeTakeFirst: vi.fn().mockResolvedValue({ warehouse_id: 5 }),
                            }),
                        }),
                    }),
                };
                return cb(fakeTrx);
            });

            mockInventoryRepoRecordSapOut.mockResolvedValueOnce({ rows: [] });

            const res = await updateOutSapStatusToIntech(10);

            expect(res.success).toBe(true);
            expect(mockInventoryRepoRecordSapOut).toHaveBeenCalledWith({
                headerId: 10,
                warehouseId: 5,
                createdBy: 'STAFF_TEST_NIK',
            });
            expect(mockRevalidatePath).toHaveBeenCalledWith('/stock-intech');
        });
    });

    describe('resolveWarehouseLensaCredentials', () => {
        it('returns null if warehouse does not exist', async () => {
            mockDbSelectFrom.mockImplementationOnce(() => ({
                select: () => ({
                    where: () => ({
                        executeTakeFirst: vi.fn().mockResolvedValue(null),
                    }),
                }),
            }));

            const res = await resolveWarehouseLensaCredentials(999);
            expect(res).toBeNull();
        });

        it('returns PIC 1 credentials when PIC 1 has Lensa account', async () => {
            mockDbSelectFrom
                .mockImplementationOnce(() => ({
                    select: () => ({
                        where: () => ({
                            executeTakeFirst: vi.fn().mockResolvedValue({
                                id: 1,
                                name: 'GUDANG SURABAYA TIMUR',
                                pic_1: 'PIC001',
                                pic_2: 'PIC002',
                            }),
                        }),
                    }),
                }))
                .mockImplementationOnce(() => ({
                    select: () => ({
                        where: () => ({
                            where: () => ({
                                where: () => ({
                                    executeTakeFirst: vi.fn().mockResolvedValue({
                                        lensa_username: 'lensa_pic1',
                                        lensa_password: 'enc_pic1_pass',
                                    }),
                                }),
                            }),
                        }),
                    }),
                }));

            mockDecryptLensaPassword.mockReturnValueOnce('decrypted_pic1_pass');

            const res = await resolveWarehouseLensaCredentials(1);

            expect(res).toEqual({
                username: 'lensa_pic1',
                password: 'decrypted_pic1_pass',
                picNik: 'PIC001',
            });
        });

        it('falls back to PIC 2 when PIC 1 has no Lensa account', async () => {
            mockDbSelectFrom
                .mockImplementationOnce(() => ({
                    select: () => ({
                        where: () => ({
                            executeTakeFirst: vi.fn().mockResolvedValue({
                                id: 1,
                                name: 'GUDANG SURABAYA TIMUR',
                                pic_1: 'PIC001',
                                pic_2: 'PIC002',
                            }),
                        }),
                    }),
                }))
                .mockImplementationOnce(() => ({
                    select: () => ({
                        where: () => ({
                            where: () => ({
                                where: () => ({
                                    executeTakeFirst: vi.fn().mockResolvedValue(null),
                                }),
                            }),
                        }),
                    }),
                }))
                .mockImplementationOnce(() => ({
                    select: () => ({
                        where: () => ({
                            where: () => ({
                                where: () => ({
                                    executeTakeFirst: vi.fn().mockResolvedValue({
                                        lensa_username: 'lensa_pic2',
                                        lensa_password: 'enc_pic2_pass',
                                    }),
                                }),
                            }),
                        }),
                    }),
                }));

            mockDecryptLensaPassword.mockReturnValueOnce('decrypted_pic2_pass');

            const res = await resolveWarehouseLensaCredentials(1);

            expect(res).toEqual({
                username: 'lensa_pic2',
                password: 'decrypted_pic2_pass',
                picNik: 'PIC002',
            });
        });

        it('returns null if neither PIC 1 nor PIC 2 has Lensa credentials', async () => {
            mockDbSelectFrom
                .mockImplementationOnce(() => ({
                    select: () => ({
                        where: () => ({
                            executeTakeFirst: vi.fn().mockResolvedValue({
                                id: 1,
                                name: 'GUDANG SURABAYA TIMUR',
                                pic_1: 'PIC001',
                                pic_2: 'PIC002',
                            }),
                        }),
                    }),
                }))
                .mockImplementationOnce(() => ({
                    select: () => ({
                        where: () => ({
                            where: () => ({
                                where: () => ({
                                    executeTakeFirst: vi.fn().mockResolvedValue(null),
                                }),
                            }),
                        }),
                    }),
                }))
                .mockImplementationOnce(() => ({
                    select: () => ({
                        where: () => ({
                            where: () => ({
                                where: () => ({
                                    executeTakeFirst: vi.fn().mockResolvedValue(null),
                                }),
                            }),
                        }),
                    }),
                }));

            const res = await resolveWarehouseLensaCredentials(1);
            expect(res).toBeNull();
        });
    });

    describe('getOutSapReservationData', () => {
        it('rejects when requestId is empty', async () => {
            const res = await getOutSapReservationData({ requestId: '   ' });
            expect(res.success).toBe(false);
            expect(res.error).toBe('Masukkan Request ID terlebih dahulu');
        });

        it('rejects Staff when staff has no warehouse assignment', async () => {
            mockGetSessionUser.mockResolvedValueOnce({
                nik: 'STAFF_WITHOUT_WH',
                isStaff: true,
                warehouseIds: [],
            });

            const res = await getOutSapReservationData({ requestId: 'REQ-001' });

            expect(res.success).toBe(false);
            expect(res.error).toContain('tidak memiliki penugasan gudang');
        });

        it('rejects Staff when choosing warehouse outside assignment', async () => {
            mockGetSessionUser.mockResolvedValueOnce({
                nik: 'STAFF_TEST_NIK',
                isStaff: true,
                warehouseIds: [1],
            });

            const res = await getOutSapReservationData({
                requestId: 'REQ-001',
                warehouseId: 99,
            });

            expect(res.success).toBe(false);
            expect(res.error).toContain('tidak memiliki akses ke gudang yang dipilih');
        });

        it('returns data directly from database if already present in out_lensa_ref_header and out_lensa_ref_list', async () => {
            mockGetSessionUser.mockResolvedValueOnce({
                nik: 'STAFF_TEST_NIK',
                isStaff: true,
                warehouseIds: [1],
            });

            const headerRow = {
                id: 50,
                reservation_id: 'REQ-DB-001',
                reservation_id_sap: 'RES-SAP-50',
                gi_number: 'GI-998877',
                nama_gudang: 'GUDANG SURABAYA TIMUR',
                nik_pemakai: 'TKN001',
            };

            const detailRows = [
                { id: 1, header_id: 50, material_id: 'MAT-01', qty_approve: '4' },
            ];

            mockDbSelectFrom
                .mockImplementationOnce(() => ({
                    selectAll: () => ({
                        where: () => ({
                            executeTakeFirst: vi.fn().mockResolvedValue(headerRow),
                        }),
                    }),
                }))
                .mockImplementationOnce(() => ({
                    selectAll: () => ({
                        where: () => ({
                            execute: vi.fn().mockResolvedValue(detailRows),
                        }),
                    }),
                }));

            const res = await getOutSapReservationData({ requestId: 'REQ-DB-001' });

            expect(res.success).toBe(true);
            expect(res.data?.source).toBe('database');
            expect(res.data?.request_id).toBe('REQ-DB-001');
            expect(res.data?.id_reservasi).toBe('RES-SAP-50');
            expect(res.data?.sap_number).toBe('GI-998877');
            expect(res.data?.items).toHaveLength(1);
            expect(res.data?.items[0].designator_id).toBe('10');
            expect(res.data?.items[0].qty_req).toBe(4);
            expect(mockScrapeReservation).not.toHaveBeenCalled();
        });

        it('scrapes from Lensa using warehouse PIC credentials when not in database', async () => {
            mockGetSessionUser.mockResolvedValueOnce({
                nik: 'STAFF_TEST_NIK',
                isStaff: true,
                warehouseIds: [1],
            });

            // 1. DB header query returns null
            mockDbSelectFrom.mockImplementationOnce(() => ({
                selectAll: () => ({
                    where: () => ({
                        executeTakeFirst: vi.fn().mockResolvedValue(null),
                    }),
                }),
            }));

            // 2. resolveWarehouseLensaCredentials queries mas_wh then auth.user
            mockDbSelectFrom
                .mockImplementationOnce(() => ({
                    select: () => ({
                        where: () => ({
                            executeTakeFirst: vi.fn().mockResolvedValue({
                                id: 1,
                                name: 'GUDANG SURABAYA TIMUR',
                                pic_1: 'PIC001',
                                pic_2: null,
                            }),
                        }),
                    }),
                }))
                .mockImplementationOnce(() => ({
                    select: () => ({
                        where: () => ({
                            where: () => ({
                                where: () => ({
                                    executeTakeFirst: vi.fn().mockResolvedValue({
                                        lensa_username: 'pic1_user',
                                        lensa_password: 'enc_pic1_pass',
                                    }),
                                }),
                            }),
                        }),
                    }),
                }));

            mockDecryptLensaPassword.mockReturnValueOnce('plain_pic1_pass');

            mockScrapeReservation.mockResolvedValueOnce({
                listData: {
                    data: [
                        {
                            reservation_id_sap: 'RES-LIVE-001',
                            gi_number: 'GI-LIVE-001',
                            nama_gudang: 'GUDANG SURABAYA TIMUR',
                        },
                    ],
                },
                detailContent: {
                    headerInfo: { nikPemakai: 'TKN001' },
                    materials: [{ 'ID MATERIAL': 'MAT-01', 'QTY ACCEPTED': '2' }],
                },
            });

            const res = await getOutSapReservationData({
                requestId: 'REQ-LIVE-001',
                warehouseId: 1,
            });

            expect(res.success).toBe(true);
            expect(res.data?.source).toBe('lensa');
            expect(res.data?.id_reservasi).toBe('RES-LIVE-001');
            expect(res.data?.sap_number).toBe('GI-LIVE-001');
            expect(res.data?.items).toHaveLength(1);
            expect(res.data?.items[0].designator_id).toBe('10');
            expect(res.data?.items[0].qty_req).toBe(2);
            expect(mockScrapeReservation).toHaveBeenCalledWith(
                'REQ-LIVE-001',
                'pic1_user',
                'plain_pic1_pass'
            );
        });

        it('returns error when Lensa scraper returns an error', async () => {
            mockGetSessionUser.mockResolvedValueOnce({
                nik: 'STAFF_TEST_NIK',
                isStaff: true,
                warehouseIds: [1],
            });

            // DB header query returns null
            mockDbSelectFrom.mockImplementationOnce(() => ({
                selectAll: () => ({
                    where: () => ({
                        executeTakeFirst: vi.fn().mockResolvedValue(null),
                    }),
                }),
            }));

            // resolveWarehouseLensaCredentials
            mockDbSelectFrom
                .mockImplementationOnce(() => ({
                    select: () => ({
                        where: () => ({
                            executeTakeFirst: vi.fn().mockResolvedValue({
                                id: 1,
                                name: 'GUDANG SURABAYA TIMUR',
                                pic_1: 'PIC001',
                                pic_2: null,
                            }),
                        }),
                    }),
                }))
                .mockImplementationOnce(() => ({
                    select: () => ({
                        where: () => ({
                            where: () => ({
                                where: () => ({
                                    executeTakeFirst: vi.fn().mockResolvedValue({
                                        lensa_username: 'pic1_user',
                                        lensa_password: 'enc_pic1_pass',
                                    }),
                                }),
                            }),
                        }),
                    }),
                }));

            mockDecryptLensaPassword.mockReturnValueOnce('plain_pic1_pass');

            mockScrapeReservation.mockResolvedValueOnce({
                error: 'Sesi Lensa kadaluarsa atau username/password salah',
            });

            const res = await getOutSapReservationData({
                requestId: 'REQ-FAIL-001',
                warehouseId: 1,
            });

            expect(res.success).toBe(false);
            expect(res.error).toBe('Sesi Lensa kadaluarsa atau username/password salah');
        });
    });

    describe('getOutLensaReservationOptionsForAdmin', () => {
        it('returns empty array if user is Staff', async () => {
            mockGetSessionUser.mockResolvedValueOnce({
                nik: 'STAFF_NIK',
                isStaff: true,
            });

            const res = await getOutLensaReservationOptionsForAdmin();

            expect(res.success).toBe(true);
            expect(res.data).toEqual([]);
        });

        it('returns list of reservation options from out_lensa_ref_header if user is Admin', async () => {
            mockGetSessionUser.mockResolvedValueOnce({
                nik: 'ADMIN_NIK',
                isStaff: false,
            });

            const rows = [
                {
                    id: 1,
                    reservation_id: 'REQ-ADMIN-01',
                    gi_number: 'GI-111',
                    nama_gudang: 'SURABAYA TIMUR',
                    sap_out_check: true,
                    created_at: new Date('2026-05-01'),
                },
                {
                    id: 2,
                    reservation_id: 'REQ-ADMIN-02',
                    gi_number: null,
                    nama_gudang: 'SIDOARJO',
                    sap_out_check: false,
                    created_at: new Date('2026-05-02'),
                },
            ];

            mockDbSelectFrom.mockImplementationOnce(() => ({
                select: () => ({
                    where: () => ({
                        orderBy: () => ({
                            limit: () => ({
                                execute: vi.fn().mockResolvedValue(rows),
                            }),
                        }),
                    }),
                }),
            }));

            const res = await getOutLensaReservationOptionsForAdmin();

            expect(res.success).toBe(true);
            expect(res.data).toHaveLength(2);
            expect(res.data[0].value).toBe('REQ-ADMIN-01');
            expect(res.data[0].label).toContain('Sudah Out SAP');
            expect(res.data[0].is_processed).toBe(true);
            expect(res.data[1].value).toBe('REQ-ADMIN-02');
            expect(res.data[1].is_processed).toBe(false);
        });
    });
});
