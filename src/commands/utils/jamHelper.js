function splitJamRange(jamLembur) {
  const parts = String(jamLembur || "")
    .split("-")
    .map((p) => p.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const jamRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!jamRegex.test(parts[0]) || !jamRegex.test(parts[1])) return null;

  return { jamMulai: parts[0], jamSelesai: parts[1] };
}

function formatJamTitik(jam) {
  return String(jam || "").replace(":", ".");
}

module.exports = { splitJamRange, formatJamTitik };
