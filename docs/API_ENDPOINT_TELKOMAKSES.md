# Spesifikasi & Katalog API Endpoint Eksternal Telkom Akses

Dokumen ini mendokumentasikan spesifikasi teknis, hasil respon data JSON lengkap, dan katalog endpoint internal Telkom Akses yang diintegrasikan dengan aplikasi **Monitoring Transaction Material's System (MTMS)**, menggunakan mekanisme autentikasi **Single Sign-On (SSO) Delegated Auth via Passcard**.

---

## 1. Status Audit & Pembaruan Jaringan

Berdasarkan audit konektivitas jaringan internal Telkom Akses:
* **Port 3001 (Usang)**: Layanan data profil lama pada port 3001 sudah ditutup (*Connection Refused*).
* **Port 3006 (Aktif)**: Layanan profil karyawan resmi aktif di port **3006** (`http://203.130.242.238:3006/data_profile/{nik}/16`).
* **Port 3004 (Aktif)**: Layanan rekap absensi harian karyawan aktif di port **3004** (`http://203.130.242.238:3004/report_absen/{nik}/{tgl}/{tgl}/Mobile`).
* **Passcard SSO Gateway (Aktif)**: Endpoint portal universal Passcard (`https://passcard.telkomakses.co.id/login.php`) aktif digunakan sebagai gerbang verifikasi kredensial NIK & Password seluruh karyawan Telkom Akses.

> [!NOTE]
> Portal **Passcard** digunakan sebagai basis SSO MTMS karena mencakup **seluruh karyawan Telkom Akses**, berbeda dengan portal internal logistik (seperti Lensa) yang hanya dapat diakses oleh akun dengan wewenang khusus pergudangan/teknisi.

---

## 2. Katalog Endpoint Internal & Respon JSON Lengkap

### 2.1 Endpoint Profil Karyawan (HRMIS TA)

Mengambil seluruh informasi data induk karyawan (*human capital*), struktur organisasi, jabatan, atasan langsung (Parent 1 & Parent 2), hingga detail cost center.

* **Method**: `GET`
* **URL**: `http://203.130.242.238:3006/data_profile/{nik}/16`
* **Header**:
  * `Accept: application/json`
* **Parameter Path**:
  * `nik` *(string)*: Nomor Induk Karyawan (contoh: `906627`)
  * `16` *(string/number)*: Identifier hierarki entitas/level TA

#### Contoh Respon JSON Keseluruhan (Data Ditemukan):
```json
{
  "status": true,
  "message": "Akses Diperbolekan",
  "data": [
    {
      "nik": "906627",
      "id_status_kerja": "2",
      "name": "IMAM FARDI",
      "no_ktp": "3524260611900003",
      "foto": "https://apps.telkomakses.co.id/wimata/photo/crop_906627.png",
      "directorate": "Operation",
      "reg": "JAWA BALI",
      "id_reg": "2772",
      "area": "JATIM",
      "id_area": "2783",
      "id_witel": "2825",
      "witel": "BRANCH LAMONGAN",
      "sub_unit": "Shared Service Regional Jawa Timur",
      "id_fiberzone": "2783",
      "tgl_mulai_bekerja": "2013-05-06",
      "no_gsm": "082334447478",
      "level_naker": "V",
      "level_posisi": "17",
      "nama_posisi": "Officer 3 Business Support Lamongan",
      "object_id": "85303010000040000",
      "unit": "Regional Jawa Timur",
      "psa": "LAMONGAN",
      "id_psa": "2887",
      "group_om": "BUSINESS SUPPORT",
      "pic_hr": "18910139",
      "parent_object_id": "85303010000000000",
      "posisi_parent_1": "Mgr Shared Service Regional Jawa Timur",
      "level_koor": "4",
      "nik_parent_1": "955133",
      "name_parent_1": "RIZAL FATAN NUGROHO",
      "posisi_object_parent_1": "85303000000000000",
      "level_spv": "3",
      "posisi_parent_2": "GM Regional Jawa Timur",
      "nik_parent_2": "730227",
      "name_parent_2": "SABAR SISWANTO",
      "posisi_object_parent_2": "85300000000000000",
      "bizpart_id": "2",
      "cost_center_id": "TA15Z04",
      "cost_center_name": "null",
      "mail": "imam.fardi@telkomakses.co.id",
      "telegram_id": null,
      "go_gsm": null,
      "no_gsm_parent_1": "081326997130",
      "no_gsm_parent_2": "08122956868",
      "tgl_lahir": "1990-11-06",
      "nama_status": "MENIKAH",
      "jenis_kelamin": "Laki-Laki",
      "alamat": "GG TEGAL REJO RT17/RW0006 Kec. Bungah,GRESIK",
      "status": "T"
    }
  ]
}
```

