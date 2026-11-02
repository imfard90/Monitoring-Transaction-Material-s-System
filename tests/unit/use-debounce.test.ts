import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from '@/hooks/use-debounce';

describe('debounce utility', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('debounces rapid calls and only triggers the last one with latest arguments', () => {
        const callback = vi.fn();
        const debouncedFn = debounce(callback, 300);

        debouncedFn('first');
        debouncedFn('second');
        debouncedFn('third');

        expect(callback).not.toHaveBeenCalled();

        vi.advanceTimersByTime(299);
        expect(callback).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith('third');
    });

    it('cancels pending executions when cancel() is invoked', () => {
        const callback = vi.fn();
        const debouncedFn = debounce(callback, 300);

        debouncedFn('call-1');
        vi.advanceTimersByTime(150);

        debouncedFn.cancel();
        vi.advanceTimersByTime(200);

        expect(callback).not.toHaveBeenCalled();
    });

    it('can be called again after execution has completed', () => {
        const callback = vi.fn();
        const debouncedFn = debounce(callback, 200);

        debouncedFn('batch-1');
        vi.advanceTimersByTime(200);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith('batch-1');

        debouncedFn('batch-2');
        vi.advanceTimersByTime(200);
        expect(callback).toHaveBeenCalledTimes(2);
        expect(callback).toHaveBeenCalledWith('batch-2');
    });
});
