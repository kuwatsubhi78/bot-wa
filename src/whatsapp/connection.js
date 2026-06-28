const { setLatestQR, setConnected } = require("../server/qrServer");
const fs = require("fs");
const path = require("path");

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
const QR_SCAN_TIMEOUT = 5 * 60 * 1000;

let qrTimeoutTimer = null;

// ====================================================================
// Health check — kirim ping ke WA server setiap 2 menit
// Mencegah koneksi zombie setelah idle lama
// ====================================================================
let healthCheckTimer = null;

function startHealthCheck() {
  stopHealthCheck();
  healthCheckTimer = setInterval(
    async () => {
      if (!sock?.user?.id) return;
      try {
        await sock.sendPresenceUpdate("available");
      } catch (err) {
        console.log("[WA] Health check gagal, reconnect...", err.message);
        sock = null;
        isConnecting = false;
        scheduleReconnect("Health check gagal");
      }
    },
    2 * 60 * 1000,
  );
}

function stopHealthCheck() {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}

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

function clearAuthSession() {
  const authDir = path.resolve("auth_info_baileys");
  try {
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
      console.log("[WA] Sesi lama dihapus, akan minta QR baru.");
    }
  } catch (err) {
    console.error("[WA] Gagal hapus sesi:", err.message);
  }
}

// ====================================================================
// connectWhatsApp
// ====================================================================
async function connectWhatsApp() {
  if (sock?.user?.id) {
    return sock;
  }

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

  sock.ev.on("creds.update", saveCreds);

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
        startHealthCheck();
        resolve(sock);
      }

      // ----------------------------------------------------------------
      // Koneksi tertutup
      // ----------------------------------------------------------------
      if (connection === "close") {
        console.log(`[WA] WhatsApp Disconnected — statusCode: ${statusCode}`);
        clearQrTimeout();
        stopHealthCheck();

        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const isReplaced = statusCode === DisconnectReason.connectionReplaced;
        const isRestartRequired = statusCode === 515;

        if (isLoggedOut) {
          console.log(
            "[WA] Sesi tidak valid (401/logout) — hapus sesi dan minta QR baru...",
          );
          sock = null;
          isConnecting = false;
          clearAuthSession();
          scheduleReconnect("Sesi logout, QR baru");
          reject(new Error("Koneksi ditutup (logout), sedang reconnect..."));
          return;
        }

        if (isReplaced) {
          console.log("[WA] Koneksi digantikan device lain — reconnect...");
          sock = null;
          isConnecting = false;
          scheduleReconnect("Koneksi digantikan");
          reject(new Error("Koneksi ditutup (replaced), sedang reconnect..."));
          return;
        }

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
