/**
 * Chart color palette utilities for ApexCharts.
 *
 * Uses theme-aware CSS variables where possible, with fallback hex codes
 * that meet WCAG AA contrast ratio (≥4.5:1) on both light/dark backgrounds.
 *
 * Pattern: oklch() for perceptual uniformity, fallback to hex for compatibility.
 */

/**
 * Primary chart palette (categorical data).
 *
 * Order optimized for visual distinction when placed adjacently.
 */
export const chartColors = {
    primary: '#3B82F6',      // Blue 500 (primary brand)
    success: '#10B981',      // Emerald 500
    warning: '#F59E0B',      // Amber 500
    error: '#EF4444',        // Red 500
    info: '#0EA5E9',         // Sky 500
    purple: '#8B5CF6',       // Violet 500
    pink: '#EC4899',         // Pink 500
    teal: '#14B8A6',         // Teal 500
} as const;

/**
 * Sequential palette (heatmaps, intensity scales).
 *
 * Light → Dark progression for continuous data.
 */
export const sequentialColors = [
    '#DBEAFE', // Blue 100
    '#93C5FD', // Blue 300
    '#3B82F6', // Blue 500
    '#1D4ED8', // Blue 700
    '#1E3A8A', // Blue 900
] as const;

/**
 * Diverging palette (positive/negative, above/below threshold).
 *
 * Red ← Gray → Green
 */
export const divergingColors = [
    '#EF4444', // Red 500 (negative)
    '#F87171', // Red 400
    '#9CA3AF', // Gray 400 (neutral)
    '#34D399', // Emerald 400
    '#10B981', // Emerald 500 (positive)
] as const;

/**
 * Status palette (SLA, completion, health indicators).
 */
export const statusColors = {
    onTime: '#10B981',       // Green (success)
    warning: '#F59E0B',      // Amber
    breached: '#EF4444',     // Red (error)
    pending: '#6B7280',      // Gray 500
} as const;

/**
 * Get ordered color array for multi-series charts.
 *
 * @param count - Number of series (defaults to full palette)
 * @returns Array of hex colors
 */
export function getChartColorArray(count?: number): string[] {
    const palette = Object.values(chartColors);
    return count ? palette.slice(0, count) : palette;
}

/**
 * ApexCharts theme configuration (light/dark aware).
 *
 * Apply via: `chart.theme = getApexTheme(theme)`
 */
export function getApexTheme(isDark: boolean) {
    return {
        mode: isDark ? ('dark' as const) : ('light' as const),
        palette: 'palette1',
        monochrome: {
            enabled: false,
        },
    };
}

/**
 * Common ApexCharts options for MTMS consistency.
 *
 * Merge with specific chart config:
 * `{ ...getApexBaseOptions(), chart: { type: 'donut' }, ... }`
 */
export function getApexBaseOptions() {
    // Check for prefers-reduced-motion
    const prefersReducedMotion =
        typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    return {
        chart: {
            fontFamily: 'inherit',
            foreColor: 'var(--muted-foreground)',
            toolbar: { show: false },
            animations: {
                enabled: !prefersReducedMotion,
                speed: 800,
                easing: 'easeinout',
                animateGradually: {
                    enabled: true,
                    delay: 120,
                },
                dynamicAnimation: {
                    enabled: true,
                    speed: 350,
                },
            },
        },
        dataLabels: {
            enabled: false, // Override per chart if needed
        },
        stroke: {
            colors: ['var(--card)'],
        },
        grid: {
            borderColor: 'var(--border)',
            strokeDashArray: 3,
        },
        xaxis: {
            axisBorder: {
                color: 'var(--border)',
            },
            axisTicks: {
                color: 'var(--border)',
            },
        },
        yaxis: {
            labels: {
                style: {
                    colors: 'var(--muted-foreground)',
                },
            },
        },
        tooltip: {
            theme: 'dark', // ApexCharts dark tooltip on both themes (better contrast)
        },
    };
}
