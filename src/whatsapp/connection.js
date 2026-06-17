const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");

let sock;
let reconnectTimer = null;
let isConnecting = false;
let credsHandlerRegistered = false;
let connectionPromise = null;
let resolveConnection = null;
let rejectConnection = null;
const RECONNECT_DELAY = 5000;

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function markConnectionResolved(value) {
  if (resolveConnection) {
    resolveConnection(value);
    resolveConnection = null;
    rejectConnection = null;
  }
}

function markConnectionRejected(error) {
  if (rejectConnection) {
    rejectConnection(error);
    resolveConnection = null;
    rejectConnection = null;
  }
}

async function connectWhatsApp() {
  if (sock?.user?.id) {
    return sock;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  if (isConnecting) {
    return new Promise((resolve, reject) => {
      resolveConnection = resolve;
      rejectConnection = reject;
    });
  }

  isConnecting = true;
  connectionPromise = new Promise((resolve, reject) => {
    resolveConnection = resolve;
    rejectConnection = reject;
  });

  try {
    const { state, saveCreds } =
      await useMultiFileAuthState("auth_info_baileys");
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: true,
      browser: ["Ubuntu", "Chrome", "124.0.0"],
      syncFullHistory: false,
    });

    if (!credsHandlerRegistered && sock && sock.ev) {
      sock.ev.on("creds.update", saveCreds);
      credsHandlerRegistered = true;
    }

    if (sock && sock.ev) {
      sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const isConnectionReplaced =
          statusCode === DisconnectReason.connectionReplaced;

        if (qr) {
          console.log("QR WhatsApp muncul, silakan scan.");
          qrcode.generate(qr, { small: true });
        }

        if (connection === "open") {
          clearReconnectTimer();
          console.log("WhatsApp Connected");
          isConnecting = false;
          markConnectionResolved(sock);
        } else if (connection === "close") {
          console.log("WhatsApp Disconnected");
          sock = null;
          isConnecting = false;

          if (isLoggedOut || isConnectionReplaced) {
            console.log("Session logout scan ulang QR");
            markConnectionRejected(
              new Error("Sesi WhatsApp logout atau diganti."),
            );
            clearReconnectTimer();
          } else if (!reconnectTimer) {
            console.log("Reconnect dalam 5 detik");
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;
              connectWhatsApp().catch((error) => {
                console.error("Reconnect gagal:", error);
              });
            }, RECONNECT_DELAY);
          }
        }
      });
    }

    return await connectionPromise;
  } catch (error) {
    isConnecting = false;
    sock = null;
    clearReconnectTimer();
    markConnectionRejected(error);
    console.error("Gagal inisialisasi WhatsApp:", error);
    throw error;
  } finally {
    connectionPromise = null;
    resolveConnection = null;
    rejectConnection = null;
  }
}

const initWhatsApp = connectWhatsApp;

module.exports = {
  connectWhatsApp,
  initWhatsApp,
};
