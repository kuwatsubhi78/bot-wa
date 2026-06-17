require("dotenv").config();

const { initSupabase } = require("./src/config/supabase");
const { initWhatsApp } = require("./src/whatsapp/connection");
const { registerCommands } = require("./src/commands");
const { initScheduler } = require("./src/scheduler/reminder");

async function main() {
  console.log("BOT LEMBUR BERJALAN");

  initSupabase();
  await initWhatsApp();
  registerCommands();
  initScheduler();
}

main().catch((error) => {
  console.error("Gagal menjalankan bot:", error);
  process.exit(1);
});
