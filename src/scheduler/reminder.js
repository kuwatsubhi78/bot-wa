const cron = require("node-cron");
const { sendTextMessage } = require("../whatsapp/sender");
const { initWhatsApp } = require("../whatsapp/connection");
const {
  ambilLemburPeriodeSemua,
  getPeriodRange,
  getPeriodForDate,
  ambilJidKaryawan,
} = require("../services/lemburService");
const { formatReminderMessage } = require("../utils/formatter");

let lastReminderDate = null;

async function runReminderForDate(targetDate, sock) {
  const date = new Date(targetDate);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  if (day !== 17) {
    return;
  }

  const reminderKey = `${year}-${month}-${day}`;
  if (lastReminderDate === reminderKey) {
    return;
  }

  const period = getPeriodForDate(date);
  const selectedMonth = period.periodeBulan;
  const selectedYear = period.periodeTahun;
  const { tanggalAwal, tanggalAkhir } = getPeriodRange(
    selectedMonth,
    selectedYear,
  );

  const result = await ambilLemburPeriodeSemua(selectedMonth, selectedYear);
  if (result.status !== "ok") {
    return;
  }

  const grouped = {};
  for (const item of result.data || []) {
    const nomorWA = item.nomor_wa || "";
    if (!nomorWA) {
      continue;
    }

    if (!grouped[nomorWA]) {
      grouped[nomorWA] = [];
    }

    grouped[nomorWA].push(item);
  }

  const keys = Object.keys(grouped);
  for (const nomorWA of keys) {
    const items = grouped[nomorWA] || [];
    const message = formatReminderMessage(items, tanggalAwal, tanggalAkhir);

    if (!sock || !nomorWA) continue;

    // coba pakai jid yang tersimpan di tabel karyawan
    const jid = await ambilJidKaryawan(nomorWA);

    if (jid && jid.includes("@")) {
      try {
        await sendTextMessage(sock, jid, message);
        continue;
      } catch {
        // jid gagal, fallback ke format manual
      }
    }

    // fallback — coba @lid dulu, lalu @s.whatsapp.net
    try {
      await sendTextMessage(sock, `${nomorWA}@lid`, message);
    } catch {
      try {
        await sendTextMessage(sock, `${nomorWA}@s.whatsapp.net`, message);
      } catch (e) {
        console.error(`[Reminder] Gagal kirim ke ${nomorWA}:`, e.message);
      }
    }
  }

  lastReminderDate = reminderKey;
}

async function testReminder(sock) {
  const today = new Date();
  await runReminderForDate(today, sock);
}

function initScheduler() {
  cron.schedule(
    "0 8 17 * *",
    async () => {
      try {
        console.log("Reminder lembur: cek data lembur hari ini.");
        const currentSock = await initWhatsApp();
        await runReminderForDate(new Date(), currentSock);
      } catch (error) {
        console.error("Gagal menjalankan reminder:", error);
      }
    },
    {
      timezone: "Asia/Jakarta",
    },
  );

  console.log("Scheduler siap.");
}

module.exports = {
  initScheduler,
  testReminder,
};
