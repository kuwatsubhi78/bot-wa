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
const RECONNECT_DELAY = 5000;

async function initWhatsApp() {
  if (isConnecting) {
    return sock;
  }

  if (sock) {
    return sock;
  }

  isConnecting = true;

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
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        console.log("WhatsApp Connected");
        isConnecting = false;
      } else if (connection === "close") {
        console.log("WhatsApp Disconnected");
        sock = null;
        isConnecting = false;

        if (isLoggedOut || isConnectionReplaced) {
          console.log("Session logout scan ulang QR");
          if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }
        } else if (!reconnectTimer) {
          console.log("Reconnect dalam 5 detik");
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            initWhatsApp();
          }, RECONNECT_DELAY);
        }
      }
    });

    return sock;
  } catch (error) {
    isConnecting = false;
    sock = null;
    console.error("Gagal inisialisasi WhatsApp:", error);
    throw error;
  }
}

module.exports = {
  initWhatsApp,
};
