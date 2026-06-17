function sendTextMessage(sock, jid, text) {
  if (!sock || !jid || !text) {
    return false;
  }

  return sock.sendMessage(jid, {
    text,
  });
}

module.exports = {
  sendTextMessage,
};
