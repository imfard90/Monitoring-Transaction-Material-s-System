'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

interface AttendanceToastProps {
    hasCheckedIn: boolean;
    checkInTime?: string;
    nik?: string;
}

/**
 * Komponen Toast untuk menampilkan informasi kehadiran harian di Dashboard setelah login.
 * Menghilang otomatis setelah 5 detik atau bisa ditutup manual oleh pengguna.
 * Menggunakan sessionStorage agar muncul 1 kali per sesi per hari setelah login.
 */
export function AttendanceToast({ hasCheckedIn, checkInTime, nik }: AttendanceToastProps) {
    const hasTriggeredRef = useRef(false);

    useEffect(() => {
        if (hasTriggeredRef.current) return;
        hasTriggeredRef.current = true;

        const todayKey = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Jakarta',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(new Date());

        const storageKey = `mtms_attendance_toast_${nik || 'anonymous'}_${todayKey}`;

        // Periksa apakah toast sudah pernah ditampilkan pada sesi login browser saat ini
        if (typeof window !== 'undefined') {
            try {
                const storedState = sessionStorage.getItem(storageKey);
                // Jika sudah pernah menampilkan status 'checked_in', jangan tampilkan lagi di sesi ini
                if (storedState === 'checked_in') {
                    return;
                }
                // Jika belum absen dan sudah pernah menampilkan notifikasi 'pending', jangan spam di sesi ini
                if (!hasCheckedIn && storedState === 'pending') {
                    return;
                }

                sessionStorage.setItem(storageKey, hasCheckedIn ? 'checked_in' : 'pending');
            } catch {
                // Ignore sessionStorage errors
            }
        }

        if (hasCheckedIn) {
            const timeLabel = checkInTime || 'hari ini';
            toast.success(`Anda sudah absen masuk pukul ${timeLabel}`, {
                description: 'Presensi harian tercatat di sistem Telkom Akses.',
                duration: 5000,
                closeButton: true,
                id: 'attendance-toast',
            });
        } else {
            toast.warning('Hari ini anda belum absen masuk', {
                description: 'Jangan lupa untuk melakukan presensi kehadiran mobile Anda.',
                duration: 5000,
                closeButton: true,
                id: 'attendance-toast',
            });
        }
    }, [hasCheckedIn, checkInTime, nik]);

    return null;
}
