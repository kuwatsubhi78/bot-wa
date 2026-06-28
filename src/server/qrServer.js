const http = require("http");
const QRCode = require("qrcode");

// ====================================================================
// State
// ====================================================================
let latestQR = null;
let isConnected = false;

function setLatestQR(qr) {
  latestQR = qr;
  isConnected = false;
}

function setConnected() {
  isConnected = true;
  latestQR = null;
}

// ====================================================================
// QR Server
// ====================================================================
function startQrServer(port) {
  const server = http.createServer(async (req, res) => {
    // ----------------------------------------------------------------
    // /health — untuk Northflank health check
    // ----------------------------------------------------------------
    if (req.url === "/health") {
      if (isConnected) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", connected: true }));
      } else {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "not_connected", connected: false }));
      }
      return;
    }

    // ----------------------------------------------------------------
    // /qr — halaman scan QR
    // ----------------------------------------------------------------
    if (req.url === "/" || req.url === "/qr") {
      if (isConnected) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
          <head>
            <meta charset="utf-8">
            <title>Bot WA - Connected</title>
          </head>
          <body style="font-family:sans-serif;text-align:center;padding-top:80px;background:#f0fdf4">
            <h2 style="color:#16a34a">✅ WhatsApp Bot Terhubung!</h2>
            <p>Bot sudah aktif dan siap menerima pesan.</p>
          </body>
          </html>`);
        return;
      }

      if (!latestQR) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
          <head>
            <meta charset="utf-8">
            <meta http-equiv="refresh" content="3">
            <title>Bot WA - Menunggu QR</title>
          </head>
          <body style="font-family:sans-serif;text-align:center;padding-top:80px">
            <h2>⏳ Menunggu QR...</h2>
            <p>Halaman ini auto-refresh tiap 3 detik.</p>
          </body>
          </html>`);
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(latestQR, { width: 400 });
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
          <head>
            <meta charset="utf-8">
            <meta http-equiv="refresh" content="20">
            <title>Bot WA - Scan QR</title>
          </head>
          <body style="font-family:sans-serif;text-align:center;padding-top:30px">
            <h2>📱 Scan QR WhatsApp Bot</h2>
            <img src="${dataUrl}" alt="QR Code" style="width:300px;height:300px;border:4px solid #333;border-radius:8px" />
            <p style="color:#555">QR auto-refresh tiap 20 detik. Buka WhatsApp → Linked Devices → Link a Device.</p>
            <p style="font-size:12px;color:#aaa">Halaman ini otomatis berubah setelah berhasil konek.</p>
          </body>
          </html>`);
      } catch (error) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Gagal membuat QR: " + error.message);
      }
      return;
    }

    // ----------------------------------------------------------------
    // Default
    // ----------------------------------------------------------------
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Bot lembur berjalan.");
  });

  server.listen(port, () => {
    console.log(
      `[QR Server] Berjalan di port ${port} → buka http://localhost:${port}/qr`,
    );
  });
}

module.exports = {
  startQrServer,
  setLatestQR,
  setConnected,
};
