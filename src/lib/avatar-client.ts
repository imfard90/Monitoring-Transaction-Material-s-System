'use client';

import { useCallback, useEffect, useState } from 'react';
import { getProfileImageUrl } from './avatar';

/**
 * Hook cerdas untuk avatar profil dengan fallback multi-format:
 * 1. Mencoba customUrl (jika ada).
 * 2. Mencoba foto NIK berformat .jpg (standar utama).
 * 3. Jika .jpg gagal (onError), otomatis fallback mencoba .png.
 * 4. Jika .png juga gagal, fallback ke undefined (mengaktifkan AvatarFallback inisial).
 */
export function useProfileAvatar(nik?: string | null, customUrl?: string | null) {
    const getInitialSrc = useCallback(() => {
        if (customUrl) return customUrl;
        if (nik) return getProfileImageUrl(nik, 'jpg');
        return undefined;
    }, [nik, customUrl]);

    const [src, setSrc] = useState<string | undefined>(getInitialSrc);

    useEffect(() => {
        setSrc(getInitialSrc());
    }, [getInitialSrc]);

    const handleError = useCallback(() => {
        if (src && nik && src.endsWith('.jpg')) {
            // Fallback transparan ke .png jika file .jpg tidak ditemukan
            setSrc(getProfileImageUrl(nik, 'png'));
        } else {
            // Jika .png juga tidak ada atau format lain error, fallback ke inisial
            setSrc(undefined);
        }
    }, [src, nik]);

    return {
        src,
        onError: handleError,
    };
}
