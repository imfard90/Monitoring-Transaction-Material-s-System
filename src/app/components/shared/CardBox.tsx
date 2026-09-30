'use client';
import { Card } from '@/components/ui/card';

interface MyAppProps {
    children: React.ReactNode;
    className?: string;
}
const CardBox: React.FC<MyAppProps> = ({ children, className }) => {
    return (
        <Card
            className={`card border border-border shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md p-4 ${className || ''}`}
        >
            {children}
        </Card>
    );
};

export default CardBox;
