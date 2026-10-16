/**
 * Material alias helper untuk resolusi nama material dari sistem Lensa eksternal.
 *
 * Beberapa material di Lensa dikirim dengan kolom `ID MATERIAL` kosong,
 * umumnya karena nama material yang digunakan merupakan gabungan dua item
 * (contoh: "Breket / Clamp Hook"). Helper ini memetakan nama-nama tersebut
 * ke `material_id` yang benar di master data MTMS.
 *
 * Untuk menambah alias baru: tambahkan entry di MATERIAL_ALIAS_MAP dengan
 * key = nama material persis seperti yang muncul di halaman Lensa (case-insensitive),
 * value = kode material di `inventory.materials`.
 */

/**
 * Map alias nama material Lensa → material_id di MTMS.
 * Key dinormalisasi ke lowercase saat lookup, jadi penulisan key boleh mixed-case.
 */
const MATERIAL_ALIAS_MAP: Record<string, string> = {
    // "Breket / Clamp Hook" di halaman detail WO Lensa tidak memiliki ID MATERIAL.
    // Berdasarkan konfirmasi bisnis, material ini dipetakan ke BREKET-A (id 52).
    'breket / clamp hook': 'BREKET-A',
};

/**
 * Mencoba meresolusi `material_id` dari nama material ketika Lensa
 * mengembalikan kolom `ID MATERIAL` kosong/null.
 *
 * @param materialDesc - Nilai kolom `NAMA MATERIAL` dari scraper Lensa.
 * @returns `material_id` yang sesuai jika ada alias, atau `null` jika tidak ditemukan.
 *
 * @example
 * resolveMaterialAlias('Breket / Clamp Hook') // → 'BREKET-A'
 * resolveMaterialAlias('Clamp-Hook')           // → null (ID-nya sudah terisi dari Lensa)
 * resolveMaterialAlias(null)                   // → null
 */
export function resolveMaterialAlias(materialDesc: string | null | undefined): string | null {
    if (!materialDesc) return null;
    const key = materialDesc.trim().toLowerCase();
    return MATERIAL_ALIAS_MAP[key] ?? null;
}
