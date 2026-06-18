require("dotenv").config();

const { initSupabase } = require("./src/config/supabase");
const { connectWhatsApp } = require("./src/whatsapp/connection");
const { registerCommands } = require("./src/commands");
const { initScheduler } = require("./src/scheduler/reminder");
const { startQrServer } = require("./src/server/qrServer");

// ====================================================================
// Retry loop tanpa batas — bot tidak boleh mati di Northflank free
// ====================================================================
async function connectWithRetry() {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      console.log(`[Main] Mencoba connect WhatsApp (percobaan ${attempt})...`);
      const sock = await connectWhatsApp();
      return sock;
    } catch (err) {
      const delay = Math.min(5000 * attempt, 30000); // backoff maks 30 detik
      console.log(`[Main] Gagal connect: ${err.message}`);
      console.log(`[Main] Coba lagi dalam ${delay / 1000} detik...`);
      await new Promise((r) => setTimeout(r, delay));
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

  setInterval(
    () => {
      console.log("[Main] Bot masih hidup ✓");
    },
    1000 * 60 * 30,
  );
}

main().catch((error) => {
  console.error("[Main] Error tak terduga:", error.message);
  // Tidak process.exit — biarkan platform restart sendiri jika perlu
});
