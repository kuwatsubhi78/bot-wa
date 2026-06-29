# Bot WhatsApp Rekap Lembur

Bot WhatsApp untuk mencatat dan merekap lembur karyawan pabrik sistem 3 sif.

## Stack

- **Runtime:** Node.js
- **WhatsApp:** `@whiskeysockets/baileys`
- **Database:** Supabase (PostgreSQL)
- **Scheduler:** `node-cron`
- **Deploy:** Northflank (persistent volume untuk sesi WA)

---

## Fitur

### Untuk Karyawan

- `!daftar Nama, Divisi` — daftar sebagai karyawan (butuh persetujuan admin)
- `!l1 jam-jam uraian [libur]` — catat lembur tidak tentu, Sif 1
- `!l2 jam-jam uraian [libur]` — catat lembur tidak tentu, Sif 2
- `!l3 jam-jam uraian [libur]` — catat lembur tidak tentu, Sif 3 (tanggal otomatis kemarin)
- `!m1 uraian` — catat lembur mingguan tetap, Sif 1 (12:00–14:00)
- `!m2 uraian` — catat lembur mingguan tetap, Sif 2 (20:00–22:00)
- `!m3 uraian` — catat lembur mingguan tetap, Sif 3 (04:00–06:00, tanggal kemarin)
- `!lembur` — lihat rekap lembur periode 18–17
- `!lembur [bulan] [tahun]` — lihat rekap lembur periode 18–17 dalam periode tertentu
- `!kode` — lihat daftar kode pekerjaan
- `!hapus [id]` — hapus data lembur
- `!edit [id], jam, uraian` — edit data lembur
- `!bantuan` — tampilkan menu

### Untuk Admin

- `!adminon [kode]` — aktifkan mode admin (berlaku 30 menit)
- `!adminoff` — nonaktifkan mode admin
- `!setujui [id]` — setujui permintaan pendaftaran karyawan
- `!daftarkaryawan nomor, nama, divisi` — daftarkan karyawan langsung
- `!kode` — lihat daftar kode pekerjaan
- `!hapus [id]` — hapus data lembur
- `!edit [id], jam, uraian` — edit data lembur
- `!export [bulan] [tahun]` — export CSV rekap semua karyawan

---

## Perhitungan Lembur

| Keterangan        | Nilai                            |
| ----------------- | -------------------------------- |
| Tarif per jam     | Rp 15.656                        |
| Uang makan        | Rp 6.000 (jika lembur ≥ 3,5 jam) |
| Lembur hari libur | Total jam × 2                    |

**Periode lembur** bukan per bulan kalender, tapi siklus 18–17:

- Tanggal 1–17 → masuk periode bulan berjalan
- Tanggal 18–31 → masuk periode bulan depan

---

## Setup Lokal

### 1. Clone dan install

```bash
git clone <repo-url>
cd bot-wa
npm install
```

### 2. Buat file `.env`
