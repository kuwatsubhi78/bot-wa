require("dotenv").config();

const { initSupabase } = require("./src/config/supabase");
const { connectWhatsApp } = require("./src/whatsapp/connection");
const { registerCommands } = require("./src/commands");
const { initScheduler } = require("./src/scheduler/reminder");

async function main() {
  console.log("BOT LEMBUR BERJALAN");

  initSupabase();
  await connectWhatsApp();
  registerCommands();
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
