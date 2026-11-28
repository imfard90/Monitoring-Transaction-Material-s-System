import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getStoredWarehouses,
    setStoredWarehouses,
    WAREHOUSE_STORAGE_KEY,
    type WarehouseActionResult,
} from '@/hooks/use-warehouses';

describe('useWarehouses localStorage Cache Utils', () => {
    let store: Record<string, string> = {};

    beforeEach(() => {
        store = {};
        const mockLocalStorage = {
            getItem: (key: string) => store[key] ?? null,
            setItem: (key: string, value: string) => {
                store[key] = value;
            },
            removeItem: (key: string) => {
                delete store[key];
            },
            clear: () => {
                store = {};
            },
        };

        vi.stubGlobal('window', globalThis);
        vi.stubGlobal('localStorage', mockLocalStorage);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns undefined if localStorage is empty', () => {
        expect(getStoredWarehouses()).toBeUndefined();
    });

    it('successfully retrieves and parses valid cached warehouses', () => {
        const mockPayload: WarehouseActionResult = {
            success: true,
            data: [
                { id: 1, name: 'SO Lamongan', branch: 'Lamongan' },
                { id: 2, name: 'SO Babat', branch: 'Babat' },
            ],
        };

        localStorage.setItem(WAREHOUSE_STORAGE_KEY, JSON.stringify(mockPayload));

        const result = getStoredWarehouses();
        expect(result).toBeDefined();
        expect(result?.success).toBe(true);
        expect(result?.data).toHaveLength(2);
        expect(result?.data[0].name).toBe('SO Lamongan');
    });

    it('handles invalid or corrupted JSON gracefully without throwing', () => {
        localStorage.setItem(WAREHOUSE_STORAGE_KEY, 'corrupted_json{{{');
        expect(getStoredWarehouses()).toBeUndefined();
    });

    it('returns undefined if cached data array is empty', () => {
        localStorage.setItem(WAREHOUSE_STORAGE_KEY, JSON.stringify({ success: true, data: [] }));
        expect(getStoredWarehouses()).toBeUndefined();
    });

    it('saves valid warehouse data into localStorage', () => {
        const mockPayload: WarehouseActionResult = {
            success: true,
            data: [{ id: 3, name: 'SO Tuban', branch: 'Tuban' }],
        };

        setStoredWarehouses(mockPayload);

        const storedRaw = localStorage.getItem(WAREHOUSE_STORAGE_KEY);
        expect(storedRaw).toBeTruthy();
        const parsed = JSON.parse(storedRaw!);
        expect(parsed.data[0].name).toBe('SO Tuban');
    });

    it('ignores unsuccessful action results', () => {
        const failedPayload: WarehouseActionResult = {
            success: false,
            data: [],
            error: 'Database connection failed',
        };

        setStoredWarehouses(failedPayload);
        expect(localStorage.getItem(WAREHOUSE_STORAGE_KEY)).toBeNull();
    });
});