#### Contoh Respon JSON (NIK Tidak Terdaftar):
```json
{
  "status": true,
  "message": "Akses Diperbolekan",
  "data": [
    {
      "tgl_lahir": null,
      "mail": null,
      "nama_status": null,
      "jenis_kelamin": null,
      "alamat": ",",
      "status": "F"
    }
  ]
}
```
*Catatan*: Indikator keberadaan karyawan dapat diperiksa dari nilai `data[0].status === "T"` (True) atau `"F"` (False).

---

### 2.2 Endpoint Rekap Absensi Harian (Presensi Mobile)

Mengambil data presensi jam masuk dan jam pulang kerja karyawan berdasarkan rentang tanggal tertentu.

* **Method**: `GET`
* **URL**: `http://203.130.242.238:3004/report_absen/{nik}/{tanggal_awal}/{tanggal_akhir}/Mobile`
* **Header**:
  * `Accept: application/json`
* **Parameter Path**:
  * `nik` *(string)*: NIK karyawan (contoh: `906627`)
  * `tanggal_awal` *(string)*: Format tanggal `YYYY-MM-DD` (contoh: `2026-11-19`)
  * `tanggal_akhir` *(string)*: Format tanggal `YYYY-MM-DD` (contoh: `2026-11-19`)
  * `Mobile` *(string)*: Flag channel presensi mobile application

#### Contoh Respon JSON Keseluruhan (Single Day - Absen Masuk Saja):
```json
{
  "status": true,
  "message": "Akses Diperbolekan",
  "data": [
    {
      "present_date": "19/11/2026",
      "in_dtm": "08:32:54",
      "out_dtm": null,
      "keterangan": "m"
    }
  ]
}
```

#### Contoh Respon JSON Keseluruhan (Multi-Day Range):
```json
{
  "status": true,
  "message": "Akses Diperbolekan",
  "data": [
    {
      "present_date": "17/11/2026",
      "in_dtm": "07:28:21",
      "out_dtm": null,
      "keterangan": "m"
    },
    {
      "present_date": "18/11/2026",
      "in_dtm": "06:32:50",
      "out_dtm": null,
      "keterangan": "m"
    },
    {
      "present_date": "19/11/2026",
      "in_dtm": "08:32:54",
      "out_dtm": null,
      "keterangan": "m"
    }
  ]
}
```

#### Contoh Respon JSON (Belum Absen / NIK Tidak Ditemukan):
```json
{
  "status": true,
  "message": "Akses Diperbolekan",
  "data": []
}
```

#### Penjelasan Atribut Absen:
* `present_date`: Tanggal presensi (format `DD/MM/YYYY`).
* `in_dtm`: Jam tercatat masuk (WIB).
* `out_dtm`: Jam tercatat pulang (WIB), bernilai `null` jika karyawan belum melakukan absen pulang.
* `keterangan`: Status presensi (`"m"` = Masuk).

---

### 2.3 Endpoint Foto Karyawan & Gateway HC Enabler
* **Foto Karyawan**:
  * **URL**: `https://apps.telkomakses.co.id/wimata/photo/crop_{nik}.png`
  * **Tipe Konten**: `image/png`
* **Gateway HC Enabler (SSL)**:
  * **URL**: `https://180.250.124.178:4014/`
  * **Respon Default**: `{"state":"success","code":200,"payload":null,"message":"HC Enabler "}`

---

## 3. Mekanisme Login SSO Menggunakan Passcard

### 3.1 Konsep Delegated Authentication

