import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSessionUser = vi.fn();
const mockRepositoryCall = vi.fn();
const mockCreateTagNte = vi.fn();
const mockSetInstallNte = vi.fn();
const mockReturnNte = vi.fn();

vi.mock('@/lib/auth-server', () => ({
    getSessionUser: () => mockGetSessionUser(),
}));

vi.mock('@/lib/db/db', () => ({ db: {} }));

vi.mock('@/lib/repositories/nte.repository', () => ({
    createNteRepository: () => ({
        listNteTags: mockRepositoryCall,
        getNteTagDetail: mockRepositoryCall,
        getSnHistory: mockRepositoryCall,
        listAddresses: mockRepositoryCall,
        listItems: mockRepositoryCall,
        listTechnicians: mockRepositoryCall,
        createTagNte: mockCreateTagNte,
        setInstallNte: mockSetInstallNte,
        returnNte: mockReturnNte,
        listNteInventory: mockRepositoryCall,
    }),
}));

vi.mock('@/lib/security/idempotency', () => ({ checkAndStoreIdempotency: vi.fn() }));

vi.mock('@/lib/logger', () => ({ actionLogger: { error: vi.fn() } }));

const tagQueries = await import(
    '@/app/(DashboardLayout)/apps/nte-transaction/tag/_actions/tag-queries'
);
const returnQueries = await import(
    '@/app/(DashboardLayout)/form/return-nte/_actions/return-nte-queries'
);
const installQueries = await import(
    '@/app/(DashboardLayout)/form/set-install-nte/_actions/set-install-queries'
);
const tagReferenceQueries = await import(
    '@/app/(DashboardLayout)/apps/nte-transaction/tag/_actions/tag-commands'
);
const returnCommands = await import(
    '@/app/(DashboardLayout)/form/return-nte/_actions/return-nte-commands'
);
const installCommands = await import(
    '@/app/(DashboardLayout)/form/set-install-nte/_actions/set-install-commands'
);

const commandActions = [
    () => tagReferenceQueries.createTagNte({}),
    () => returnCommands.returnNte({}),
    () => installCommands.setInstallNte({}),
];

const queryActions = [
    () => tagQueries.getNteTags({}),
    () => tagQueries.getNteTagDetail('T-1'),
    () => tagQueries.getNteSnHistory('SN-1'),
    () => returnQueries.getNteAddresses(),
    () => returnQueries.getNteTechnicians(),
    () => installQueries.getNteInventory({}),
    () => installQueries.getNteAddresses(),
    () => installQueries.getNteItems(),
    () => installQueries.getNteTechnicians(),
    () => tagReferenceQueries.getNteAddresses(),
    () => tagReferenceQueries.getNteItems(),
    () => tagReferenceQueries.getNteTechnicians(),
];

describe('NTE query action authentication', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSessionUser.mockRejectedValue(new Error('Unauthorized'));
    });

    it.each(queryActions)(
        'rejects unauthenticated access before repository calls',
        async (action) => {
            await expect(action()).rejects.toThrow('Unauthorized');
            expect(mockRepositoryCall).not.toHaveBeenCalled();
        }
    );
});

describe('NTE command authentication', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSessionUser.mockRejectedValue(new Error('Unauthorized'));
    });

    it.each(commandActions)(
        'rejects unauthenticated mutation before repository calls',
        async (action) => {
            await expect(action()).rejects.toThrow('Unauthorized');
            expect(mockCreateTagNte).not.toHaveBeenCalled();
            expect(mockSetInstallNte).not.toHaveBeenCalled();
            expect(mockReturnNte).not.toHaveBeenCalled();
        }
    );
});
