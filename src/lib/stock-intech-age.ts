export function formatStockAge(requestTime: string | Date, today = new Date()): string {
    const start = new Date(requestTime);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(today.getTime())) return '-';

    const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (startDate > todayDate) return '-';

    const monthDifference =
        (todayDate.getFullYear() - startDate.getFullYear()) * 12 +
        todayDate.getMonth() -
        startDate.getMonth();
    const getMonthAnchor = (monthOffset: number) => {
        const targetMonth = new Date(
            startDate.getFullYear(),
            startDate.getMonth() + monthOffset,
            1
        );
        const lastDayOfTargetMonth = new Date(
            targetMonth.getFullYear(),
            targetMonth.getMonth() + 1,
            0
        ).getDate();
        targetMonth.setDate(Math.min(startDate.getDate(), lastDayOfTargetMonth));
        return targetMonth;
    };

    let months = monthDifference;
    let monthAnchor = getMonthAnchor(months);
    if (monthAnchor > todayDate) {
        months -= 1;
        monthAnchor = getMonthAnchor(months);
    }
    const days = Math.floor((todayDate.getTime() - monthAnchor.getTime()) / 86_400_000);

    return `${months} bulan ${days} hari`;
}
