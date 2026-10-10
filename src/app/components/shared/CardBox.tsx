'use client';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface CardBoxProps {
    children: React.ReactNode;
    className?: string;
}

const CardBox: React.FC<CardBoxProps> = ({ children, className }) => {
    return (
        <Card
            className={cn(
                'card border border-border bg-card text-card-foreground shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md p-4 motion-reduce:transition-none',
                className,
            )}
        >
            {children}
        </Card>
    );
};

export default CardBox;
