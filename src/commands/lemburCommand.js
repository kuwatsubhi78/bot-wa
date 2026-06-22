const {
  hitungLembur,
  calculateOvertime,
  TARIF_PER_JAM,
} = require("../utils/calculator");
const {
  formatCurrency,
  normalizeText,
  formatDateIndo,
} = require("../utils/formatter");
const {
  ambilLemburPeriode,
  getPeriodRange,
  getPeriodForDate,
  tambahLembur,
  cariKaryawan,
  daftarkanKaryawan,
  ambilSemuaKodePekerjaan,
  ambilLemburById,
  hapusLemburById,
  updateLemburById,
  tambahPendaftaran,
  ambilPendaftaranById,
  updateStatusPendaftaran,
} = require("../services/lemburService");
const { sendTextMessage } = require("../whatsapp/sender");

// ====================================================================
// Konstanta
// ====================================================================
const JADWAL_MINGGUAN = {
  "!m1": { jamMulai: "12:00", jamSelesai: "14:00" },
  "!m2": { jamMulai: "20:00", jamSelesai: "22:00" },
  "!m3": { jamMulai: "04:00", jamSelesai: "06:00" },
};

const PERINTAH_SIF_TIDAK_TENTU = ["!l1", "!l2", "!l3"];

const ALIAS_MENU = [
  "!halo",
  "!hai",
  "!hi",
  "!hey",
  "!menu",
  "!start",
  "!help",
  "!info",
  "!p",
];

// ====================================================================
// Session admin
// ====================================================================
const ADMIN_SESSION_MS = 30 * 60 * 1000;
const adminSessions = new Map();

function isAdminActive(payload) {
  const nomor = getSenderNumber(payload);
  if (!adminSessions.has(nomor)) return false;

  const since = adminSessions.get(nomor);
  if (Date.now() - since > ADMIN_SESSION_MS) {
    adminSessions.delete(nomor);
    return false;
  }

  return true;
}

function aktivasiAdmin(payload) {
  adminSessions.set(getSenderNumber(payload), Date.now());
}

function nonaktifkanAdmin(payload) {
  adminSessions.delete(getSenderNumber(payload));
}

// ====================================================================
// Helpers nomor
// ====================================================================
function getSenderJid(payload) {
  const raw =
    payload?.sender ||
    payload?.from ||
    payload?.key?.remoteJid ||
    payload?.user?.id ||
    "";
  return String(raw).trim();
}

function getSenderNumber(payload) {
  const raw =
    getSenderJid(payload) || payload?.nomor_wa || payload?.nomorWa || "";
  return String(raw).replace(/@.*$/, "").replace(/:.*$/, "").trim();
}

