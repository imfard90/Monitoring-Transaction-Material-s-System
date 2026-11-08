import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbSelectFrom = vi.fn();
const mockDecryptLensaPassword = vi.fn();
const mockFindMatchingMasterWarehouse = vi.fn();

function createChain() {
    const chain: any = {
        select: vi.fn(() => chain),
        where: vi.fn(() => chain),
        execute: vi.fn(),
        executeTakeFirst: vi.fn(),
    };
    return chain;
}

vi.mock('@/lib/db/db', () => ({
    db: {
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

vi.mock('@/lib/services/lensa-crypto', () => ({
    decryptLensaPassword: (text: string) => mockDecryptLensaPassword(text),
}));

vi.mock('@/lib/warehouse-helper', () => ({
    findMatchingMasterWarehouse: (...args: any[]) => mockFindMatchingMasterWarehouse(...args),
}));

const { getWarehouseLensaCandidates, executeWithLensaFallback } = await import(
    '@/lib/services/lensa-credential-helper'
);

describe('lensa-credential-helper Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getWarehouseLensaCandidates', () => {
        it('returns empty array when warehouse does not exist and no fallback users exist', async () => {
            const whChain = createChain();
            whChain.executeTakeFirst.mockResolvedValue(null);

            const systemChain = createChain();
            systemChain.execute.mockResolvedValue([]);

            mockDbSelectFrom
                .mockReturnValueOnce(whChain)
                .mockReturnValueOnce(systemChain);

            const result = await getWarehouseLensaCandidates({ warehouseId: 99 });
            expect(result).toEqual([]);
        });

        it('orders candidates: PIC 1 first, then PIC 2, then user login, then system users', async () => {
            // 1. Warehouse query
            const whChain = createChain();
            whChain.executeTakeFirst.mockResolvedValue({
                id: 1,
                name: 'GUDANG SURABAYA TIMUR',
                pic_1: 'NIK_PIC_1',
                pic_2: 'NIK_PIC_2',
            });

            // 2. PIC 1 query
            const pic1Chain = createChain();
            pic1Chain.executeTakeFirst.mockResolvedValue({
                lensa_username: 'lensa_pic1',
                lensa_password: 'enc_pic1_pass',
            });

            // 3. PIC 2 query
            const pic2Chain = createChain();
            pic2Chain.executeTakeFirst.mockResolvedValue({
                lensa_username: 'lensa_pic2',
                lensa_password: 'enc_pic2_pass',
            });

            // 4. User ID query
            const userChain = createChain();
            userChain.executeTakeFirst.mockResolvedValue({
                lensa_username: 'lensa_logged_in_user',
                lensa_password: 'enc_user_pass',
                nik: 'NIK_USER',
            });

            // 5. System users query
            const systemChain = createChain();
            systemChain.execute.mockResolvedValue([
                {
                    lensa_username: 'lensa_system_user',
                    lensa_password: 'enc_sys_pass',
                    nik: 'NIK_SYS',
                },
            ]);

            mockDbSelectFrom
                .mockReturnValueOnce(whChain)
                .mockReturnValueOnce(pic1Chain)
                .mockReturnValueOnce(pic2Chain)
                .mockReturnValueOnce(userChain)
                .mockReturnValueOnce(systemChain);

            mockDecryptLensaPassword.mockImplementation((cipher: string) => `dec_${cipher}`);

            const candidates = await getWarehouseLensaCandidates({
                warehouseId: 1,
                userId: 'user-uuid-123',
                includeSystemFallback: true,
            });

            expect(candidates).toHaveLength(4);
            expect(candidates[0]).toEqual({
                username: 'lensa_pic1',
                password: 'dec_enc_pic1_pass',
                picNik: 'NIK_PIC_1',
                source: 'pic1',
            });
            expect(candidates[1]).toEqual({
                username: 'lensa_pic2',
                password: 'dec_enc_pic2_pass',
                picNik: 'NIK_PIC_2',
                source: 'pic2',
            });
            expect(candidates[2]).toEqual({
                username: 'lensa_logged_in_user',
                password: 'dec_enc_user_pass',
                picNik: 'NIK_USER',
                source: 'user',
            });
            expect(candidates[3]).toEqual({
                username: 'lensa_system_user',
                password: 'dec_enc_sys_pass',
                picNik: 'NIK_SYS',
                source: 'system',
            });
        });

        it('deduplicates identical usernames across sources', async () => {
            // Warehouse query
            const whChain = createChain();
            whChain.executeTakeFirst.mockResolvedValue({
                id: 1,
                name: 'GUDANG UTARA',
                pic_1: 'NIK_PIC_1',
                pic_2: 'NIK_PIC_2',
            });

            // PIC 1 query (same username as PIC 2)
            const pic1Chain = createChain();
            pic1Chain.executeTakeFirst.mockResolvedValue({
                lensa_username: 'shared_lensa_user',
                lensa_password: 'enc_pic1_pass',
            });

            // PIC 2 query (same username)
            const pic2Chain = createChain();
            pic2Chain.executeTakeFirst.mockResolvedValue({
                lensa_username: 'shared_lensa_user',
                lensa_password: 'enc_pic2_pass',
            });

            mockDbSelectFrom
                .mockReturnValueOnce(whChain)
                .mockReturnValueOnce(pic1Chain)
                .mockReturnValueOnce(pic2Chain);

            mockDecryptLensaPassword.mockReturnValue('plain_pass');

            const candidates = await getWarehouseLensaCandidates({
                warehouseId: 1,
                includeSystemFallback: false,
            });

            expect(candidates).toHaveLength(1);
            expect(candidates[0].username).toBe('shared_lensa_user');
            expect(candidates[0].source).toBe('pic1');
        });

        it('skips candidates where password decryption fails', async () => {
            const whChain = createChain();
            whChain.executeTakeFirst.mockResolvedValue({
                id: 1,
                name: 'GUDANG',
                pic_1: 'NIK_1',
                pic_2: 'NIK_2',
            });

            const pic1Chain = createChain();
            pic1Chain.executeTakeFirst.mockResolvedValue({
                lensa_username: 'pic1_user',
                lensa_password: 'corrupt_pass',
            });

            const pic2Chain = createChain();
            pic2Chain.executeTakeFirst.mockResolvedValue({
                lensa_username: 'pic2_user',
                lensa_password: 'valid_pass',
            });

            mockDbSelectFrom
                .mockReturnValueOnce(whChain)
                .mockReturnValueOnce(pic1Chain)
                .mockReturnValueOnce(pic2Chain);

            mockDecryptLensaPassword.mockImplementation((pass: string) => {
                if (pass === 'corrupt_pass') throw new Error('Decryption failed');
                return 'decrypted_valid_pass';
            });

            const candidates = await getWarehouseLensaCandidates({
                warehouseId: 1,
                includeSystemFallback: false,
            });

            expect(candidates).toHaveLength(1);
            expect(candidates[0].username).toBe('pic2_user');
            expect(candidates[0].source).toBe('pic2');
        });
    });

    describe('executeWithLensaFallback', () => {
        const mockCandidates = [
            { username: 'pic1_user', password: 'pwd1', source: 'pic1' as const },
            { username: 'pic2_user', password: 'pwd2', source: 'pic2' as const },
        ];

        it('throws error when candidate list is empty', async () => {
            await expect(
                executeWithLensaFallback([], async () => 'ok')
            ).rejects.toThrow('Tidak ada akun Lensa yang terhubung');
        });

        it('returns result immediately when the first candidate succeeds', async () => {
            const op = vi.fn().mockResolvedValueOnce({ data: 'success_data' });

            const result = await executeWithLensaFallback(mockCandidates, op);

            expect(result).toEqual({ data: 'success_data' });
            expect(op).toHaveBeenCalledTimes(1);
            expect(op).toHaveBeenCalledWith(mockCandidates[0]);
        });

        it('falls back to second candidate if first candidate throws an error', async () => {
            const op = vi
                .fn()
                .mockRejectedValueOnce(new Error('Gagal login ke sistem Lensa'))
                .mockResolvedValueOnce({ data: 'fallback_success' });

            const result = await executeWithLensaFallback(mockCandidates, op);

            expect(result).toEqual({ data: 'fallback_success' });
            expect(op).toHaveBeenCalledTimes(2);
            expect(op).toHaveBeenNthCalledWith(1, mockCandidates[0]);
            expect(op).toHaveBeenNthCalledWith(2, mockCandidates[1]);
        });

        it('falls back to second candidate if first candidate returns an auth error object', async () => {
            const op = vi
                .fn()
                .mockResolvedValueOnce({ error: 'Sesi Lensa telah berakhir. Silakan login kembali.' })
                .mockResolvedValueOnce({ data: 'from_pic2' });

            const result = await executeWithLensaFallback(mockCandidates, op);

            expect(result).toEqual({ data: 'from_pic2' });
            expect(op).toHaveBeenCalledTimes(2);
        });

        it('throws the last error if all candidates fail', async () => {
            const op = vi
                .fn()
                .mockRejectedValueOnce(new Error('PIC1 login rejected'))
                .mockRejectedValueOnce(new Error('PIC2 login rejected'));

            await expect(
                executeWithLensaFallback(mockCandidates, op)
            ).rejects.toThrow('PIC2 login rejected');

            expect(op).toHaveBeenCalledTimes(2);
        });
    });
});

