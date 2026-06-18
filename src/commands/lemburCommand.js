const {
  hitungLembur,
  calculateOvertime,
  TARIF_PER_JAM,
} = require("../utils/calculator");
const {
  formatCurrency,
  normalizeText,
  formatCommandError,
  formatDateIndo,
  formatJamRange,
  formatDuration,
} = require("../utils/formatter");
const {
  ambilLemburPeriode,
  getPeriodRange,
  getPeriodForDate,
  tambahLembur,
} = require("../services/lemburService");

// ====================================================================
// Parse !tambah
// Format: !tambah tanggal, nama, divisi, jam, uraian [, libur]
// ====================================================================
function parseTambahCommand(input) {
  const commandText = normalizeText(input);

  if (!commandText.startsWith("!tambah")) {
    return null;
  }

  const rawArgs = commandText.replace(/^!tambah\s*/i, "");
  const parts = rawArgs.split(",").map((part) => part.trim());

  // Minimal 5 bagian: tanggal, nama, divisi, jam, uraian
  if (parts.length < 5) {
    return null;
  }

  const [tanggal, nama, divisi, jamLembur, ...rest] = parts;

  // Cek apakah bagian terakhir adalah flag "libur"
  const lastPart = rest[rest.length - 1]?.toLowerCase().trim();
  const isLibur = lastPart === "libur";

  // Uraian adalah semua bagian setelah jam, kecuali flag "libur"
  const uraianParts = isLibur ? rest.slice(0, -1) : rest;
  const uraianPekerjaan = uraianParts.join(", ").trim();

  if (!tanggal || !nama || !divisi || !jamLembur || !uraianPekerjaan) {
    return null;
  }

  return { tanggal, nama, divisi, jamLembur, uraianPekerjaan, isLibur };
}

// ====================================================================
// Parse !lembur
// ====================================================================
function parseRekapCommand(input) {
  const commandText = normalizeText(input);

  if (!commandText.startsWith("!lembur")) {
    return null;
  }

  const rawArgs = commandText.replace(/^!lembur\s*/i, "");
  const args = rawArgs.split(/\s+/).filter(Boolean);

  if (args.length === 0) {
    return { bulan: null, tahun: null };
  }

  if (args.length !== 2) {
    return null;
  }

  return {
    bulan: Number(args[0]),
    tahun: Number(args[1]),
  };
}

// ====================================================================
// Helpers
// ====================================================================
function getSenderNumber(payload) {
  const raw =
    payload?.nomor_wa ||
    payload?.nomorWa ||
    payload?.sender ||
    payload?.from ||
    payload?.key?.remoteJid ||
    payload?.user?.id ||
    "";

  return raw.replace(/@.*$/, "").replace(/:.*$/, "").trim();
}

