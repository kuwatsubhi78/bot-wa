const { TARIF_PER_JAM } = require("../../utils/calculator");
const { hitungLembur } = require("../../utils/calculator");
const {
  formatCurrency,
  normalizeText,
  formatDateIndo,
} = require("../../utils/formatter");
const {
  ambilLemburPeriode,
  ambilLemburById,
  hapusLemburById,
  updateLemburById,
  getPeriodRange,
  getPeriodForDate,
} = require("../../services/lemburService");
const { getSenderNumber, isAdminActive } = require("../utils/senderHelper");
const { nowWIB } = require("../utils/dateHelper");
const { splitJamRange, formatJamTitik } = require("../utils/jamHelper");

function buildRekapMessage(items, tanggalAwal, tanggalAkhir, tampilId = false) {
  if (!items || items.length === 0)
    return "Belum ada data lembur pada periode ini.";

  const nama = items[0]?.nama || "-";
  const divisi = items[0]?.divisi || "-";

  const totalJam = items.reduce((sum, i) => sum + Number(i.total_jam || 0), 0);
  const totalUangLembur = items.reduce(
    (sum, i) => sum + Number(i.uang_lembur || 0),
    0,
  );
  const totalUangMakan = items.reduce(
    (sum, i) => sum + Number(i.uang_makan || 0),
    0,
  );
  const totalDiterima = items.reduce(
    (sum, i) => sum + Number(i.total_diterima || 0),
    0,
  );
  const jumlahMakan = items.filter((i) => Number(i.uang_makan || 0) > 0).length;

  const periodeHeader = `REKAP LEMBUR ${formatDateIndo(tanggalAwal)} - ${formatDateIndo(tanggalAkhir)}`;

  const baris = items.map((item, idx) => {
    const tagId = tampilId ? ` [ID:${item.id}]` : "";
    return `${idx + 1}. ${formatDateIndo(item.tanggal)}_${formatJamTitik(item.jam_mulai)}-${formatJamTitik(item.jam_selesai)}_${Number(item.total_jam || 0)} Jam_${item.uraian_pekerjaan}${tagId}`;
  });

  const lines = [
    `*UNTUK ${periodeHeader}*`,
    periodeHeader,
    `Nama   : *${nama}*`,
    `Divisi : ${divisi}`,
    "",
    ...baris,
    "",
    `Total Jam : ${totalJam} Jam x Rp ${formatCurrency(TARIF_PER_JAM).replace("Rp", "").trim()} = Rp.*${formatCurrency(totalUangLembur).replace("Rp", "").trim()}*`,
  ];

  if (jumlahMakan > 0) {
    lines.push(`Uang makan : ${jumlahMakan} × ${formatCurrency(6000)}`);
  }

  lines.push(
    `TOTAL : Rp. *${formatCurrency(totalDiterima).replace("Rp", "").trim()}*`,
  );
  return lines.join("\n");
}

function parseRekapCommand(input) {
  const text = normalizeText(input);
  if (!text.startsWith("!lembur")) return null;

  const args = text
    .replace(/^!lembur\s*/i, "")
    .split(/\s+/)
    .filter(Boolean);
  if (args.length === 0) return { bulan: null, tahun: null };
  if (args.length !== 2) return null;

  return { bulan: Number(args[0]), tahun: Number(args[1]) };
}

async function processRekap(parsedRekap, payload) {
  try {
    const nomorWA = getSenderNumber(payload);
    const now = nowWIB();
    const periodForNow = getPeriodForDate(now);
    const selectedMonth = parsedRekap.bulan || periodForNow.periodeBulan;
    const selectedYear = parsedRekap.tahun || periodForNow.periodeTahun;
    const { tanggalAwal, tanggalAkhir } = getPeriodRange(
      selectedMonth,
      selectedYear,
    );

    const result = await ambilLemburPeriode(
      nomorWA,
      selectedMonth,
      selectedYear,
    );
    if (result.status !== "ok")
      return { status: result.status, message: result.message };

    const tampilId = isAdminActive(payload);
    return {
      status: "ok",
      message: buildRekapMessage(
        result.data || [],
        tanggalAwal,
        tanggalAkhir,
        tampilId,
      ),
    };
  } catch (error) {
    return { status: "error", message: error.message };
  }
}

