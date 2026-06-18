const TARIF_PER_JAM = 15656;
const UANG_MAKAN = 6000;
const MIN_JAM_UANG_MAKAN = 3.5;

function hitungLembur(jamMulai, jamSelesai, isLibur = false) {
  const [mulaiJam, mulaiMenit] = jamMulai.split(":").map(Number);
  const [selesaiJam, selesaiMenit] = jamSelesai.split(":").map(Number);

  const mulai = mulaiJam * 60 + mulaiMenit;
  const selesai = selesaiJam * 60 + selesaiMenit;
  const diffMenit = selesai - mulai;

  if (diffMenit <= 0) {
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
