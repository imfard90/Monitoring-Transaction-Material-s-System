import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSessionUser = vi.fn();
const mockExecute = vi.fn();
const mockSql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
    as: vi.fn(function (this: { strings: TemplateStringsArray; values: unknown[] }) {
        return this;
    }),
}));
const mockSelectFrom = vi.fn();
const mockGroupBy = vi.fn();
const mockSelect = vi.fn();
const mockInnerJoin = vi.fn();
const mockWhere = vi.fn();
const mockWhereByTable = vi.fn();
const mockJoinOn = vi.fn();

vi.mock('kysely', () => ({ sql: mockSql }));
vi.mock('@/lib/auth-server', () => ({ getSessionUser: () => mockGetSessionUser() }));
vi.mock('@/lib/cache/encryptedCache', () => ({ encryptedCache: {} }));
vi.mock('@/lib/logger', () => ({ actionLogger: { error: vi.fn() } }));
vi.mock('@/lib/db/db', () => ({
    db: {
        selectFrom: (table: string) => {
            mockSelectFrom(table);
            const query = {
                innerJoin: (...args: unknown[]) => {
                    mockInnerJoin(...args);
                    if (typeof args[1] === 'function') {
                        const joinBuilder = {
                            on: (...onArgs: unknown[]) => {
                                mockJoinOn(...onArgs);
                                return joinBuilder;
                            },
                        };
                        (args[1] as (join: typeof joinBuilder) => unknown)(joinBuilder);
                    }
                    return query;
                },
                select: (...args: unknown[]) => {
                    mockSelect(...args);
                    for (const arg of args) {
                        if (Array.isArray(arg)) {
                            for (const expression of arg) {
                                if (
                                    expression &&
                                    typeof expression === 'object' &&
                                    'as' in expression
                                ) {
                                    (expression as { as: () => unknown }).as();
                                }
                            }
                        }
                    }
                    return query;
                },
                where: (...args: unknown[]) => {
                    mockWhere(...args);
                    mockWhereByTable(table, ...args);
                    return query;
                },
                groupBy: (...args: unknown[]) => {
                    mockGroupBy(...args);
                    return query;
                },
                execute: mockExecute,
            };
            return query;
        },
    },
}));

const { getLensaWarehousePerformance } = await import(
    '@/app/(DashboardLayout)/_actions/dashboard-queries'
);

describe('getLensaWarehousePerformance', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSessionUser.mockResolvedValue({ isStaff: false, warehouseIds: [] });
        mockExecute.mockResolvedValue([]);
    });

    it('normalizes warehouse names in both Lensa performance joins', async () => {
        await getLensaWarehousePerformance();

        expect(mockInnerJoin).toHaveBeenCalledTimes(2);
        const joinComparisons = mockJoinOn.mock.calls.map(([left, , right]) => [left, right]);
        expect(
            joinComparisons.flat().every((expression) => {
                const template = expression as { strings: string[] };
                return template.strings.join('').includes('REGEXP_REPLACE');
            })
        ).toBe(true);
    });

    it('limits Out Lensa HI metrics to headers dated today', async () => {
        await getLensaWarehousePerformance();

        expect(mockWhereByTable).toHaveBeenCalledWith(
            'inventory.out_lensa_ref_header as olh',
            'olh.formatted_date',
            '=',
            expect.objectContaining({
                strings: expect.arrayContaining([expect.stringContaining('CURRENT_DATE')]),
            })
        );
        expect(mockExecute).toHaveBeenCalledTimes(2);
    });
});