Passcard (`https://passcard.telkomakses.co.id/login.php`) digunakan murni sebagai **Credential Verification Gateway**. Sistem MTMS memanfaatkan validasi password terpusat Telkom Akses tanpa perlu memvalidasi kode OTP yang dikirimkan Passcard.

```text
               ┌────────────────────────┐
               │    Halaman Login MTMS   │
               │ Input NIK & Password   │
               └───────────┬────────────┘
                           │
                           ▼ (Server Action MTMS)
┌─────────────────────────────────────────────────────────────┐
│ POST https://passcard.telkomakses.co.id/login.php           │
│ Body: nik=<NIK>&password=<PASSWORD>&login=Login             │
│ Setting: redirect: 'manual', timeout: 5000ms                │
└──────────────────────────┬──────────────────────────────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
    [HTTP STATUS 302]           [HTTP STATUS 200]
Location: form_otp.php          Ada text: alert-danger
             │                           │
             ▼                           ▼
┌─────────────────────────┐ ┌─────────────────────────┐
│     KREDENSIAL BENAR    │ │    KREDENSIAL SALAH     │
│                         │ │                         │
│ 1. Kredensial karyawan  │ │ 1. Return error objek   │
│    resmi terverifikasi. │ │ 2. Frontend MTMS        │
│ 2. Abaikan alur OTP.    │ │    menangkap error dan  │
│ 3. Lanjut ke langkah    │ │    menampilkan TOAST    │
│    AUTHENTICATOR 2FA    │ │    NOTIFIKASI MERAH     │
│    lokal MTMS.          │ │    ke pengguna.         │
└─────────────────────────┘ └─────────────────────────┘
```

---

### 3.2 Spesifikasi Request & Response Passcard

* **URL**: `https://passcard.telkomakses.co.id/login.php`
* **Method**: `POST`
* **Headers**:
  ```http
  Content-Type: application/x-www-form-urlencoded
  User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)
  ```
* **Payload**:
  ```x-www-form-urlencoded
  nik=906627&password=******&login=Login
  ```

#### Perbandingan Respon Server:

| Hasil Evaluasi | Status HTTP | Header `Location` | Isi Body HTML | Tindakan di MTMS |
| :--- | :---: | :---: | :--- | :--- |
| **Kredensial Valid** | **`302 Found`** | `form_otp.php` | Terisi NIK + HTML form | **SUKSES**: Teruskan ke Authenticator 2FA MTMS |
| **Kredensial Salah** | **`200 OK`** | *(Kosong)* | Berisi `<div class="alert alert-danger">NIK atau Password Anda Salah!!!</div>` | **GAGAL**: Tampilkan Toast *"NIK atau Password Anda Salah"* |
| **Server Timeout / Down**| *(Network Error)* | *(Kosong)* | *(None)* | **ERROR**: Tampilkan Toast *"Server SSO tidak merespon"* |

---

## 4. Contoh Implementasi Kode Siap Pakai

### 4.1 Script Google Apps Script (GAS)
Skrip lengkap untuk Google Apps Script / Google Sheets untuk memanggil data profil dan absensi karyawan:

```javascript
const NIK = '906627';

function cekHrmista() {
  // Port 3006 adalah port aktif terbaru (menggantikan port 3001)
  const url = `http://203.130.242.238:3006/data_profile/${NIK}/16`;
  
  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText();
    const content = JSON.parse(response);
    
    if (content.status && content.data && content.data.length > 0 && content.data[0].status === 'T') {
      const profile = content.data[0];
      Logger.log('Nama       : ' + profile.name);
      Logger.log('Posisi     : ' + profile.nama_posisi);
      Logger.log('PSA        : ' + profile.psa);
      Logger.log('Witel      : ' + profile.witel);
      Logger.log('Email      : ' + profile.mail);
      Logger.log('Atasan 1   : ' + profile.name_parent_1 + ' (' + profile.posisi_parent_1 + ')');
    } else {
      Logger.log('Data profile tidak ditemukan atau NIK belum terdaftar.');
    }
  } catch (err) {
    Logger.log('Gagal memanggil endpoint profile: ' + err.toString());
  }
}

