require("dotenv").config();

const { initSupabase } = require("./src/config/supabase");
const { connectWhatsApp } = require("./src/whatsapp/connection");
const { registerCommands } = require("./src/commands");
const { initScheduler } = require("./src/scheduler/reminder");
const { startQrServer } = require("./src/server/qrServer");

// ====================================================================
// Retry loop tanpa batas — bot tidak boleh mati di Northflank
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
      const delay = Math.min(5000 * attempt, 30000);
      console.log(`[Main] Gagal connect: ${err.message}`);
      console.log(`[Main] Coba lagi dalam ${delay / 1000} detik...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// ====================================================================
// Loop utama — reconnect dan re-register commands setiap kali
// koneksi WA terputus dan tersambung kembali
// ====================================================================
async function startBot() {
  initSupabase();
  startQrServer(process.env.PORT || 3000);
  initScheduler();

  while (true) {
    try {
      console.log("[Main] Menghubungkan ke WhatsApp...");
      const sock = await connectWithRetry();

      // Register commands dengan sock yang baru — ini penting
      // supaya listener messages.upsert selalu pakai sock aktif
      registerCommands(sock);
      console.log("[Main] Bot siap menerima pesan.");

      // Tunggu sampai sock ini mati (disconnect)
      await new Promise((resolve) => {
        sock.ev.on("connection.update", ({ connection }) => {
          if (connection === "close") {
            console.log("[Main] Koneksi terputus, akan reconnect...");
            resolve();
          }
        });
      });
    } catch (err) {
      console.error("[Main] Error tak terduga:", err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

startBot().catch((error) => {
  console.error("[Main] Error fatal:", error.message);
});
