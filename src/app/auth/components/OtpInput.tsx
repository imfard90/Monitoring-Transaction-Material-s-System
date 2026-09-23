'use client';

import { type ClipboardEvent, type KeyboardEvent, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface OtpInputProps {
    length?: number;
    onComplete: (value: string) => void;
    disabled?: boolean;
}

const OtpInput: React.FC<OtpInputProps> = ({ length = 6, onComplete, disabled }) => {
    const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        inputsRef.current[0]?.focus();
    }, []);

    const getValue = () => inputsRef.current.map((el) => el?.value || '').join('');

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
        if (e.key === 'Backspace') {
            const current = inputsRef.current[index];
            if (current && current.value === '' && index > 0) {
                inputsRef.current[index - 1]?.focus();
            } else if (current) {
                current.value = '';
                onComplete(getValue());
            }
        } else if (e.key === 'ArrowLeft' && index > 0) {
            inputsRef.current[index - 1]?.focus();
        } else if (e.key === 'ArrowRight' && index < length - 1) {
            inputsRef.current[index + 1]?.focus();
        }
    };

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
        const val = e.target.value.replace(/\D/g, '').slice(-1);
        e.target.value = val;
        if (val && index < length - 1) {
            inputsRef.current[index + 1]?.focus();
        }
        onComplete(getValue());
    };

    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
        pasted.split('').forEach((char, i) => {
            if (inputsRef.current[i]) {
                inputsRef.current[i]!.value = char;
            }
        });
        inputsRef.current[Math.min(pasted.length, length - 1)]?.focus();
        onComplete(pasted.padEnd(length, '').slice(0, length));
    };

    return (
        <div className="flex justify-center gap-2">
            {Array.from({ length }).map((_, i) => (
                <Input
                    key={i}
                    ref={(el) => {
                        inputsRef.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    disabled={disabled}
                    onKeyDown={(e) => handleKeyDown(e, i)}
                    onChange={(e) => handleInput(e, i)}
                    onPaste={handlePaste}
                    className={cn(
                        'w-11 h-12 text-center text-xl font-bold p-0',
                        'focus:ring-2 focus:ring-primary'
                    )}
                />
            ))}
        </div>
    );
};

export default OtpInput;
