import { describe, expect, it } from 'vitest';

describe('SalesOverview calculation & series algorithm', () => {
    // Pure algorithm reproducing SalesOverview summary KPIs
    function computeSummaryKpis(outMaterial: (number | null)[], hasilRekon: (number | null)[]) {
        const out = outMaterial.reduce<number>((acc, v) => acc + Math.abs(v || 0), 0);
        const rekon = hasilRekon.reduce<number>((acc, v) => acc + Math.abs(v || 0), 0);
        const ratio = out > 0 ? Math.round((rekon / out) * 100) : 0;
        const gap = Math.max(0, out - rekon);
        return { totalOut: out, totalRekon: rekon, rekonRatio: ratio, gapTerbuka: gap };
    }

    // Pure algorithm reproducing SalesOverview series generator per viewMode
    function getChartSeries(
        outMaterial: number[],
        hasilRekon: number[],
        viewMode: 'stacked' | 'grouped' | 'area'
    ) {
        return [
            { name: 'Out Material', data: outMaterial },
            {
                name: 'Hasil Rekon',
                data: hasilRekon.map((v) =>
                    viewMode === 'stacked' ? -Math.abs(v || 0) : Math.abs(v || 0)
                ),
            },
        ];
    }

    it('calculates totalRekon, rekonRatio, and gapTerbuka accurately when hasilRekon has negative values', () => {
        // Sample: 1250 out, 1000 rekon (stored as negative for stacked chart)
        const out = [500, 450, 300];
        const rekonNegative = [-400, -350, -250];

        const { totalOut, totalRekon, rekonRatio, gapTerbuka } = computeSummaryKpis(
            out,
            rekonNegative
        );

        expect(totalOut).toBe(1250);
        expect(totalRekon).toBe(1000);
        expect(rekonRatio).toBe(80); // 1000 / 1250 = 80%, NOT -80%
        expect(gapTerbuka).toBe(250); // 1250 - 1000 = 250, NOT 1250 - (-1000) = 2250!
    });

    it('correctly clamps gapTerbuka to 0 if totalRekon exceeds totalOut', () => {
        const out = [100];
        const rekonNegative = [-150];

        const { totalOut, totalRekon, rekonRatio, gapTerbuka } = computeSummaryKpis(
            out,
            rekonNegative
        );

        expect(totalOut).toBe(100);
        expect(totalRekon).toBe(150);
        expect(rekonRatio).toBe(150);
        expect(gapTerbuka).toBe(0);
    });

    it('handles empty or zero data cleanly', () => {
        const { totalOut, totalRekon, rekonRatio, gapTerbuka } = computeSummaryKpis([], []);

        expect(totalOut).toBe(0);
        expect(totalRekon).toBe(0);
        expect(rekonRatio).toBe(0);
        expect(gapTerbuka).toBe(0);
    });

    it('preserves negative values for Hasil Rekon in stacked viewMode so bar renders below 0', () => {
        const out = [100, 200];
        const rekon = [-80, -150];

        const series = getChartSeries(out, rekon, 'stacked');

        expect(series[0].name).toBe('Out Material');
        expect(series[0].data).toEqual([100, 200]);
        expect(series[1].name).toBe('Hasil Rekon');
        expect(series[1].data).toEqual([-80, -150]); // Below baseline 0
    });

    it('converts Hasil Rekon to positive values in grouped (Dua Sisi) and area viewMode', () => {
        const out = [100, 200];
        const rekon = [-80, -150];

        const groupedSeries = getChartSeries(out, rekon, 'grouped');
        expect(groupedSeries[1].data).toEqual([80, 150]); // Upright side-by-side above 0

        const areaSeries = getChartSeries(out, rekon, 'area');
        expect(areaSeries[1].data).toEqual([80, 150]); // Upright smooth curve above 0
    });
});

