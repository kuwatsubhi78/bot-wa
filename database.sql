CREATE TABLE lembur (
  id BIGSERIAL PRIMARY KEY,
  nama TEXT NOT NULL,
  nomor_wa TEXT NOT NULL,
  tanggal DATE NOT NULL,
  uraian_pekerjaan TEXT NOT NULL,
  jam_mulai TIME,
  jam_selesai TIME,
  total_jam NUMERIC DEFAULT 0,
  tarif_per_jam NUMERIC DEFAULT 0,
  uang_lembur NUMERIC DEFAULT 0,
  uang_makan NUMERIC DEFAULT 0,
  total_diterima NUMERIC DEFAULT 0,
  periode_bulan INTEGER NOT NULL,
  periode_tahun INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_lembur_nomor_wa_tanggal ON lembur (nomor_wa, tanggal);
CREATE INDEX idx_lembur_periode ON lembur (periode_tahun, periode_bulan);

ALTER TABLE lembur
  ADD COLUMN IF NOT EXISTS divisi TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_libur BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS karyawan (
  nomor_wa TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  divisi TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kode_pekerjaan (
  kode TEXT PRIMARY KEY,
  deskripsi TEXT NOT NULL
);