function parseTanggalToISO(tanggal) {
  const match = String(tanggal || "")
    .trim()
    .match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);

  if (!match) return null;

  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);

  const date = new Date(year, month - 1, day);
  const isValid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  if (!isValid) return null;

  return `${yyyy}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function splitJamRange(jamLembur) {
  const parts = String(jamLembur || "")
    .split("-")
    .map((p) => p.trim());

  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  return { jamMulai: parts[0], jamSelesai: parts[1] };
}

// ====================================================================
// Format jam: "04:00" → "04.00"
// ====================================================================
function formatJamTitik(jam) {
  return String(jam || "").replace(":", ".");
}

// ====================================================================
// Proses !tambah
// ====================================================================
async function processTambahCommand(parsedTambah, payload) {
  const { tanggal, nama, divisi, jamLembur, uraianPekerjaan, isLibur } =
    parsedTambah;

  const tanggalISO = parseTanggalToISO(tanggal);
  const jamRange = splitJamRange(jamLembur);

  if (!tanggalISO || !jamRange) {
    return {
      status: "error",
      message: formatCommandError
        ? formatCommandError()
        : "Format salah.\nContoh:\n!tambah 24-05-2026, Nama, Divisi, 08:00-10:00, uraian\nTambah flag *libur* di akhir jika hari libur.",
    };
  }

  const hasil = hitungLembur(jamRange.jamMulai, jamRange.jamSelesai, isLibur);
  const nomorWA = getSenderNumber(payload);

  const result = await tambahLembur({
    nama,
    divisi,
    nomor_wa: nomorWA,
    tanggal: tanggalISO,
    uraian_pekerjaan: uraianPekerjaan,
    jam_mulai: jamRange.jamMulai,
    jam_selesai: jamRange.jamSelesai,
    total_jam: hasil.totalJam,
    tarif_per_jam: hasil.tarifPerJam,
    uang_lembur: hasil.uangLembur,
    uang_makan: hasil.uangMakan,
    total_diterima: hasil.totalDiterima,
    is_libur: isLibur,
  });

  if (result.status === "error") {
    return { status: "error", message: `Gagal menyimpan: ${result.message}` };
  }

  if (result.status === "skipped") {
    return {
      status: "error",
      message: "Gagal menyimpan: Supabase belum dikonfigurasi.",
    };
  }

  const jamAsli = hasil.isLibur ? hasil.totalJam / 2 : hasil.totalJam;

  const lines = [
    "✅ DATA LEMBUR TERSIMPAN",
    "",
    `Tanggal  : ${formatDateIndo(tanggalISO)}${isLibur ? " *(Hari Libur)*" : ""}`,
    `Nama     : ${nama}`,
    `Divisi   : ${divisi}`,
    `Jam      : ${formatJamTitik(jamRange.jamMulai)}-${formatJamTitik(jamRange.jamSelesai)} (${jamAsli} jam${isLibur ? ` × 2 = ${hasil.totalJam} jam` : ""})`,
    `Uraian   : ${uraianPekerjaan}`,
    "",
    `Uang Lembur : ${formatCurrency(hasil.uangLembur)}`,
    `Uang Makan  : ${formatCurrency(hasil.uangMakan)}`,
    `Total       : ${formatCurrency(hasil.totalDiterima)}`,
  ];

  return { status: "ok", message: lines.join("\n") };
}

// ====================================================================
// Build pesan rekap
// ====================================================================
function buildRekapMessage(items, tanggalAwal, tanggalAkhir) {
  if (!items || items.length === 0) {
    return "Belum ada data lembur pada periode ini.";
  }

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

  const baris = items.map((item, idx) => {
    const jamMulai = formatJamTitik(item.jam_mulai);
    const jamSelesai = formatJamTitik(item.jam_selesai);
    const libur = item.is_libur ? " *(libur)*" : "";
    return `${idx + 1}. ${formatDateIndo(item.tanggal)}_${jamMulai}-${jamSelesai}_${Number(item.total_jam || 0)} Jam_${item.uraian_pekerjaan}${libur}`;
  });

  const lines = [
    `REKAP LEMBUR ${formatDateIndo(tanggalAwal)} - ${formatDateIndo(tanggalAkhir)}`,
    `Nama   : ${nama}`,
    `Divisi : ${divisi}`,
    "",
    ...baris,
    "",
    `Total Jam : ${totalJam} Jam × ${formatCurrency(TARIF_PER_JAM)} = ${formatCurrency(totalUangLembur)}`,
    `Uang Makan : ${formatCurrency(6000)} × ${jumlahMakan} = ${formatCurrency(totalUangMakan)}`,
    `TOTAL : ${formatCurrency(totalDiterima)}`,
  ];

  return lines.join("\n");
}

// ====================================================================
// Handler utama
// ====================================================================
async function handleLemburCommand(payload) {
  const textPayload =
    typeof payload === "string"
      ? payload
      : payload?.text || payload?.message || payload?.command;

  if (textPayload) {
    const parsedTambah = parseTambahCommand(textPayload);
    if (parsedTambah) {
      return await processTambahCommand(parsedTambah, payload);
    }

    if (normalizeText(textPayload).startsWith("!tambah")) {
      return {
        status: "error",
        message:
          "Format salah.\nContoh:\n!tambah 24-05-2026, Nama, Divisi, 08:00-10:00, uraian pekerjaan\nTambah *libur* di akhir jika hari libur:\n!tambah 24-05-2026, Nama, Divisi, 08:00-10:00, uraian pekerjaan, libur",
      };
    }

    const parsedRekap = parseRekapCommand(textPayload);
    if (parsedRekap !== null) {
      try {
        const nomorWA = getSenderNumber(payload);
        const now = new Date();
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

        if (result.status !== "ok") {
          return { status: result.status, message: result.message };
        }

        const message = buildRekapMessage(
          result.data || [],
          tanggalAwal,
          tanggalAkhir,
        );
        return { status: "ok", message };
      } catch (error) {
        return { status: "error", message: error.message };
      }
    }
  }

  const { jamLembur = 0, tarif = 0 } = payload || {};
  const total = calculateOvertime(jamLembur, tarif);

  return {
    status: "ok",
    message: `Rekap lembur: ${formatDuration ? formatDuration(jamLembur) : jamLembur} jam dengan total ${total}`,
  };
}

module.exports = {
  handleLemburCommand,
};
