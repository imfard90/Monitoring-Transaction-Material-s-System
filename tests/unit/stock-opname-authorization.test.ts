import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSessionUser = vi.fn();
const mockExecute = vi.fn();
const mockRateLimit = vi.fn();
const mockCreateLog = vi.fn();
const mockGetLogById = vi.fn();
const mockApproveLog = vi.fn();
const mockRejectLog = vi.fn();

vi.mock('@/lib/auth-server', () => ({
    getSessionUser: () => mockGetSessionUser(),
}));

vi.mock('@/lib/rate-limit', () => ({
    rateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: { info: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/db/db', () => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.selectFrom = self;
    chain.innerJoin = (_table: string, build: (join: { onRef: () => void }) => void) => {
        build({ onRef: () => undefined });
        return chain;
    };
    chain.where = self;
    chain.select = self;
    chain.execute = () => mockExecute();
    return { db: chain };
});

vi.mock('@/lib/repositories/stock-opname.repository', () => ({
    createStockOpnameRepository: () => ({
        createLog: (...args: unknown[]) => mockCreateLog(...args),
        getLogs: vi.fn(),
        getLogById: (...args: unknown[]) => mockGetLogById(...args),
        approveLog: (...args: unknown[]) => mockApproveLog(...args),
        rejectLog: (...args: unknown[]) => mockRejectLog(...args),
    }),
}));

const STAFF = { nik: 'STF001', role: 'Staff', warehouseIds: [10], isStaff: true };
const ADMIN = { nik: 'ADM001', role: 'Administrator', warehouseIds: [], isStaff: false };

const { POST } = await import('@/app/api/stock-opname/route');
const { approveStockOpname, getStockOpnameLogById, rejectStockOpname, saveStockOpname } =
    await import('@/app/(DashboardLayout)/form/stock-opname/_actions/stock-opname-actions');

function post(materials: unknown) {
    return POST(
        new Request('http://localhost/api/stock-opname', {
            method: 'POST',
            body: JSON.stringify({ materials }),
        }) as never
    );
}

describe('stock opname warehouse scope', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRateLimit.mockResolvedValue({ success: true, remaining: 19, limit: 20 });
        mockExecute.mockResolvedValue([]);
        mockCreateLog.mockResolvedValue({ id: 1 });
        mockGetLogById.mockResolvedValue({ id: 7, warehouse_id: 99, status: 'pending' });
    });

    it('rejects a staff match request for a warehouse outside their scope', async () => {
        mockGetSessionUser.mockResolvedValue(STAFF);
        const response = await post([{ warehouse_id: 99, material_code: 'ABC', saldo_sap: 1 }]);
        expect(response.status).toBe(403);
        expect(mockExecute).not.toHaveBeenCalled();
    });

    it('matches only warehouses assigned to the staff user', async () => {
        mockGetSessionUser.mockResolvedValue(STAFF);
        mockExecute.mockResolvedValue([
            { warehouse_id: 10, material_code: 'ABC', material_name: 'Kabel', qty_stock: 2 },
        ]);
        const response = await post([
            { warehouse_id: 10, material_code: 'ABC', saldo_sap: 5 },
            { warehouse_id: 99, material_code: 'SECRET', saldo_sap: 9 },
        ]);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data).toEqual([
            {
                material_code: 'ABC',
                material_name: 'Kabel',
                qty_system: 2,
                qty_opname: 5,
                difference: 3,
            },
        ]);
        expect(JSON.stringify(body)).not.toContain('SECRET');
    });

    it('returns 401 when the session is missing', async () => {
        mockGetSessionUser.mockRejectedValue(new Error('Authentication required'));
        const response = await post([{ warehouse_id: 10, material_code: 'ABC', saldo_sap: 1 }]);
        expect(response.status).toBe(401);
        expect(mockExecute).not.toHaveBeenCalled();
    });

    it('returns 429 when the matcher is rate limited', async () => {
        mockGetSessionUser.mockResolvedValue(ADMIN);
        mockRateLimit.mockResolvedValue({ success: false, remaining: 0, limit: 20 });
        const response = await post([{ warehouse_id: 10, material_code: 'ABC', saldo_sap: 1 }]);
        expect(response.status).toBe(429);
        expect(mockExecute).not.toHaveBeenCalled();
    });

    it('forces staff saves to pending and blocks other warehouses', async () => {
        mockGetSessionUser.mockResolvedValue(STAFF);
        await expect(
            saveStockOpname({
                warehouse_id: 99,
                warehouse_name: 'Lain',
                details: [],
                status: 'approved',
            })
        ).rejects.toThrow(/denied/i);
        const saved = await saveStockOpname({
            warehouse_id: 10,
            warehouse_name: 'Gudang A',
            details: [
                {
                    material_code: 'ABC',
                    material_name: 'Kabel',
                    qty_system: 1,
                    qty_opname: 2,
                    difference: 1,
                },
            ],
            status: 'approved',
        });
        expect(saved.success).toBe(true);
        expect(mockCreateLog).toHaveBeenCalledWith(
            expect.objectContaining({ warehouse_id: 10, status: 'pending', created_by: 'STF001' })
        );
    });

    it('blocks staff from approving, rejecting, or reading another warehouse log', async () => {
        mockGetSessionUser.mockResolvedValue(STAFF);
        await expect(approveStockOpname({ id: 7 })).rejects.toThrow(/denied/i);
        await expect(rejectStockOpname({ id: 7, reason: 'selisih besar' })).rejects.toThrow(
            /denied/i
        );
        await expect(getStockOpnameLogById(7)).rejects.toThrow(/denied/i);
        expect(mockApproveLog).not.toHaveBeenCalled();
        expect(mockRejectLog).not.toHaveBeenCalled();
    });
});
