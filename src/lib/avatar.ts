/**
 * Ekstraksi inisial 1-2 huruf kapital dari nama lengkap.
 * Isomorphic utility: aman dipanggil di Server Component maupun Client Component.
 * Contoh: "Ahmad Dahlan" -> "AD", "Budi" -> "B", undefined -> "U".
 */
export function getInitials(name?: string | null, maxChars = 2): string {
    if (!name || typeof name !== 'string') return 'U';
    const trimmed = name.trim();
    if (!trimmed) return 'U';

    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'U';

    return parts
        .slice(0, maxChars)
        .map((part) => part[0])
        .join('')
        .toUpperCase();
}

/**
 * URL resolver untuk foto profil berdasarkan NIK dan ekstensi.
 * Default ekstensi adalah 'jpg' karena format standar foto profil MTMS adalah JPG.
 */
export function getProfileImageUrl(
    nik?: string | null,
    ext: 'jpg' | 'png' = 'jpg'
): string | undefined {
    if (!nik || typeof nik !== 'string') return undefined;
    const cleanNik = nik.trim();
    if (!cleanNik) return undefined;
    return `/images/profile/${cleanNik}.${ext}`;
}
