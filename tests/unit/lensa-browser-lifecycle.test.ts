import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLaunchServer = vi.fn();
const mockConnect = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisDel = vi.fn();

vi.mock('playwright', () => ({
    chromium: {
        launchServer: (...args: unknown[]) => mockLaunchServer(...args),
        connect: (...args: unknown[]) => mockConnect(...args),
    },
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

vi.mock('@/lib/redis', () => ({
    redis: {
        set: (...args: unknown[]) => mockRedisSet(...args),
        del: (...args: unknown[]) => mockRedisDel(...args),
    },
}));

vi.mock('@/lib/workers/worker-client', () => ({
    WORKER_BROWSER_KEY: 'worker:lensa:browser',
    WORKER_BROWSER_TTL_SECONDS: 30,
}));

/**
 * Chromium leak regression tests.
 *
 * The incident: 106 orphaned headless Chrome processes in `mtms-worker`.
 * Root causes covered here:
 *  1. The browser lived only in the worker process, so the web health endpoint
 *     always reported it as disconnected → permanent 503.
 *  2. The browser was launched with `chromium.launch()`, which does not expose
 *     the spawned process PID, forcing a broad `pkill -f chrome` on shutdown.
 *  3. The web endpoint read an in-process browser that never existed there.
 */
describe('lensa browser lifecycle', () => {
    let browser: {
        isConnected: () => boolean;
        contexts: () => unknown[];
        close: () => Promise<void>;
    };
    let server: {
        process: () => { pid: number | undefined };
        wsEndpoint: () => string;
        kill: () => Promise<void>;
    };

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();

        browser = {
            isConnected: () => true,
            contexts: () => [],
            close: vi.fn().mockResolvedValue(undefined),
        };
        server = {
            process: () => ({ pid: 4242 }),
            wsEndpoint: () => 'ws://localhost:1234',
            kill: vi.fn().mockResolvedValue(undefined),
        };

        mockLaunchServer.mockResolvedValue(server);
        mockConnect.mockResolvedValue(browser);
        mockRedisSet.mockResolvedValue('OK');
        mockRedisDel.mockResolvedValue(1);
    });

    it('launches the browser via launchServer so the Chromium PID is known', async () => {
        const { getBrowserInstance } = await import('@/lib/lensa-scraper/lensa-browser');

        await getBrowserInstance();

        expect(mockLaunchServer).toHaveBeenCalledTimes(1);
        expect(mockConnect).toHaveBeenCalledWith('ws://localhost:1234');
    });

    it('exposes the Chromium PID in the health snapshot', async () => {
        const { getBrowserInstance, getLensaBrowserHealth } = await import(
            '@/lib/lensa-scraper/lensa-browser'
        );

        await getBrowserInstance();

        expect(getLensaBrowserHealth().pid).toBe(4242);
    });

    it('publishes the browser snapshot to Redis so the web process can read it', async () => {
        const { getBrowserInstance } = await import('@/lib/lensa-scraper/lensa-browser');

        await getBrowserInstance();

        expect(mockRedisSet).toHaveBeenCalledWith(
            'worker:lensa:browser',
            expect.stringContaining('4242'),
            'EX',
            30
        );
    });

    it('kills the Chromium process tree on close instead of relying on a broad pkill', async () => {
        const { getBrowserInstance, closeBrowser } = await import(
            '@/lib/lensa-scraper/lensa-browser'
        );

        await getBrowserInstance();
        await closeBrowser();

        expect(server.kill).toHaveBeenCalledTimes(1);
        expect(browser.close).toHaveBeenCalledTimes(1);
        expect(mockRedisDel).toHaveBeenCalledWith('worker:lensa:browser');
    }, 10000);

    it('force-closes leaked contexts once the open-context limit is exceeded', async () => {
        const leakedContext = { close: vi.fn().mockResolvedValue(undefined) };
        const liveContext = { close: vi.fn().mockResolvedValue(undefined) };
        // 12 open contexts exceeds the limit of 10.
        browser.contexts = () =>
            Array.from({ length: 11 }, () => leakedContext).concat(liveContext);

        const { getBrowserInstance } = await import('@/lib/lensa-scraper/lensa-browser');

        await getBrowserInstance();

        // The sweeper keeps the 5 most recent contexts and closes the rest.
        expect(leakedContext.close).toHaveBeenCalled();
    });
});