function cekAbsen() {
  const date = new Date();
  const formattedDate = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const url = `http://203.130.242.238:3004/report_absen/${NIK}/${formattedDate}/${formattedDate}/Mobile`;
  
  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText();
    const content = JSON.parse(response);
    
    if (content.status && content.data && content.data.length > 0 && content.data[0].keterangan === 'm') {
      const absen = content.data[0];
      Logger.log('Tgl Absen  : ' + absen.present_date);
      Logger.log('Status     : Masuk');
      Logger.log('Jam Masuk  : ' + absen.in_dtm);
      Logger.log('Jam Pulang : ' + (absen.out_dtm ? absen.out_dtm : 'Belum Absen Pulang'));
    } else {
      Logger.log('Anda belum Absen hari ini');
    }
  } catch (err) {
    Logger.log('Gagal memanggil endpoint absen: ' + err.toString());
  }
}
```

---

### 4.2 Layanan Verifikasi SSO di MTMS (TypeScript / Node.js)

Layanan verifikasi kredensial terintegrasi untuk Server Action MTMS (`src/lib/services/passcard-sso.service.ts`):

```typescript
export interface PasscardSsoResult {
  success: boolean;
  message: string;
}

/**
 * Memverifikasi NIK dan Password karyawan ke gateway SSO Passcard Telkom Akses.
 * Jika kredensial valid, Passcard mengembalikan HTTP 302 ke form_otp.php.
 */
export async function verifyPasscardSso(
  nik: string,
  password: string
): Promise<PasscardSsoResult> {
  const PASSCARD_LOGIN_URL = 'https://passcard.telkomakses.co.id/login.php';

  try {
    const formParams = new URLSearchParams({
      nik: nik.trim(),
      password: password,
      login: 'Login',
    });

    const response = await fetch(PASSCARD_LOGIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      body: formParams.toString(),
      redirect: 'manual', // Sangat penting: jangan ikuti 302 redirect otomatis
      signal: AbortSignal.timeout(5000), // Timeout 5 detik
    });

    const locationHeader = response.headers.get('location') || '';

    // Kondisi Sukses: Redirect 302 ke form_otp.php membuktikan NIK & password cocok
    if (response.status === 302 && locationHeader.includes('form_otp.php')) {
      return {
        success: true,
        message: 'Kredensial SSO Telkom Akses valid.',
      };
    }

    // Kondisi Gagal: Server mengembalikan 200 OK dengan alert kesalahan
    const responseText = await response.text();
    if (responseText.includes('alert-danger') || responseText.includes('Salah')) {
      return {
        success: false,
        message: 'NIK atau Password Telkom Akses Anda salah.',
      };
    }

    return {
      success: false,
      message: 'Otentikasi ditolak oleh server Passcard.',
    };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    return {
      success: false,
      message: isTimeout
        ? 'Server SSO Passcard lambat merespon (Timeout). Silakan coba lagi.'
        : 'Tidak dapat terhubung ke server SSO Telkom Akses.',
    };
  }
}
```

#### Cara Menampilkan ke Toast pada Client Component (React / Next.js):
```tsx
import { toast } from 'sonner'; // atau ToastHelper MTMS

async function handleLoginSubmit(data: LoginFormData) {
  const result = await loginWithPasscardAction(data.nik, data.password);
  
  if (!result.success) {
    // Menampilkan toast notifikasi kesalahan
    toast.error(result.message);
    return;
  }

  // Jika sukses, alihkan ke step authenticator (2FA)
  toast.success('Kredensial terverifikasi. Masukkan kode Authenticator Anda.');
  router.push(`/auth/authenticator?nik=${data.nik}`);
}
```

---

## 5. Rekomendasi Keamanan MTMS

1. **Password Tidak Disimpan**: Password Telkom Akses hanya digunakan *in-flight* untuk verifikasi ke HTTPS Passcard dan tidak pernah disimpan di database lokal MTMS.
2. **Authenticator Lokal (2FA)**: Gunakan 2FA berbasis TOTP (Google Authenticator) di MTMS sebagai lapisan keamanan kedua setelah verifikasi Passcard berhasil.
3. **Pencegahan Brute-Force**: Tetap terapkan rate limiter internal MTMS (misal: maksimal 5 percobaan login gagal per IP dalam 5 menit) untuk melindungi akun karyawan dari upaya tebak password.
