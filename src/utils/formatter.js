function formatDuration(value) {
  const hours = Number(value) || 0;
  return `${hours} jam`;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function formatCurrency(value) {
  const numericValue = Number(value || 0);
  return `Rp${numericValue.toLocaleString("id-ID")}`;
}

function formatDateIndo(value) {
  if (!value) {
    return "";
  }

  const rawValue = String(value);
  const dateOnlyMatch = rawValue.match(/^\d{4}-\d{2}-\d{2}$/);

  let date;

  if (dateOnlyMatch) {
    const [year, month, day] = rawValue.split("-").map(Number);
    date = new Date(year, month - 1, day);
  } else {
    date = new Date(rawValue);
  }

  if (Number.isNaN(date.getTime())) {
    return rawValue;
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatJamRange(jamMulai, jamSelesai) {
  return `${String(jamMulai || "").trim()} - ${String(jamSelesai || "").trim()}`;
}

function formatReminderMessage(items, tanggalAwal, tanggalAkhir) {
  if (!items || items.length === 0) {
    return "Belum ada data lembur pada periode ini.";
  }

  const firstItem = items[0] || {};
  const totalJam = items.reduce(
    (sum, item) => sum + Number(item.total_jam || 0),
    0,
  );
  const totalLembur = items.reduce(
    (sum, item) => sum + Number(item.uang_lembur || 0),
    0,
  );
  const totalMakan = items.reduce(
    (sum, item) => sum + Number(item.uang_makan || 0),
    0,
  );
  const totalDiterima = items.reduce(
    (sum, item) => sum + Number(item.total_diterima || 0),
    0,
  );

  const detailLines = items.map((item) => {
    return [
      formatDateIndo(item.tanggal),
      item.uraian_pekerjaan || "-",
      `${String(item.jam_mulai || "").trim()}-${String(item.jam_selesai || "").trim()}`,
      `${Number(item.total_jam || 0)} Jam`,
      formatCurrency(item.uang_lembur || 0),
    ].join("\n");
  });

  return [
    "🔔 REMINDER LEMBUR",
    "",
    "Rekap lembur:",
    "Periode:",
    `${formatDateIndo(tanggalAwal)} - ${formatDateIndo(tanggalAkhir)}`,
    "",
    "Nama:",
    firstItem.nama || "-",
    "",
    "Detail:",
    "",
    ...detailLines,
    "",
    "================",
    "",
    "TOTAL JAM:",
    `${totalJam} Jam`,
    "",
    "TOTAL LEMBUR:",
    formatCurrency(totalLembur),
    "",
    "UANG MAKAN:",
    formatCurrency(totalMakan),
    "",
    "TOTAL DITERIMA:",
    formatCurrency(totalDiterima),
    "",
    "Silakan dicek kembali.",
  ].join("\n");
}

function formatCommandError() {
  return [
    "FORMAT SALAH",
    "",
    "Gunakan:",
    "!tambah tanggal, nama, jam_mulai-jam_selesai, uraian",
    "",
    "Contoh:",
    "!tambah 31-05-2026, Kuwat Subhi, 20:00-22:00, Helper",
  ].join("\n");
}

module.exports = {
  formatDuration,
  normalizeText,
  formatCurrency,
  formatDateIndo,
  formatJamRange,
  formatReminderMessage,
  formatCommandError,
};
