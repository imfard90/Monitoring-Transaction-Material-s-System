'use client';

import { useEffect, useRef } from 'react';

export interface UsePageFilterEscOptions {
    /** Apakah ada filter aktif yang dapat di-reset (search terisi, filter gudang != all, tanggal terisi, dsb.) */
    isActive?: boolean;
    /** Callback untuk mereset seluruh filter halaman sekaligus */
    onReset: () => void;
    /** Apakah keyboard shortcut global ini aktif (default: true) */
    enabled?: boolean;
}

/**
 * Predikat untuk mengevaluasi apakah event keyboard Escape valid untuk memicu reset filter halaman.
 *
 * Mengikuti aturan UX MTMS:
 * 1. Hanya merespons jika tombol yang ditekan adalah 'Escape'.
 * 2. Mengabaikan jika ada Dialog, Modal, Drawer, Popover, atau Command yang sedang terbuka (A2).
 * 3. Mengabaikan jika pengguna sedang mengetik di textarea atau input form sensitif (misal password).
 * 4. Hanya mengembalikan true jika terdapat filter yang sedang aktif (A1).
 */
export function shouldHandlePageFilterEsc(event: { key: string }, isActive: boolean): boolean {
    if (event.key !== 'Escape') return false;

    if (typeof document !== 'undefined') {
        // 1. Cek apakah ada Dialog / Modal / Popover / Command menu yang sedang terbuka di DOM
        const isModalOrPopoverOpen = Boolean(
            document.querySelector(
                '[role="dialog"], [role="alertdialog"], [data-state="open"][data-radix-popper-content-wrapper], [cmdk-root]'
            )
        );
        if (isModalOrPopoverOpen) {
            return false;
        }

        // 2. Cek apakah ada form input lain yang sedang fokus (textarea, password, contenteditable)
        const activeEl = document.activeElement;
        if (
            activeEl &&
            typeof activeEl === 'object' &&
            ('tagName' in activeEl || 'isContentEditable' in activeEl)
        ) {
            const el = activeEl as HTMLElement;
            if (
                el.tagName === 'TEXTAREA' ||
                el.isContentEditable ||
                (el.tagName === 'INPUT' && el.getAttribute?.('type') === 'password')
            ) {
                return false;
            }
        }
    }

    return isActive;
}

/**
 * Hook untuk menangani tombol keyboard 'Escape' (Esc) di tingkat halaman (tanpa fokus pada field search).
 *
 * Perilaku UX yang diterapkan:
 * 1. Jika ada Dialog, Modal, Drawer, Sheet, Popover, atau Combobox yang sedang terbuka:
 *    Abaikan tombol Esc agar modal/popover tersebut dapat ditutup terlebih dahulu (A2).
 * 2. Jika kursor sedang fokus pada textarea atau input teks form tertentu selain search:
 *    Abaikan agar tidak mengganggu pengetikan form.
 * 3. Jika filter aktif (isActive === true) dan tombol Esc ditekan:
 *    Panggil onReset() untuk mereset teks pencarian, filter gudang, tanggal, dan status (A1).
 * 4. Tidak memaksa kursor pindah fokus kembali ke search field (A3).
 */
export function usePageFilterEsc({
    isActive = true,
    onReset,
    enabled = true,
}: UsePageFilterEscOptions) {
    const onResetRef = useRef(onReset);
    onResetRef.current = onReset;

    const isActiveRef = useRef(isActive);
    isActiveRef.current = isActive;

    useEffect(() => {
        if (!enabled) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (shouldHandlePageFilterEsc(event, Boolean(isActiveRef.current))) {
                event.preventDefault();
                onResetRef.current();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [enabled]);
}
