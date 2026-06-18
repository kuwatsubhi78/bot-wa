require("dotenv").config();

const { initSupabase } = require("./src/config/supabase");
const { connectWhatsApp } = require("./src/whatsapp/connection");
const { registerCommands } = require("./src/commands");
const { initScheduler } = require("./src/scheduler/reminder");
const { startQrServer } = require("./src/server/qrServer");

// ====================================================================
// Coba connect dengan retry loop agar bot tidak mati permanen
// ====================================================================
async function connectWithRetry(maxRetries = 10) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `[Main] Mencoba connect WhatsApp (percobaan ${attempt}/${maxRetries})...`,
      );
      const sock = await connectWhatsApp();
      return sock;
    } catch (err) {
      const isFatal =
        err.message.includes("logout") ||
        err.message.includes("digantikan device lain");

      if (isFatal) {
        console.error("[Main] Error fatal, bot berhenti:", err.message);
        process.exit(1);
      }

      if (attempt < maxRetries) {
        const delay = Math.min(5000 * attempt, 30000); // backoff maks 30 detik
        console.log(
          `[Main] Gagal connect (${err.message}), coba lagi dalam ${delay / 1000}s...`,
        );
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw new Error(`Gagal connect setelah ${maxRetries} percobaan.`);
      }
    }
  }
}

async function main() {
  console.log("=== BOT LEMBUR BERJALAN ===");

  initSupabase();
  startQrServer(process.env.PORT || 3000);

  const sock = await connectWithRetry();

  registerCommands(sock);
  initScheduler();

  // Heartbeat log setiap 30 menit
  setInterval(
    () => {
      console.log("[Main] Bot masih hidup ✓");
    },
    1000 * 60 * 30,
  );
}

main().catch((error) => {
  console.error("[Main] Gagal menjalankan bot:", error.message);
  process.exit(1);
});
