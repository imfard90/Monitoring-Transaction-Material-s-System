import { Badge } from '@/components/ui/badge';

interface StatusBadgeProps {
    status?: string | null;
}

export function StatusBadge({ status }: StatusBadgeProps) {
    if (!status) return <span className="text-gray-400">-</span>;

    const val = status.toLowerCase();
    let color = 'bg-gray-500/10 text-gray-800'; // fallback

    // Map common statuses to standard colors
    if (val === 'request' || val === 'requested') {
        color = 'bg-blue-500/10 text-blue-800';
    } else if (val === 'wait_approve' || val === 'in_transit') {
        color = 'bg-yellow-500/10 text-yellow-800';
    } else if (val === 'intech') {
        color = 'bg-purple-500/10 text-purple-800';
    } else if (val === 'close' || val === 'closed' || val === 'rekon' || val === 'accepted') {
        color = 'bg-green-500/10 text-green-800';
    } else if (val === 'cancel' || val === 'rejected' || val === 'cancelled') {
        color = 'bg-red-500/10 text-red-800';
    }

    return (
        <Badge className={`capitalize border-none ${color}`} variant="outline">
            {val.replace(/_/g, ' ')}
        </Badge>
    );
}
