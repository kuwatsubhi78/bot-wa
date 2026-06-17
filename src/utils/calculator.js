const TARIF_PER_JAM = 15656;
const UANG_MAKAN_MINIMAL = 6000;

function calculateOvertime(jam, tarif) {
  const jamValue = Number(jam) || 0;
  const tarifValue = Number(tarif) || 0;
  return jamValue * tarifValue;
}

function parseJamToMenit(value) {
  if (typeof value !== "string") {
    return null;
  }

  const [jam, menit] = value.split(":").map((part) => Number(part));

  if (
    Number.isNaN(jam) ||
    Number.isNaN(menit) ||
    jam < 0 ||
    jam > 23 ||
    menit < 0 ||
    menit > 59
  ) {
    return null;
  }

  return jam * 60 + menit;
}

function hitungLembur(jamMulai, jamSelesai) {
  const mulaiMenit = parseJamToMenit(jamMulai);
  const selesaiMenit = parseJamToMenit(jamSelesai);

  if (mulaiMenit === null || selesaiMenit === null) {
    return {
      totalJam: 0,
      tarifPerJam: TARIF_PER_JAM,
      uangLembur: 0,
      uangMakan: 0,
      totalDiterima: 0,
    };
  }

  let selisihMenit = selesaiMenit - mulaiMenit;

  if (selisihMenit < 0) {
    selisihMenit += 24 * 60;
  }

  const totalJam = Number((selisihMenit / 60).toFixed(2));
  const uangLembur = Number((totalJam * TARIF_PER_JAM).toFixed(2));
  const uangMakan = totalJam >= 3.5 ? UANG_MAKAN_MINIMAL : 0;
  const totalDiterima = Number((uangLembur + uangMakan).toFixed(2));

  return {
    totalJam,
    tarifPerJam: TARIF_PER_JAM,
    uangLembur,
    uangMakan,
    totalDiterima,
  };
}

module.exports = {
  calculateOvertime,
  hitungLembur,
};
