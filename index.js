require("dotenv").config();

const { initSupabase, supabase } = require("./src/config/supabase");
const { connectWhatsApp } = require("./src/whatsapp/connection");
const { registerCommands } = require("./src/commands");
const { initScheduler } = require("./src/scheduler/reminder");
const { startQrServer } = require("./src/server/qrServer");
const { preloadSemua } = require("./src/state");

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

async function startBot() {
  // 1. Init supabase dulu
  initSupabase();

  // 2. Baru preload — supabase sudah siap
  await preloadSemua(supabase);

  // 3. Start server & scheduler
  startQrServer(process.env.PORT || 3000);
  initScheduler();

  while (true) {
    try {
      console.log("[Main] Menghubungkan ke WhatsApp...");
      const sock = await connectWithRetry();

      registerCommands(sock);
      console.log("[Main] Bot siap menerima pesan.");

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
