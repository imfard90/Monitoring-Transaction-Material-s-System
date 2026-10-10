import { CheckCircle, Clock, FileEdit, Truck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { cn } from '@/lib/utils';

interface OutMaterialCardsProps {
    counts: {
        wait_approve: number;
        request: number;
        intech: number;
        close: number;
    };
    activeFilter: string;
    onFilterChange: (filter: string) => void;
}

export default function OutMaterialCards({
    counts,
    activeFilter,
    onFilterChange,
}: OutMaterialCardsProps) {
    const cards = [
        {
            id: 'all',
            title: 'All Materials',
            value: counts.wait_approve + counts.request + counts.intech + counts.close,
            icon: <FileEdit className="text-secondary" size={24} />,
            color: 'bg-secondary/10',
        },
        {
            id: 'wait_approve',
            title: 'Wait Approve',
            value: counts.wait_approve,
            icon: <Clock className="text-warning" size={24} />,
            color: 'bg-warning/10',
        },
        {
            id: 'request',
            title: 'Requested',
            value: counts.request,
            icon: <FileEdit className="text-info" size={24} />,
            color: 'bg-info/10',
        },
        {
            id: 'intech',
            title: 'Intech',
            value: counts.intech,
            icon: <Truck className="text-secondary" size={24} />,
            color: 'bg-secondary/10',
        },
        {
            id: 'close',
            title: 'Close',
            value: counts.close,
            icon: <CheckCircle className="text-success" size={24} />,
            color: 'bg-success/10',
        },
    ];

    return (
        <StaggerContainer className="grid grid-cols-1 md:grid-cols-5 gap-4 p-1">
            {cards.map((card) => (
                <StaggerItem key={card.id}>
                    <Card
                        className={cn(
                            'cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg border-none h-full',
                            card.color,
                            activeFilter === card.id ? 'ring-2 ring-primary shadow-md' : ''
                        )}
                        onClick={() => onFilterChange(card.id)}
                    >
                        <CardContent className="p-4 flex items-center justify-between h-full">
                            <div>
                                <p className="text-sm font-medium text-foreground mb-1">
                                    {card.title}
                                </p>
                                <h3 className="text-2xl font-bold text-foreground">{card.value}</h3>
                            </div>
                            <div className="p-3 bg-background/50 rounded-full">{card.icon}</div>
                        </CardContent>
                    </Card>
                </StaggerItem>
            ))}
        </StaggerContainer>
    );
}
