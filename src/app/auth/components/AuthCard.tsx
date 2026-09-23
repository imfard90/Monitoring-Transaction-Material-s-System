import type React from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface AuthCardProps {
    children: React.ReactNode;
    title: string;
    description?: string;
    className?: string;
}

const AuthCard: React.FC<AuthCardProps> = ({ children, title, description, className }) => {
    return (
        <Card className={`border-border shadow-sm ${className ?? ''}`}>
            <CardContent className="pt-6">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">
                        {title}
                    </h1>
                    {description && <p className="text-sm text-muted-foreground">{description}</p>}
                </div>
                {children}
            </CardContent>
        </Card>
    );
};

export default AuthCard;
