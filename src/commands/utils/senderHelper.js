const ADMIN_SESSION_MS = 30 * 60 * 1000;
const adminSessions = new Map();

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

module.exports = {
  getSenderJid,
  getSenderNumber,
  isAdminSender,
  isAdminActive,
  aktivasiAdmin,
  nonaktifkanAdmin,
};
