const { calculateOvertime } = require("../utils/calculator");
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
      const { tanggal, nama, jamLembur, uraianPekerjaan } = parsedTambah;
      return {
        status: "ok",
        message: `Tanggal: ${tanggal}\nNama: ${nama}\nJam: ${jamLembur}\nUraian: ${uraianPekerjaan}`,
      };
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
