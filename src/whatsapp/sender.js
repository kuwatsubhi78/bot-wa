function sendTextMessage(sock, jid, text) {
  if (!sock || !jid || !text) {
    return false;
  }

  return sock.sendMessage(jid, {
    text,
  });
}

function sendDocumentMessage(
  sock,
  jid,
  buffer,
  fileName,
  mimetype = "text/csv",
) {
  if (!sock || !jid || !buffer) return false;

  return sock.sendMessage(jid, {
    document: buffer,
    mimetype,
    fileName,
  });
}

module.exports = {
  sendTextMessage,
  sendDocumentMessage,
};
