const TARIF_PER_JAM = 15656;
const UANG_MAKAN = 6000;
const MIN_JAM_UANG_MAKAN = 3.5;

function hitungLembur(jamMulai, jamSelesai, isLibur = false) {
  const [mulaiJam, mulaiMenit] = jamMulai.split(":").map(Number);
  const [selesaiJam, selesaiMenit] = jamSelesai.split(":").map(Number);

  const mulai = mulaiJam * 60 + mulaiMenit;
  const selesai = selesaiJam * 60 + selesaiMenit;
  // kalau selesai <= mulai, berarti melewati tengah malam
  // contoh: 22:00 - 01:00 = 3 jam (bukan negatif)
  let diffMenit = selesai - mulai;
  if (diffMenit <= 0) {
    diffMenit += 24 * 60;
  }

  // batas wajar lembur maksimal 12 jam
  // kalau lebih dari itu kemungkinan input salah, bukan lintas malam
  if (diffMenit > 12 * 60) {
    return {
      totalJam: 0,
      tarifPerJam: TARIF_PER_JAM,
      uangLembur: 0,
      uangMakan: 0,
      totalDiterima: 0,
      isLibur,
    };
  }

  // Kalau hari libur, jam dikali 2
  const totalJam = isLibur ? (diffMenit / 60) * 2 : diffMenit / 60;

  const uangLembur = Math.round(totalJam * TARIF_PER_JAM);
  const uangMakan = totalJam >= MIN_JAM_UANG_MAKAN ? UANG_MAKAN : 0;
  const totalDiterima = uangLembur + uangMakan;

  return {
    totalJam,
    tarifPerJam: TARIF_PER_JAM,
    uangLembur,
    uangMakan,
    totalDiterima,
    isLibur,
  };
}

function calculateOvertime(jamLembur, tarif) {
  return jamLembur * tarif;
}

module.exports = {
  hitungLembur,
  calculateOvertime,
  TARIF_PER_JAM,
  UANG_MAKAN,
};
