const { handleLemburCommand, setSock } = require("./lemburCommand");
const { sendTextMessage } = require("../whatsapp/sender");

function extractMessageText(message) {
  if (!message) return "";
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    ""
  );
}

// ====================================================================
// Rate limiting per pengirim — cegah spam command beruntun
// Maksimal 5 command per 10 detik. Setelah itu, kirim warning sekali,
// lalu diam selama 15 detik sebelum mau warning lagi.
// ====================================================================
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_COOLDOWN_MS = 15_000;

const senderHistory = new Map();
const lastWarned = new Map();

function isRateLimited(remoteJid) {
  const now = Date.now();
  const history = (senderHistory.get(remoteJid) || []).filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW_MS,
  );
  history.push(now);
  senderHistory.set(remoteJid, history);

  if (history.length <= RATE_LIMIT_MAX) return false;

  const lastWarn = lastWarned.get(remoteJid) || 0;
  if (now - lastWarn > RATE_LIMIT_COOLDOWN_MS) {
    lastWarned.set(remoteJid, now);
    return "warn";
  }

  return true;
}

function registerCommands(sock) {
  if (!sock || !sock.ev) {
    console.log("Commands belum bisa didaftarkan, sock tidak tersedia.");
    return;
  }

  setSock(sock);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages || []) {
      try {
        if (!msg.message || msg.key?.fromMe) continue;

        const remoteJid = msg.key?.remoteJid;
        const text = extractMessageText(msg.message).trim();
        // Bot hanya merespons pesan yang diawali "!"
        // Berlaku sama di chat pribadi maupun grup WA
        if (!remoteJid || !text || !text.startsWith("!")) continue;

        const limited = isRateLimited(remoteJid);
        if (limited === true) continue;
        if (limited === "warn") {
          await sendTextMessage(
            sock,
            remoteJid,
            "⚠️ Terlalu banyak perintah dalam waktu singkat. Tunggu beberapa detik sebelum mencoba lagi.",
          );
          continue;
        }

        const result = await handleLemburCommand({ text, sender: remoteJid });
        if (result?.message) {
          await sendTextMessage(sock, remoteJid, result.message);
        }
      } catch (error) {
        console.error("Gagal memproses pesan:", error);
      }
    }
  });

  console.log("Commands registered.");
}

module.exports = { registerCommands };
