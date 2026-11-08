/**
 * Development-only accessibility auditor using @axe-core/react.
 *
 * Logs WCAG violations to the browser console in real-time during local dev.
 * Automatically disabled in production builds (tree-shaken away).
 *
 * @see https://github.com/dequelabs/axe-core-npm/tree/develop/packages/react
 */

export async function initA11yAuditor() {
    if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
        const React = await import('react');
        const ReactDOM = await import('react-dom');
        const axe = await import('@axe-core/react');

        await axe.default(React.default, ReactDOM.default, 1000, {
            rules: [
                // Enforce WCAG 2.1 Level AA (default; explicit for clarity)
                { id: 'color-contrast', enabled: true },
                { id: 'label', enabled: true },
                { id: 'button-name', enabled: true },
                { id: 'link-name', enabled: true },
                { id: 'image-alt', enabled: true },
                { id: 'aria-required-attr', enabled: true },
                { id: 'aria-valid-attr-value', enabled: true },
                { id: 'aria-hidden-focus', enabled: true },
                { id: 'landmark-one-main', enabled: true },
                { id: 'region', enabled: true },
                { id: 'bypass', enabled: true },
                { id: 'focus-order-semantics', enabled: true },
            ],
        });

        // Suppress console noise; rely on browser DevTools Accessibility panel instead
        console.info(
            '[a11y] axe-core auditor active. Check console for WCAG violations or use Lighthouse/DevTools Accessibility panel.'
        );
    }
}
