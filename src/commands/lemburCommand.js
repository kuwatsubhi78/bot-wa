const { calculateOvertime, hitungLembur } = require("../utils/calculator");
const {
  formatDuration,
  normalizeText,
  formatCommandError,
  formatCurrency,
  formatDateIndo,
  formatJamRange,
} = require("../utils/formatter");
const {
  ambilLemburPeriode,
  getPeriodRange,
  getPeriodForDate,
  tambahLembur,
} = require("../services/lemburService");

function parseTambahCommand(input) {
  const commandText = normalizeText(input);

  if (!commandText.startsWith("!tambah")) {
    return null;
  }

  const rawArgs = commandText.replace(/^!tambah\s*/i, "");
  const parts = rawArgs.split(",").map((part) => part.trim());

  if (parts.length < 4) {
    return null;
  }

  const [tanggal, nama, jamLembur, ...uraianParts] = parts;
  const uraianPekerjaan = uraianParts.join(", ");

  if (!tanggal || !nama || !jamLembur || !uraianPekerjaan) {
    return null;
  }

  return {
    tanggal,
    nama,
    jamLembur,
    uraianPekerjaan,
  };
}

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

function getSenderNumber(payload) {
  return (
    payload?.nomor_wa ||
    payload?.nomorWa ||
    payload?.sender ||
    payload?.from ||
    payload?.user?.id ||
    ""
  );
}

function parseTanggalToISO(tanggal) {
  const match = String(tanggal || "")
    .trim()
    .match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);

  if (!match) {
    return null;
  }

  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);

  const date = new Date(year, month - 1, day);
  const isValidDate =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  if (!isValidDate) {
    return null;
  }

  return `${yyyy}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function splitJamRange(jamLembur) {
  const parts = String(jamLembur || "")
    .split("-")
    .map((part) => part.trim());

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  return { jamMulai: parts[0], jamSelesai: parts[1] };
}

async function processTambahCommand(parsedTambah, payload) {
  const { tanggal, nama, jamLembur, uraianPekerjaan } = parsedTambah;

  const tanggalISO = parseTanggalToISO(tanggal);
  const jamRange = splitJamRange(jamLembur);

  if (!tanggalISO || !jamRange) {
    return {
      status: "error",
      message: formatCommandError(),
    };
  }

  const hasil = hitungLembur(jamRange.jamMulai, jamRange.jamSelesai);
  const nomorWA = getSenderNumber(payload);

  const result = await tambahLembur({
    nama,
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
  });

  if (result.status === "error") {
    return {
      status: "error",
      message: `Gagal menyimpan data lembur: ${result.message}`,
    };
  }

  if (result.status === "skipped") {
    return {
      status: "error",
      message: "Gagal menyimpan: Supabase belum dikonfigurasi.",
    };
  }

  const message = [
    "DATA LEMBUR TERSIMPAN",
    "",
    `Tanggal : ${formatDateIndo(tanggalISO)}`,
    `Nama : ${nama}`,
    `Jam : ${formatJamRange(jamRange.jamMulai, jamRange.jamSelesai)}`,
    `Uraian : ${uraianPekerjaan}`,
    "",
    `Total Jam : ${hasil.totalJam} Jam`,
    `Uang Lembur : ${formatCurrency(hasil.uangLembur)}`,
    `Uang Makan : ${formatCurrency(hasil.uangMakan)}`,
    `Total Diterima : ${formatCurrency(hasil.totalDiterima)}`,
  ].join("\n");

  return {
    status: "ok",
    message,
  };
}

function buildRekapMessage(items, tanggalAwal, tanggalAkhir) {
  if (!items || items.length === 0) {
    return "Belum ada data lembur pada periode ini.";
  }

  const totalJam = items.reduce(
    (sum, item) => sum + Number(item.total_jam || 0),
    0,
  );
  const totalUangLembur = items.reduce(
    (sum, item) => sum + Number(item.uang_lembur || 0),
    0,
  );
  const totalUangMakan = items.reduce(
    (sum, item) => sum + Number(item.uang_makan || 0),
    0,
  );
  const totalDiterima = items.reduce(
    (sum, item) => sum + Number(item.total_diterima || 0),
    0,
  );

  const blocks = items.map((item) => {
    return [
      "",
      "================",
      "",
      `Tanggal : ${formatDateIndo(item.tanggal)}`,
      "",
      "Uraian pekerjaan:",
      item.uraian_pekerjaan || "-",
      "",
      "Jam Lembur:",
      formatJamRange(item.jam_mulai, item.jam_selesai),
      "",
      "Hasil:",
      `${Number(item.total_jam || 0)} Jam × ${formatCurrency(item.tarif_per_jam || 0)}`,
      `= ${formatCurrency(item.uang_lembur || 0)}`,
      "",
      "Uang makan:",
      formatCurrency(item.uang_makan || 0),
      "",
      "Total:",
      formatCurrency(item.total_diterima || 0),
      "",
      "================",
      "",
    ].join("\n");
  });

  return [
    "REKAP LEMBUR",
    "",
    "Periode:",
    `${formatDateIndo(tanggalAwal)} - ${formatDateIndo(tanggalAkhir)}`,
    "",
    "Nama:",
    items[0]?.nama || "-",
    "",
    ...blocks,
    "TOTAL JAM:",
    `${totalJam} Jam`,
    "",
    "TOTAL UANG LEMBUR:",
    formatCurrency(totalUangLembur),
    "",
    "TOTAL UANG MAKAN:",
    formatCurrency(totalUangMakan),
    "",
    "TOTAL DITERIMA:",
    formatCurrency(totalDiterima),
  ].join("\n");
}

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
        message: formatCommandError(),
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
          return {
            status: result.status,
            message: result.message,
          };
        }

        const data = result.data || [];
        const message = buildRekapMessage(data, tanggalAwal, tanggalAkhir);

        return {
          status: "ok",
          message,
        };
      } catch (error) {
        return {
          status: "error",
          message: error.message,
        };
      }
    }
  }

  const { jamLembur = 0, tarif = 0 } = payload || {};
  const total = calculateOvertime(jamLembur, tarif);

  return {
    status: "ok",
    message: `Rekap lembur: ${formatDuration(jamLembur)} dengan total ${total}`,
  };
}

module.exports = {
  handleLemburCommand,
};
