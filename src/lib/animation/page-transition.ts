/**
 * Page transition utilities using the View Transitions API.
 *
 * Provides smooth cross-fade transitions between Next.js App Router pages.
 * Falls back to instant navigation when the API is unavailable or when
 * prefers-reduced-motion is set.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API
 */

/**
 * Navigate with a smooth cross-fade transition.
 *
 * Usage in client components:
 * ```tsx
 * import { useRouter } from 'next/navigation';
 * import { transitionNavigate } from '@/lib/animation/page-transition';
 *
 * const router = useRouter();
 * await transitionNavigate(() => router.push('/dashboard'));
 * ```
 */
export async function transitionNavigate(callback: () => void): Promise<void> {
    if (
        typeof document !== 'undefined' &&
        'startViewTransition' in document &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
        (document as any).startViewTransition(callback);
    } else {
        callback();
    }
}

/**
 * Wrap a Link onClick handler with page transition.
 *
 * Usage:
 * ```tsx
 * <Link href="/dashboard" onClick={withPageTransition(() => router.push('/dashboard'))}>
 *   Dashboard
 * </Link>
 * ```
 */
export function withPageTransition(callback: () => void) {
    return (e: React.MouseEvent) => {
        e.preventDefault();
        transitionNavigate(callback);
    };
}