function parseHapusCommand(input) {
  const match = normalizeText(input).match(/^!hapus\s+(\d+)\s*$/i);
  if (!match) return null;
  return { id: Number(match[1]) };
}

async function processHapus(parsed, payload) {
  const { id } = parsed;
  const existing = await ambilLemburById(id);

  if (existing.status === "skipped")
    return { status: "error", message: "Supabase belum dikonfigurasi." };
  if (existing.status === "error")
    return {
      status: "error",
      message: `Gagal mengambil data: ${existing.message}`,
    };
  if (existing.status === "not_found")
    return {
      status: "error",
      message: `Data dengan ID ${id} tidak ditemukan.`,
    };

  if (!isAdminActive(payload)) {
    if (String(existing.data.nomor_wa) !== getSenderNumber(payload)) {
      return {
        status: "error",
        message: "Anda hanya bisa menghapus data lembur milik sendiri.",
      };
    }
  }

  const result = await hapusLemburById(id);
  if (result.status !== "ok")
    return { status: "error", message: `Gagal menghapus: ${result.message}` };

  return {
    status: "ok",
    message: `✅ Data lembur dengan ID ${id} berhasil dihapus.`,
  };
}

function parseEditCommand(input) {
  const text = normalizeText(input);
  if (!/^!edit\b/i.test(text)) return null;

  const parts = text
    .replace(/^!edit\s*/i, "")
    .split(",")
    .map((p) => p.trim());
  if (parts.length < 3) return null;

  const [idPart, jamPart, ...uraianParts] = parts;
  const id = Number(idPart);
  const uraianPekerjaan = uraianParts.join(", ").trim();

  if (!Number.isInteger(id) || id <= 0 || !jamPart || !uraianPekerjaan)
    return null;
  return { id, jamPart, uraianPekerjaan };
}

async function processEdit(parsed, payload) {
  const { id, jamPart, uraianPekerjaan } = parsed;
  const existing = await ambilLemburById(id);

  if (existing.status === "skipped")
    return { status: "error", message: "Supabase belum dikonfigurasi." };
  if (existing.status === "error")
    return {
      status: "error",
      message: `Gagal mengambil data: ${existing.message}`,
    };
  if (existing.status === "not_found")
    return {
      status: "error",
      message: `Data dengan ID ${id} tidak ditemukan.`,
    };

  if (!isAdminActive(payload)) {
    if (String(existing.data.nomor_wa) !== getSenderNumber(payload)) {
      return {
        status: "error",
        message: "Anda hanya bisa mengedit data lembur milik sendiri.",
      };
    }
  }

  const jamRange = splitJamRange(jamPart);
  if (!jamRange)
    return {
      status: "error",
      message: "Format jam salah. Gunakan format 08:00-10:00.",
    };

  const hasil = hitungLembur(
    jamRange.jamMulai,
    jamRange.jamSelesai,
    existing.data.is_libur || false,
  );
  if (hasil.totalJam <= 0)
    return { status: "error", message: "Jam selesai harus setelah jam mulai." };

  const result = await updateLemburById(id, {
    jam_mulai: jamRange.jamMulai,
    jam_selesai: jamRange.jamSelesai,
    uraian_pekerjaan: uraianPekerjaan,
    total_jam: hasil.totalJam,
    tarif_per_jam: hasil.tarifPerJam,
    uang_lembur: hasil.uangLembur,
    uang_makan: hasil.uangMakan,
    total_diterima: hasil.totalDiterima,
  });

  if (result.status !== "ok")
    return { status: "error", message: `Gagal mengupdate: ${result.message}` };

  return {
    status: "ok",
    message: [
      `✅ Data lembur ID ${id} berhasil diupdate.`,
      "",
      `Jam      : ${formatJamTitik(jamRange.jamMulai)}-${formatJamTitik(jamRange.jamSelesai)}`,
      `Uraian   : ${uraianPekerjaan}`,
      `Total Jam: ${hasil.totalJam} jam`,
      `Total    : ${formatCurrency(hasil.totalDiterima)}`,
    ].join("\n"),
  };
}

module.exports = {
  parseRekapCommand,
  processRekap,
  parseHapusCommand,
  processHapus,
  parseEditCommand,
  processEdit,
};
