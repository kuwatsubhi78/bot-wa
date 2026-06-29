const { normalizeText } = require("../utils/formatter");
const { isAdminSender, isAdminActive } = require("./utils/senderHelper");
const {
  JADWAL_MINGGUAN,
  PERINTAH_SIF_TIDAK_TENTU,
  parseSifTidakTentuCommand,
  processSifTidakTentu,
  processSifMingguan,
} = require("./handlers/lemburHandler");
const {
  parseRekapCommand,
  processRekap,
  parseHapusCommand,
  processHapus,
  parseEditCommand,
  processEdit,
  processDataku,
} = require("./handlers/rekapHandler");
const {
  setSock: setAdminSock,
  processAdminOn,
  processAdminOff,
  processDaftar,
  processSetujui,
  parseDaftarKaryawan,
  processDaftarKaryawan,
  processKode,
  processExport,
} = require("./handlers/adminHandler");

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
    "!l3 jam-jam uraian [libur]   — lembur tidak tentu, Sif 3 (tanggal kemarin)",
    "!m1 uraian                   — lembur mingguan tetap (Sif 1)",
    "!m2 uraian                   — lembur mingguan tetap (Sif 2)",
    "!m3 uraian                   — lembur mingguan tetap (Sif 3, tanggal kemarin)",
    "",
    "*Lihat Data*",
    "!lembur                      — rekap lembur periode 18-17",
    "!lembur [bulan] [tahun]      — rekap lembur periode 18-17 dalam periode tertentu",
    "!dataku                      — lihat rekap dengan ID (untuk hapus/edit)",
    "!kode                        — daftar uraian pekerjaan",
    "",
    "*Kelola Data*",
    "!hapus [id]                  — hapus data lembur milikmu",
    "!edit [id], jam, uraian      — edit data lembur milikmu",
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
      "!hapus [id]                  — hapus data lembur siapapun",
      "!edit [id], jam, uraian      — edit data lembur siapapun",
      "!export [bulan] [tahun]      — export CSV rekap semua karyawan",
    );
  }

  return lines.join("\n");
}

function buildUnknownCommandMessage() {
  return "Perintah tidak dikenali.\nKetik *!bantuan* untuk melihat daftar perintah yang tersedia.";
}

function setSock(sock) {
  setAdminSock(sock);
}

async function handleLemburCommand(payload) {
  const textPayload =
    typeof payload === "string"
      ? payload
      : payload?.text || payload?.message || payload?.command;

  if (!textPayload) return { status: "ok", message: "" };

  const text = normalizeText(textPayload);
  const lower = text.toLowerCase();

  // ---- !adminon ----
  if (lower.startsWith("!adminon")) {
    const result = await processAdminOn(text, payload);
    if (result) return result;
    return { status: "ok", message: buildUnknownCommandMessage() };
  }

  // ---- !adminoff ----
  if (lower === "!adminoff") {
    const result = await processAdminOff(payload);
    if (result) return result;
    return { status: "ok", message: buildUnknownCommandMessage() };
  }

  // ---- Menu ----
  if (lower === "!bantuan" || ALIAS_MENU.includes(lower)) {
    return {
      status: "ok",
      message: buildMenuMessage(isAdminSender(payload), payload),
    };
  }

  // ---- !daftar ----
  if (lower.startsWith("!daftar") && !lower.startsWith("!daftarkaryawan")) {
    return await processDaftar(payload);
  }

  // ---- !setujui ----
  if (lower.startsWith("!setujui")) {
    if (!isAdminActive(payload))
      return {
        status: "error",
        message: "Aktifkan mode admin dulu dengan *!adminon [kode]*",
      };
    return await processSetujui(payload);
  }

  // ---- !daftarkaryawan ----
  const parsedDaftarKaryawan = parseDaftarKaryawan(text);
  if (parsedDaftarKaryawan) {
    if (!isAdminActive(payload))
      return {
        status: "error",
        message: "Aktifkan mode admin dulu dengan *!adminon [kode]*",
      };
    return await processDaftarKaryawan(parsedDaftarKaryawan);
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
    if (parsedSif) return await processSifTidakTentu(parsedSif, payload);
    return {
      status: "error",
      message:
        "Format salah.\nContoh:\n!l1 12:00-15:30 slitting\nAtau dengan flag libur:\n!l1 12:00-15:30 slitting libur",
    };
  }

  // ---- !m1 / !m2 / !m3 ----
  const commandKey = lower.split(/\s+/)[0];
  if (Object.prototype.hasOwnProperty.call(JADWAL_MINGGUAN, commandKey)) {
    return await processSifMingguan(commandKey, payload);
  }

  // ---- !lembur ----
  const parsedRekap = parseRekapCommand(text);
  if (parsedRekap !== null) return await processRekap(parsedRekap, payload);
  if (lower.startsWith("!lembur")) {
    return {
      status: "error",
      message: "Format salah.\nContoh:\n!lembur\n!lembur 6 2026",
    };
  }

  // ---- !dataku ----
  if (lower === "!dataku") {
    return await processDataku(payload);
  }

  // ---- !kode ----
  if (lower === "!kode") {
    return await processKode();
  }

  // ---- !hapus ----
  const parsedHapus = parseHapusCommand(text);
  if (parsedHapus) return await processHapus(parsedHapus, payload);
  if (lower.startsWith("!hapus")) {
    return { status: "error", message: "Format salah.\nContoh:\n!hapus 42" };
  }

  // ---- !edit ----
  const parsedEdit = parseEditCommand(text);
  if (parsedEdit) return await processEdit(parsedEdit, payload);
  if (lower.startsWith("!edit")) {
    return {
      status: "error",
      message:
        "Format salah.\nContoh:\n!edit 42, 08:00-10:00, uraian pekerjaan baru",
    };
  }

  // ---- !export ----
  if (lower.startsWith("!export")) {
    if (!isAdminActive(payload))
      return {
        status: "error",
        message: "Aktifkan mode admin dulu dengan *!adminon [kode]*",
      };
    return await processExport(lower, payload);
  }

  // ---- Tidak dikenali ----
  return { status: "ok", message: buildUnknownCommandMessage() };
}

module.exports = { handleLemburCommand, setSock };
