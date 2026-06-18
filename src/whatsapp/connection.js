const { setLatestQR, setConnected } = require("../server/qrServer");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");

// ====================================================================
// State globals
// ====================================================================
let sock = null;
let reconnectTimer = null;
let isConnecting = false;

const RECONNECT_DELAY = 5000;

// Waktu maksimum menunggu QR di-scan sebelum reconnect (3 menit)
const QR_SCAN_TIMEOUT = 3 * 60 * 1000;

let qrTimeoutTimer = null;

// ====================================================================
// Helpers
// ====================================================================
function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function clearQrTimeout() {
  if (qrTimeoutTimer) {
    clearTimeout(qrTimeoutTimer);
    qrTimeoutTimer = null;
  }
}

function scheduleReconnect(label) {
  clearReconnectTimer();
  clearQrTimeout();
  if (!reconnectTimer) {
    console.log(
      `[WA] ${label} — reconnect dalam ${RECONNECT_DELAY / 1000} detik...`,
    );
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      isConnecting = false;
      connectWhatsApp().catch((err) => {
        console.error("[WA] Reconnect gagal:", err.message);
      });
    }, RECONNECT_DELAY);
  }
}

// ====================================================================
// connectWhatsApp
// ====================================================================
async function connectWhatsApp() {
  // Jika sudah konek, langsung kembalikan socket
  if (sock?.user?.id) {
    return sock;
  }

  // Hindari dua proses connect berjalan bersamaan
  if (isConnecting) {
    console.log("[WA] Sudah dalam proses connecting, tunggu...");
    return new Promise((resolve, reject) => {
      const check = setInterval(() => {
        if (sock?.user?.id) {
          clearInterval(check);
          resolve(sock);
        }
      }, 500);
      setTimeout(
        () => {
          clearInterval(check);
          reject(new Error("Timeout menunggu koneksi WhatsApp"));
        },
        5 * 60 * 1000,
      );
    });
  }

  isConnecting = true;
  clearReconnectTimer();

  // ====================================================================
  // Buat socket baru
  // ====================================================================
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
  const { version } = await fetchLatestBaileysVersion();

  console.log(`[WA] Menggunakan Baileys v${version.join(".")}`);

  sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: true,
    browser: ["Ubuntu", "Chrome", "124.0.0"],
    syncFullHistory: false,
    keepAliveIntervalMs: 30_000,
    retryRequestDelayMs: 2000,
  });

  // Selalu daftarkan ulang creds.update pada setiap socket baru
  sock.ev.on("creds.update", saveCreds);

  // ====================================================================
  // Bungkus dalam Promise agar caller bisa await sampai "open"
  // ====================================================================
  return new Promise((resolve, reject) => {
    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;
      const statusCode = lastDisconnect?.error?.output?.statusCode;

      // ----------------------------------------------------------------
      // QR muncul
      // ----------------------------------------------------------------
      if (qr) {
        console.log("\n[WA] QR muncul — silakan scan dalam 3 menit.\n");
        qrcode.generate(qr, { small: true });
        setLatestQR(qr);

        // Reset timer setiap kali QR baru muncul (WA refresh QR tiap ~20 detik)
        clearQrTimeout();
        qrTimeoutTimer = setTimeout(() => {
          console.log("[WA] QR tidak di-scan dalam 3 menit, reconnect...");
          scheduleReconnect("QR timeout");
          reject(new Error("QR scan timeout"));
        }, QR_SCAN_TIMEOUT);
      }

      // ----------------------------------------------------------------
      // Koneksi berhasil terbuka
      // ----------------------------------------------------------------
      if (connection === "open") {
        clearQrTimeout();
        clearReconnectTimer();
        isConnecting = false;
        console.log("[WA] WhatsApp Connected ✓");
        setConnected();
        resolve(sock);
      }

      // ----------------------------------------------------------------
      // Koneksi tertutup
      // ----------------------------------------------------------------
      if (connection === "close") {
        console.log(`[WA] WhatsApp Disconnected — statusCode: ${statusCode}`);
        clearQrTimeout();

        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const isReplaced = statusCode === DisconnectReason.connectionReplaced;
        const isRestartRequired = statusCode === 515;

        if (isLoggedOut) {
          console.log(
            "[WA] Sesi logout — hapus auth_info_baileys lalu restart bot.",
          );
          sock = null;
          isConnecting = false;
          reject(new Error("WhatsApp logout — scan QR ulang."));
          return;
        }

        if (isReplaced) {
          console.log("[WA] Koneksi digantikan device lain.");
          sock = null;
          isConnecting = false;
          reject(new Error("Koneksi digantikan device lain."));
          return;
        }

        // Semua kasus lain (termasuk error 515) → reconnect otomatis
        sock = null;
        isConnecting = false;

        if (isRestartRequired) {
          console.log(
            "[WA] Error 515 (restart required setelah pairing) — reconnect...",
          );
        }

        scheduleReconnect(`close code=${statusCode}`);
        reject(
          new Error(`Koneksi ditutup (${statusCode}), sedang reconnect...`),
        );
      }
    });
  }).catch((err) => {
    // Kalau error bukan fatal (hanya "sedang reconnect"), tunggu sampai reconnect selesai
    if (err.message.startsWith("Koneksi ditutup")) {
      return new Promise((resolve, reject) => {
        const check = setInterval(() => {
          if (sock?.user?.id) {
            clearInterval(check);
            resolve(sock);
          }
        }, 1000);
        setTimeout(
          () => {
            clearInterval(check);
            reject(new Error("Timeout menunggu reconnect selesai"));
          },
          2 * 60 * 1000,
        );
      });
    }
    throw err;
  });
}

const initWhatsApp = connectWhatsApp;

module.exports = {
  connectWhatsApp,
  initWhatsApp,
};
