const {
  formatCurrency,
  normalizeText,
  formatDateIndo,
} = require("../../utils/formatter");
const {
  cariKaryawan,
  daftarkanKaryawan,
  ambilSemuaKodePekerjaan,
  ambilLemburPeriodeSemua,
  getPeriodRange,
  getPeriodForDate,
  tambahPendaftaran,
  ambilPendaftaranById,
  updateStatusPendaftaran,
} = require("../../services/lemburService");
const {
  sendTextMessage,
  sendDocumentMessage,
} = require("../../whatsapp/sender");
const {
  getSenderJid,
  getSenderNumber,
  isAdminSender,
  isAdminActive,
  aktivasiAdmin,
  nonaktifkanAdmin,
} = require("../utils/senderHelper");
const { nowWIB } = require("../utils/dateHelper");

let sockGlobal = null;
function setSock(sock) {
  sockGlobal = sock;
}

async function kirimKeAdmin(message) {
  if (!sockGlobal) return;

  const adminNumbers = String(process.env.ADMIN_NUMBERS || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

  for (const nomor of adminNumbers) {
    try {
      await sendTextMessage(sockGlobal, `${nomor}@lid`, message);
    } catch {
      try {
        await sendTextMessage(sockGlobal, `${nomor}@s.whatsapp.net`, message);
      } catch {
        // gagal kirim ke admin
      }
    }
  }
}

async function kirimKeKaryawan(jidAtauNomor, message) {
  if (!sockGlobal) return;

  if (jidAtauNomor.includes("@")) {
    try {
      await sendTextMessage(sockGlobal, jidAtauNomor, message);
    } catch {
      // gagal kirim
    }
    return;
  }

  try {
    await sendTextMessage(sockGlobal, `${jidAtauNomor}@lid`, message);
  } catch {
    try {
      await sendTextMessage(
        sockGlobal,
        `${jidAtauNomor}@s.whatsapp.net`,
        message,
      );
    } catch {
      // gagal semua format
    }
  }
}

function buildCSV(items) {
  const header = [
    "ID",
    "Tanggal",
    "Nama",
    "Divisi",
    "Nomor WA",
    "Jam Mulai",
    "Jam Selesai",
    "Total Jam",
    "Uraian Pekerjaan",
    "Uang Lembur",
    "Uang Makan",
    "Total Diterima",
    "Hari Libur",
  ].join(",");

  const rows = items.map((item) => {
    const cols = [
      item.id,
      item.tanggal,
      `"${(item.nama || "").replace(/"/g, '""')}"`,
      `"${(item.divisi || "").replace(/"/g, '""')}"`,
      item.nomor_wa,
      item.jam_mulai || "",
      item.jam_selesai || "",
      item.total_jam || 0,
      `"${(item.uraian_pekerjaan || "").replace(/"/g, '""')}"`,
      item.uang_lembur || 0,
      item.uang_makan || 0,
      item.total_diterima || 0,
      item.is_libur ? "Ya" : "Tidak",
    ];
    return cols.join(",");
  });

  return [header, ...rows].join("\n");
}

async function processAdminOn(text, payload) {
  if (!isAdminSender(payload)) return null; // bukan admin, lewati

  const secret = text.replace(/^!adminon\s*/i, "").trim();
  const validSecret = String(process.env.ADMIN_SECRET || "").trim();

  if (!validSecret)
    return {
      status: "error",
      message: "ADMIN_SECRET belum dikonfigurasi di server.",
    };
  if (secret !== validSecret)
    return { status: "error", message: "Kode rahasia salah." };

  aktivasiAdmin(payload);
  return {
    status: "ok",
    message:
      "🔓 Mode admin aktif. Berlaku 30 menit.\n\nCommand admin tersedia:\n!kode\n!hapus [id]\n!edit [id], jam, uraian\n!daftarkaryawan\n!setujui [id]\n!export [bulan] [tahun]",
  };
}

async function processAdminOff(payload) {
  if (!isAdminSender(payload)) return null;
  nonaktifkanAdmin(payload);
  return { status: "ok", message: "🔒 Mode admin dinonaktifkan." };
}

async function processDaftar(payload) {
  const text = normalizeText(payload?.text || "");

  const cek = await cariKaryawan(getSenderNumber(payload));
  if (cek.status === "ok") {
    return {
      status: "ok",
      message:
        "Nomor Anda sudah terdaftar. Gunakan !bantuan untuk melihat command yang tersedia.",
    };
  }

  const args = text
    .replace(/^!daftar\s*/i, "")
    .split(",")
    .map((p) => p.trim());
  if (args.length < 2 || !args[0] || !args[1]) {
    return {
      status: "error",
      message: "Format salah.\nContoh:\n!daftar Nama Kamu, Divisi Kamu",
    };
  }

  const [nama, ...divisiParts] = args;
  const divisi = divisiParts.join(", ").trim();
  const nomorWa = getSenderNumber(payload);
  const jidAsli = getSenderJid(payload);

  if (isAdminSender(payload)) {
    const result = await daftarkanKaryawan(nomorWa, jidAsli, nama, divisi);
    if (result.status !== "ok")
      return {
        status: "error",
        message: `Gagal mendaftarkan: ${result.message}`,
      };
    return {
      status: "ok",
      message: `✅ Anda berhasil terdaftar.\nNama   : ${nama}\nDivisi : ${divisi}`,
    };
  }

  const result = await tambahPendaftaran(nomorWa, jidAsli, nama, divisi);
  if (result.status !== "ok")
    return {
      status: "error",
      message: `Gagal mengirim permintaan: ${result.message}`,
    };

  await kirimKeAdmin(
    `📋 *PERMINTAAN PENDAFTARAN*\n\nID Request : ${result.data.id}\nNomor      : ${nomorWa}\nNama       : ${nama}\nDivisi     : ${divisi}\n\nKetik *!setujui ${result.data.id}* untuk menyetujui.`,
  );

  return {
    status: "ok",
    message:
      "⏳ Permintaan pendaftaran terkirim. Mohon tunggu konfirmasi dari admin.",
  };
}

async function processSetujui(payload) {
  const text = normalizeText(payload?.text || "");
  const match = text.match(/^!setujui\s+(\d+)$/i);
  if (!match)
    return { status: "error", message: "Format salah.\nContoh:\n!setujui 5" };

  const id = Number(match[1]);
  const pendaftaran = await ambilPendaftaranById(id);

  if (pendaftaran.status === "not_found")
    return { status: "error", message: `Permintaan ID ${id} tidak ditemukan.` };
  if (pendaftaran.status !== "ok")
    return {
      status: "error",
      message: `Gagal mengambil data: ${pendaftaran.message}`,
    };
  if (pendaftaran.data.status === "disetujui")
    return {
      status: "error",
      message: `Permintaan ID ${id} sudah disetujui sebelumnya.`,
    };

  const { nomor_wa, jid, nama, divisi } = pendaftaran.data;

  const daftar = await daftarkanKaryawan(nomor_wa, jid, nama, divisi);
  if (daftar.status !== "ok")
    return {
      status: "error",
      message: `Gagal mendaftarkan: ${daftar.message}`,
    };

  await updateStatusPendaftaran(id, "disetujui");
  await kirimKeKaryawan(
    jid || nomor_wa,
    `✅ Pendaftaran kamu telah disetujui admin.\nSelamat datang, ${nama}!\n\nKetik *!bantuan* untuk melihat cara penggunaan bot.`,
  );

  return {
    status: "ok",
    message: `✅ Karyawan berhasil didaftarkan.\nNama   : ${nama}\nNomor  : ${nomor_wa}\nDivisi : ${divisi}`,
  };
}

function parseDaftarKaryawan(input) {
  const text = normalizeText(input);
  if (!/^!daftarkaryawan\b/i.test(text)) return null;

  const parts = text
    .replace(/^!daftarkaryawan\s*/i, "")
    .split(",")
    .map((p) => p.trim());
  if (parts.length < 3) return null;

  const [nomorWa, nama, ...divisiParts] = parts;
  const divisi = divisiParts.join(", ").trim();
  if (!nomorWa || !nama || !divisi) return null;

  return { nomorWa, nama, divisi };
}

async function processDaftarKaryawan(parsed) {
  const { nomorWa, nama, divisi } = parsed;
  const nomorPolos = String(nomorWa)
    .replace(/@.*$/, "")
    .replace(/:.*$/, "")
    .trim();

  if (!/^\d+$/.test(nomorPolos)) {
    return {
      status: "error",
      message:
        "Format nomor salah.\nContoh:\n!daftarkaryawan 6281234567890, Nama Karyawan, Divisi",
    };
  }

  const result = await daftarkanKaryawan(nomorPolos, "", nama, divisi);
  if (result.status !== "ok")
    return {
      status: "error",
      message: `Gagal mendaftarkan: ${result.message}`,
    };

  return {
    status: "ok",
    message: [
      "✅ Karyawan berhasil didaftarkan.",
      `Nomor  : ${nomorPolos}`,
      `Nama   : ${nama}`,
      `Divisi : ${divisi}`,
    ].join("\n"),
  };
}

async function processKode() {
  const result = await ambilSemuaKodePekerjaan();
  if (result.status !== "ok")
    return {
      status: "error",
      message: `Gagal mengambil data: ${result.message}`,
    };

  const data = result.data || [];
  if (data.length === 0)
    return {
      status: "ok",
      message: "Belum ada kode pekerjaan yang terdaftar.",
    };

  const lines = ["📋 *DAFTAR KODE PEKERJAAN*", ""];
  for (const item of data) lines.push(`${item.kode} — ${item.deskripsi}`);

  return { status: "ok", message: lines.join("\n") };
}

async function processExport(lower, payload) {
  const args = lower
    .replace(/^!export\s*/i, "")
    .split(/\s+/)
    .filter(Boolean);
  let bulan, tahun;

  if (args.length === 2) {
    bulan = Number(args[0]);
    tahun = Number(args[1]);
  } else {
    const now = nowWIB();
    const period = getPeriodForDate(now);
    bulan = period.periodeBulan;
    tahun = period.periodeTahun;
  }

  if (
    !Number.isFinite(bulan) ||
    !Number.isFinite(tahun) ||
    bulan < 1 ||
    bulan > 12
  ) {
    return {
      status: "error",
      message: "Format salah.\nContoh:\n!export\n!export 6 2026",
    };
  }

  const { tanggalAwal, tanggalAkhir } = getPeriodRange(bulan, tahun);
  const result = await ambilLemburPeriodeSemua(bulan, tahun);

  if (result.status !== "ok")
    return {
      status: "error",
      message: `Gagal mengambil data: ${result.message}`,
    };

  const items = result.data || [];
  if (items.length === 0)
    return { status: "ok", message: "Tidak ada data lembur pada periode ini." };

  const csvString = buildCSV(items);
  const buffer = Buffer.from("\uFEFF" + csvString, "utf-8");
  const fileName = `rekap-lembur-${formatDateIndo(tanggalAwal).replace(/\s/g, "")}-${formatDateIndo(tanggalAkhir).replace(/\s/g, "")}.csv`;

  if (!sockGlobal)
    return { status: "error", message: "Koneksi WA belum siap." };

  const senderJid = getSenderJid(payload);
  try {
    await sendDocumentMessage(sockGlobal, senderJid, buffer, fileName);
    return {
      status: "ok",
      message: `✅ File CSV terkirim.\nPeriode : ${formatDateIndo(tanggalAwal)} - ${formatDateIndo(tanggalAkhir)}\nJumlah data : ${items.length} baris`,
    };
  } catch (e) {
    return { status: "error", message: `Gagal kirim file: ${e.message}` };
  }
}

module.exports = {
  setSock,
  processAdminOn,
  processAdminOff,
  processDaftar,
  processSetujui,
  parseDaftarKaryawan,
  processDaftarKaryawan,
  processKode,
  processExport,
};
