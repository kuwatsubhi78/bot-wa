const http = require("http");
const QRCode = require("qrcode");

let latestQR = null;

function setLatestQR(qr) {
  latestQR = qr;
}

function startQrServer(port) {
  const server = http.createServer(async (req, res) => {
    if (req.url === "/" || req.url === "/qr") {
      if (!latestQR) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          `<html><head><meta http-equiv="refresh" content="3"></head>
           <body style="font-family:sans-serif;text-align:center;padding-top:60px">
             <h2>Menunggu QR...</h2>
             <p>Halaman ini auto-refresh tiap 3 detik.</p>
           </body></html>`,
        );
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(latestQR, { width: 400 });
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          `<html><head><meta http-equiv="refresh" content="5"></head>
           <body style="font-family:sans-serif;text-align:center;padding-top:30px">
             <h2>Scan QR WhatsApp Bot</h2>
             <img src="${dataUrl}" alt="QR Code" style="width:300px;height:300px" />
             <p>Halaman auto-refresh tiap 5 detik sampai QR di-scan.</p>
           </body></html>`,
        );
      } catch (error) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Gagal membuat QR: " + error.message);
      }
      return;
    }

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Bot lembur berjalan.");
  });

  server.listen(port, () => {
    console.log(`QR server berjalan di port ${port}`);
  });
}

module.exports = {
  startQrServer,
  setLatestQR,
};
