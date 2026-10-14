export const IDLE_TIMEOUT_MS = 60 * 60 * 1000;

export function resetIdleTimeout(
    onTimeout: () => void,
    timeoutMs = IDLE_TIMEOUT_MS
): ReturnType<typeof setTimeout> {
    return setTimeout(onTimeout, timeoutMs);
}
