const { hitungLembur, TARIF_PER_JAM } = require("../../utils/calculator");
const {
  formatCurrency,
  normalizeText,
  formatDateIndo,
} = require("../../utils/formatter");
const { tambahLembur, cariKaryawan } = require("../../services/lemburService");
const { getSenderNumber } = require("../utils/senderHelper");
const { todayISO, yesterdayISO } = require("../utils/dateHelper");
const { splitJamRange, formatJamTitik } = require("../utils/jamHelper");

const JADWAL_MINGGUAN = {
  "!m1": { jamMulai: "12:00", jamSelesai: "14:00" },
  "!m2": { jamMulai: "20:00", jamSelesai: "22:00" },
  "!m3": { jamMulai: "04:00", jamSelesai: "06:00" },
};

const PERINTAH_SIF_TIDAK_TENTU = ["!l1", "!l2", "!l3"];

async function requireKaryawan(payload) {
  const nomorPolos = getSenderNumber(payload);
  const result = await cariKaryawan(nomorPolos);

  if (result.status === "skipped")
    return {
      ok: false,
      message: "Gagal memproses: Supabase belum dikonfigurasi.",
    };
  if (result.status === "error")
    return { ok: false, message: `Gagal memproses: ${result.message}` };
  if (result.status === "not_found")
    return {
      ok: false,
      message:
        "Nomor Anda belum terdaftar. Ketik *!daftar Nama, Divisi* untuk mendaftar.",
    };

  return { ok: true, karyawan: result.data };
}

async function simpanLemburDanBalas({
  nama,
  divisi,
  payload,
  tanggalISO,
  jamMulai,
  jamSelesai,
  uraianPekerjaan,
  isLibur,
}) {
  const hasil = hitungLembur(jamMulai, jamSelesai, isLibur);

  if (hasil.totalJam <= 0) {
    return {
      status: "error",
      message: "Jam selesai harus setelah jam mulai. Cek kembali format jam.",
    };
  }

  const result = await tambahLembur({
    nama,
    divisi,
    nomor_wa: getSenderNumber(payload),
    tanggal: tanggalISO,
    uraian_pekerjaan: uraianPekerjaan,
    jam_mulai: jamMulai,
    jam_selesai: jamSelesai,
    total_jam: hasil.totalJam,
    tarif_per_jam: hasil.tarifPerJam,
    uang_lembur: hasil.uangLembur,
    uang_makan: hasil.uangMakan,
    total_diterima: hasil.totalDiterima,
    is_libur: isLibur,
  });

  if (result.status !== "ok")
    return { status: "error", message: `Gagal menyimpan: ${result.message}` };

  const lines = [
    "✅ *FORMAT LEMBUR*",
    "",
    `Tanggal          : ${formatDateIndo(tanggalISO)}`,
    `Nama             : ${nama}`,
    `Uraian pekerjaan : ${uraianPekerjaan}`,
    `Jam Lembur       : ${formatJamTitik(jamMulai)}-${formatJamTitik(jamSelesai)}`,
  ];

  // if (isLibur) lines.push(`Catatan          : Lembur hari libur`);

  lines.push(
    "",
    `Hasil : ${hasil.totalJam} jam × Rp. ${formatCurrency(TARIF_PER_JAM).replace("Rp", "").trim()} = *Rp. ${formatCurrency(hasil.uangLembur).replace("Rp", "").trim()}*`,
  );

  if (hasil.uangMakan > 0)
    lines.push(`Uang Makan : 1 × ${formatCurrency(hasil.uangMakan)}`);

  return { status: "ok", message: lines.join("\n") };
}

function parseSifTidakTentuCommand(input) {
  const text = normalizeText(input);
  const match = text.match(/^(!l[123])\s+(.+)$/i);
  if (!match) return null;

  const command = match[1].toLowerCase();
  const tokens = match[2].trim().split(/\s+/);
  const jamRange = splitJamRange(tokens[0]);
  if (!jamRange) return null;

  let sisaTokens = tokens.slice(1);
  let isLibur = false;

  if (
    sisaTokens.length > 0 &&
    sisaTokens[sisaTokens.length - 1].toLowerCase() === "libur"
  ) {
    isLibur = true;
    sisaTokens = sisaTokens.slice(0, -1);
  }

  const uraianPekerjaan = sisaTokens.join(" ").trim();
  if (!uraianPekerjaan) return null;

  return { command, jamRange, uraianPekerjaan, isLibur };
}

async function processSifTidakTentu(parsed, payload) {
  const validasi = await requireKaryawan(payload);
  if (!validasi.ok) return { status: "error", message: validasi.message };

  const tanggal = parsed.command === "!l3" ? yesterdayISO() : todayISO();
  return await simpanLemburDanBalas({
    nama: validasi.karyawan.nama,
    divisi: validasi.karyawan.divisi,
    payload,
    tanggalISO: tanggal,
    jamMulai: parsed.jamRange.jamMulai,
    jamSelesai: parsed.jamRange.jamSelesai,
    uraianPekerjaan: parsed.uraianPekerjaan,
    isLibur: parsed.isLibur,
  });
}

function parseSifMingguanCommand(commandKey, input) {
  const text = normalizeText(input);
  const uraian = text.replace(new RegExp(`^${commandKey}\\s*`, "i"), "").trim();
  if (!uraian) return null;
  return { uraian };
}

async function processSifMingguan(commandKey, payload) {
  const validasi = await requireKaryawan(payload);
  if (!validasi.ok) return { status: "error", message: validasi.message };

  const parsed = parseSifMingguanCommand(commandKey, payload?.text || "");
  if (!parsed) {
    return {
      status: "error",
      message: `Format salah.\nContoh:\n${commandKey} slitting`,
    };
  }

  const jadwal = JADWAL_MINGGUAN[commandKey];
  const tanggal = commandKey === "!m3" ? yesterdayISO() : todayISO();
  return await simpanLemburDanBalas({
    nama: validasi.karyawan.nama,
    divisi: validasi.karyawan.divisi,
    payload,
    tanggalISO: tanggal,
    jamMulai: jadwal.jamMulai,
    jamSelesai: jadwal.jamSelesai,
    uraianPekerjaan: parsed.uraian,
    isLibur: false,
  });
}

module.exports = {
  JADWAL_MINGGUAN,
  PERINTAH_SIF_TIDAK_TENTU,
  requireKaryawan,
  parseSifTidakTentuCommand,
  processSifTidakTentu,
  processSifMingguan,
};
