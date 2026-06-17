const { handleLemburCommand } = require("./lemburCommand");
const { sendTextMessage } = require("../whatsapp/sender");

function extractMessageText(message) {
  if (!message) {
    return "";
  }

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    ""
  );
}

function registerCommands(sock) {
  if (!sock || !sock.ev) {
    console.log("Commands belum bisa didaftarkan, sock tidak tersedia.");
    return;
  }

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages || []) {
      try {
        if (!msg.message || msg.key?.fromMe) {
          continue;
        }

        const remoteJid = msg.key?.remoteJid;
        const text = extractMessageText(msg.message).trim();

        if (!remoteJid || !text || !text.startsWith("!")) {
          continue;
        }

        const result = await handleLemburCommand({
          text,
          sender: remoteJid,
        });

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

module.exports = {
  registerCommands,
};
