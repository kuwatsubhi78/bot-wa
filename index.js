require("dotenv").config();

const { initSupabase } = require("./src/config/supabase");
const { connectWhatsApp } = require("./src/whatsapp/connection");
const { registerCommands } = require("./src/commands");
const { initScheduler } = require("./src/scheduler/reminder");
const { startQrServer } = require("./src/server/qrServer");

async function main() {
  console.log("BOT LEMBUR BERJALAN");

  initSupabase();
  startQrServer(process.env.PORT || 3000);
  const sock = await connectWhatsApp();
  registerCommands(sock);
  initScheduler();

  setInterval(
    () => {
      console.log("Bot masih hidup");
    },
    1000 * 60 * 30,
  );
}

main().catch((error) => {
  console.error("Gagal menjalankan bot:", error);
});
