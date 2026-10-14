import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_TIMEOUT_MS, resetIdleTimeout } from '@/lib/idle-timeout';

describe('idle timeout', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('fires after one hour', () => {
        const onTimeout = vi.fn();
        resetIdleTimeout(onTimeout);

        vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1);
        expect(onTimeout).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(onTimeout).toHaveBeenCalledOnce();
    });

    it('supports resetting the deadline after activity', () => {
        const onTimeout = vi.fn();
        let timeout = resetIdleTimeout(onTimeout);

        vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1);
        clearTimeout(timeout);
        timeout = resetIdleTimeout(onTimeout);

        vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1);
        expect(onTimeout).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(onTimeout).toHaveBeenCalledOnce();

        clearTimeout(timeout);
    });
});