function isAdminSender(payload) {
  const adminNumbers = String(process.env.ADMIN_NUMBERS || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  return adminNumbers.includes(getSenderNumber(payload));
}

// ====================================================================
// Helpers tanggal
// ====================================================================
function nowWIB() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

function todayISO() {
  const wib = nowWIB();
  return `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, "0")}-${String(wib.getUTCDate()).padStart(2, "0")}`;
}

function yesterdayISO() {
  const wib = nowWIB();
  wib.setUTCDate(wib.getUTCDate() - 1);
  return `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, "0")}-${String(wib.getUTCDate()).padStart(2, "0")}`;
}

// ====================================================================
// Helpers jam
// ====================================================================
function splitJamRange(jamLembur) {
  const parts = String(jamLembur || "")
    .split("-")
    .map((p) => p.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const jamRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!jamRegex.test(parts[0]) || !jamRegex.test(parts[1])) return null;

  return { jamMulai: parts[0], jamSelesai: parts[1] };
}

function formatJamTitik(jam) {
  return String(jam || "").replace(":", ".");
}

// ====================================================================
// Menu
// ====================================================================
function buildMenuMessage(isAdmin, payload = null) {
  const lines = [
    "📋 *BOT REKAP LEMBUR*",
    "",
    "*Pendaftaran*",
    "!daftar Nama, Divisi         — daftar sebagai karyawan",
    "",
    "*Catat Lembur*",
    "!l1 jam-jam uraian [libur]   — lembur tidak tentu, Sif 1",
    "!l2 jam-jam uraian [libur]   — lembur tidak tentu, Sif 2",
    "!l3 jam-jam uraian [libur]   — lembur tidak tentu, Sif 3",
    "!m1 uraian                   — lembur mingguan tetap (Sif 1)",
    "!m2 uraian                   — lembur mingguan tetap (Sif 2)",
    "!m3 uraian                   — lembur mingguan tetap (Sif 3)",
    "",
    "*Lihat Data*",
    "!lembur [bulan] [tahun]      — rekap lembur periode 18-17",
    "",
    "!bantuan                     — tampilkan menu ini",
  ];

  if (isAdmin) {
    const sessionAktif = payload ? isAdminActive(payload) : false;
    lines.push(
      "",
      "*Khusus Admin*",
      sessionAktif ? "🔓 Mode admin AKTIF" : "🔒 Mode admin tidak aktif",
      "!adminon [kode]              — aktifkan mode admin",
      "!adminoff                    — nonaktifkan mode admin",
      "!daftarkaryawan nomor, nama, divisi",
      "!setujui [id]",
      "!kode",
      "!hapus [id]",
      "!edit [id], jam, uraian",
    );
  }

  return lines.join("\n");
}

function buildUnknownCommandMessage() {
  return "Perintah tidak dikenali.\nKetik *!bantuan* untuk melihat daftar perintah yang tersedia.";
}

// ====================================================================
// Sock global untuk notif
// ====================================================================
let sockGlobal = null;
function setSock(sock) {
  sockGlobal = sock;
}

async function kirimKeAdmin(message) {
  if (!sockGlobal) {
    return;
  }

  const adminNumbers = String(process.env.ADMIN_NUMBERS || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

  for (const nomor of adminNumbers) {
    try {
      await sendTextMessage(sockGlobal, `${nomor}@lid`, message);
    } catch (e1) {
      try {
        await sendTextMessage(sockGlobal, `${nomor}@s.whatsapp.net`, message);
      } catch (e2) {
        // console.log("[kirimKeAdmin] gagal @s.whatsapp.net:", e2.message);
      }
    }
  }
}

async function kirimKeKaryawan(jidAtauNomor, message) {
  if (!sockGlobal) return;

  // kalau sudah ada @, pakai langsung. kalau nomor polos, coba dua format
  if (jidAtauNomor.includes("@")) {
    try {
      await sendTextMessage(sockGlobal, jidAtauNomor, message);
      // console.log("[kirimKeKaryawan] berhasil kirim ke", jidAtauNomor);
    } catch (e) {
      // console.log("[kirimKeKaryawan] gagal:", e.message);
    }
    return;
  }

  // nomor polos — coba @lid dulu
  try {
    await sendTextMessage(sockGlobal, `${jidAtauNomor}@lid`, message);
  } catch {
    try {
      await sendTextMessage(
        sockGlobal,
        `${jidAtauNomor}@s.whatsapp.net`,
        message,
      );
    } catch (e) {
      // console.log("[kirimKeKaryawan] gagal semua format:", e.message);
    }
  }
}

// ====================================================================
// Validasi karyawan terdaftar
// ====================================================================
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

async function processDaftarCommand(payload) {
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
    if (result.status !== "ok") {
      return {
        status: "error",
        message: `Gagal mendaftarkan: ${result.message}`,
      };
    }
    return {
      status: "ok",
      message: `✅ Anda berhasil terdaftar.\nNama   : ${nama}\nDivisi : ${divisi}`,
    };
  }

  // console.log("[daftar] bukan admin, simpan ke pendaftaran...");
  const result = await tambahPendaftaran(nomorWa, jidAsli, nama, divisi);
  // console.log(
  //   "[daftar] hasil tambahPendaftaran:",
  //   result.status,
  //   result.message || "",
  // );

  if (result.status !== "ok") {
    return {
      status: "error",
      message: `Gagal mengirim permintaan: ${result.message}`,
    };
  }

  // console.log("[daftar] kirim notif ke admin...");
  await kirimKeAdmin(
    `📋 *PERMINTAAN PENDAFTARAN*\n\nID Request : ${result.data.id}\nNomor      : ${nomorWa}\nNama       : ${nama}\nDivisi     : ${divisi}\n\nKetik *!setujui ${result.data.id}* untuk menyetujui.`,
  );

  return {
    status: "ok",
    message:
      "⏳ Permintaan pendaftaran terkirim. Mohon tunggu konfirmasi dari admin.",
  };
}

// ====================================================================
// !setujui
// ====================================================================
async function processSetujuiCommand(payload) {
  const text = normalizeText(payload?.text || "");

  const match = text.match(/^!setujui\s+(\d+)$/i);
  if (!match) {
    return { status: "error", message: "Format salah.\nContoh:\n!setujui 5" };
  }

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

// ====================================================================
// !daftarkaryawan
// ====================================================================
function parseDaftarKaryawanCommand(input) {
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

async function processDaftarKaryawanCommand(parsed, payload) {
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

// ====================================================================
// !l1 / !l2 / !l3
// ====================================================================
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

async function processSifTidakTentuCommand(parsed, payload) {
  const validasi = await requireKaryawan(payload);
  if (!validasi.ok) return { status: "error", message: validasi.message };

  const tanggal = parsed.command === "!l3" ? yesterdayISO() : todayISO();
  return await simpanLemburDanBalas({
    nama: validasi.karyawan.nama,
    divisi: validasi.karyawan.divisi,
    payload,
    tanggalISO: todayISO(),
    jamMulai: parsed.jamRange.jamMulai,
    jamSelesai: parsed.jamRange.jamSelesai,
    uraianPekerjaan: parsed.uraianPekerjaan,
    isLibur: parsed.isLibur,
  });
}

// ====================================================================
// !m1 / !m2 / !m3
// ====================================================================
function parseSifMingguanCommand(commandKey, input) {
  const text = normalizeText(input);
  const uraian = text.replace(new RegExp(`^${commandKey}\\s*`, "i"), "").trim();
  if (!uraian) return null;
  return { uraian };
}

async function processSifMingguanCommand(commandKey, payload) {
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
    tanggalISO: todayISO(),
    jamMulai: jadwal.jamMulai,
    jamSelesai: jadwal.jamSelesai,
    uraianPekerjaan: parsed.uraian,
    isLibur: false,
  });
}

// ====================================================================
// Simpan lembur + balas
// ====================================================================
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

  if (isLibur) lines.push(`Catatan          : Lembur hari libur`);

  lines.push(
    "",
    `Hasil : ${hasil.totalJam} jam × Rp. ${formatCurrency(TARIF_PER_JAM).replace("Rp", "").trim()} = *Rp. ${formatCurrency(hasil.uangLembur).replace("Rp", "").trim()}*`,
  );

  if (hasil.uangMakan > 0)
    lines.push(`Uang Makan : 1 × ${formatCurrency(hasil.uangMakan)}`);

  return { status: "ok", message: lines.join("\n") };
}

// ====================================================================
// !lembur
// ====================================================================
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

async function processRekapCommand(parsedRekap, payload) {
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

// ====================================================================
// !kode
// ====================================================================
async function processKodeCommand() {
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

// ====================================================================
// !hapus
// ====================================================================
function parseHapusCommand(input) {
  const match = normalizeText(input).match(/^!hapus\s+(\d+)\s*$/i);
  if (!match) return null;
  return { id: Number(match[1]) };
}

async function processHapusCommand(parsed, payload) {
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

// ====================================================================
// !edit
// ====================================================================
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

async function processEditCommand(parsed, payload) {
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

// ====================================================================
// Handler utama
// ====================================================================
async function handleLemburCommand(payload) {
  const textPayload =
    typeof payload === "string"
      ? payload
      : payload?.text || payload?.message || payload?.command;

  if (!textPayload) {
    const { jamLembur = 0, tarif = 0 } = payload || {};
    const total = calculateOvertime(jamLembur, tarif);
    return {
      status: "ok",
      message: `Rekap lembur: ${jamLembur} jam dengan total ${total}`,
    };
  }

  const text = normalizeText(textPayload);
  const lower = text.toLowerCase();

  // ---- !adminon ----
  if (lower.startsWith("!adminon")) {
    if (!isAdminSender(payload)) {
      return { status: "ok", message: buildUnknownCommandMessage() };
    }
    const secret = text.replace(/^!adminon\s*/i, "").trim();
    const validSecret = String(process.env.ADMIN_SECRET || "").trim();
    if (!validSecret) {
      return {
        status: "error",
        message: "ADMIN_SECRET belum dikonfigurasi di server.",
      };
    }
    if (secret !== validSecret) {
      return { status: "error", message: "Kode rahasia salah." };
    }
    aktivasiAdmin(payload);
    return {
      status: "ok",
      message:
        "🔓 Mode admin aktif. Berlaku 30 menit.\n\nCommand admin tersedia:\n!kode\n!hapus [id]\n!edit [id], jam, uraian\n!daftarkaryawan\n!setujui [id]",
    };
  }

  // ---- !adminoff ----
  if (lower === "!adminoff") {
    if (!isAdminSender(payload)) {
      return { status: "ok", message: buildUnknownCommandMessage() };
    }
    nonaktifkanAdmin(payload);
    return { status: "ok", message: "🔒 Mode admin dinonaktifkan." };
  }

  // ---- Menu / bantuan ----
  if (lower === "!bantuan" || ALIAS_MENU.includes(lower)) {
    return {
      status: "ok",
      message: buildMenuMessage(isAdminSender(payload), payload),
    };
  }

  // ---- !daftar ----
  if (lower.startsWith("!daftar") && !lower.startsWith("!daftarkaryawan")) {
    return await processDaftarCommand(payload);
  }

  // ---- !setujui ----
  if (lower.startsWith("!setujui")) {
    if (!isAdminActive(payload)) {
      return {
        status: "error",
        message: "Aktifkan mode admin dulu dengan *!adminon [kode]*",
      };
    }
    return await processSetujuiCommand(payload);
  }

  // ---- !daftarkaryawan ----
  const parsedDaftarKaryawan = parseDaftarKaryawanCommand(text);
  if (parsedDaftarKaryawan) {
    if (!isAdminActive(payload)) {
      return {
        status: "error",
        message: "Aktifkan mode admin dulu dengan *!adminon [kode]*",
      };
    }
    return await processDaftarKaryawanCommand(parsedDaftarKaryawan, payload);
  }
  if (lower.startsWith("!daftarkaryawan")) {
    return {
      status: "error",
      message:
        "Format salah.\nContoh:\n!daftarkaryawan 6281234567890, Nama Karyawan, Divisi",
    };
  }

  // ---- !l1 / !l2 / !l3 ----
  if (PERINTAH_SIF_TIDAK_TENTU.some((cmd) => lower.startsWith(cmd))) {
    const parsedSif = parseSifTidakTentuCommand(text);
    if (parsedSif) return await processSifTidakTentuCommand(parsedSif, payload);
    return {
      status: "error",
      message:
        "Format salah.\nContoh:\n!l1 12:00-15:30 slitting\nAtau dengan flag libur:\n!l1 12:00-15:30 slitting libur",
    };
  }

  // ---- !m1 / !m2 / !m3 ----
  const commandKey = lower.split(/\s+/)[0];
  if (Object.prototype.hasOwnProperty.call(JADWAL_MINGGUAN, commandKey)) {
    return await processSifMingguanCommand(commandKey, payload);
  }

  // ---- !lembur ----
  const parsedRekap = parseRekapCommand(text);
  if (parsedRekap !== null)
    return await processRekapCommand(parsedRekap, payload);
  if (lower.startsWith("!lembur")) {
    return {
      status: "error",
      message: "Format salah.\nContoh:\n!lembur\n!lembur 6 2026",
    };
  }

  // ---- !kode ----
  if (lower === "!kode") {
    if (!isAdminActive(payload)) {
      return {
        status: "error",
        message: "Aktifkan mode admin dulu dengan *!adminon [kode]*",
      };
    }
    return await processKodeCommand();
  }

  // ---- !hapus ----
  const parsedHapus = parseHapusCommand(text);
  if (parsedHapus) return await processHapusCommand(parsedHapus, payload);
  if (lower.startsWith("!hapus")) {
    return { status: "error", message: "Format salah.\nContoh:\n!hapus 42" };
  }

  // ---- !edit ----
  const parsedEdit = parseEditCommand(text);
  if (parsedEdit) return await processEditCommand(parsedEdit, payload);
  if (lower.startsWith("!edit")) {
    return {
      status: "error",
      message:
        "Format salah.\nContoh:\n!edit 42, 08:00-10:00, uraian pekerjaan baru",
    };
  }

  // ---- Tidak dikenali ----
  return { status: "ok", message: buildUnknownCommandMessage() };
}

module.exports = { handleLemburCommand, setSock };
