const { supabase } = require("../config/supabase");

function toDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getPeriodForDate(inputDate) {
  const date = new Date(inputDate);
  const day = date.getDate();
  const month = date.getMonth();
  const year = date.getFullYear();

  let periodeBulan = month + 1;
  let periodeTahun = year;

  if (day >= 18) {
    if (periodeBulan === 12) {
      periodeBulan = 1;
      periodeTahun = year + 1;
    } else {
      periodeBulan += 1;
    }
  }

  return { periodeBulan, periodeTahun };
}

function getPeriodRange(bulan, tahun) {
  const start = new Date(tahun, bulan - 2, 18);
  const end = new Date(tahun, bulan - 1, 17);

  return {
    tanggalAwal: toDateString(start),
    tanggalAkhir: toDateString(end),
  };
}

function getYearRange(tahun) {
  const start = new Date(tahun - 1, 11, 18);
  const end = new Date(tahun, 11, 17);

  return {
    tanggalAwal: toDateString(start),
    tanggalAkhir: toDateString(end),
  };
}

function hitungTotalJam(jamMulai, jamSelesai) {
  if (!jamMulai || !jamSelesai) return 0;

  const [mulaiJam, mulaiMenit] = jamMulai.split(":").map(Number);
  const [selesaiJam, selesaiMenit] = jamSelesai.split(":").map(Number);

  const mulai = mulaiJam * 60 + mulaiMenit;
  const selesai = selesaiJam * 60 + selesaiMenit;
  const diff = selesai - mulai;

  return diff > 0 ? diff / 60 : 0;
}

async function tambahLembur(data) {
  if (!supabase) {
    return { status: "skipped", message: "Supabase belum siap." };
  }

  const tanggal = data.tanggal || toDateString(new Date());
  const period = getPeriodForDate(tanggal);
  const totalJam = Number(
    data.total_jam || hitungTotalJam(data.jam_mulai, data.jam_selesai) || 0,
  );
  const tarifPerJam = Number(data.tarif_per_jam || 0);
  const uangLembur = Number(data.uang_lembur || totalJam * tarifPerJam || 0);
  const uangMakan = Number(data.uang_makan || 0);
  const totalDiterima = Number(
    data.total_diterima || uangLembur + uangMakan || 0,
  );

  const payload = {
    nama: data.nama || "",
    divisi: data.divisi || "", // ← baru
    nomor_wa: data.nomor_wa || "",
    tanggal,
    uraian_pekerjaan: data.uraian_pekerjaan || "",
    jam_mulai: data.jam_mulai || null,
    jam_selesai: data.jam_selesai || null,
    total_jam: totalJam,
    tarif_per_jam: tarifPerJam,
    uang_lembur: uangLembur,
    uang_makan: uangMakan,
    total_diterima: totalDiterima,
    is_libur: data.is_libur || false, // ← baru
    periode_bulan: period.periodeBulan,
    periode_tahun: period.periodeTahun,
    created_at: new Date().toISOString(),
  };

  const { data: inserted, error } = await supabase
    .from("lembur")
    .insert([payload])
    .select()
    .single();

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "ok", data: inserted };
}

async function ambilLemburBulanan(nomorWA, bulan, tahun) {
  if (!supabase) {
    return { status: "skipped", message: "Supabase belum siap." };
  }

  const month = Number(bulan);
  const year = Number(tahun);

  if (!Number.isFinite(month) || !Number.isFinite(year)) {
    return { status: "error", message: "Bulan atau tahun tidak valid." };
  }

  const { tanggalAwal, tanggalAkhir } = getPeriodRange(month, year);

  const { data, error } = await supabase
    .from("lembur")
    .select("*")
    .eq("nomor_wa", nomorWA)
    .gte("tanggal", tanggalAwal)
    .lte("tanggal", tanggalAkhir)
    .order("tanggal", { ascending: true });

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "ok", data, tanggalAwal, tanggalAkhir };
}

async function ambilLemburPeriode(nomorWA, bulan, tahun) {
  return ambilLemburBulanan(nomorWA, bulan, tahun);
}

async function ambilLemburPeriodeSemua(bulan, tahun) {
  if (!supabase) {
    return { status: "skipped", message: "Supabase belum siap." };
  }

  const month = Number(bulan);
  const year = Number(tahun);

  if (!Number.isFinite(month) || !Number.isFinite(year)) {
    return { status: "error", message: "Bulan atau tahun tidak valid." };
  }

  const { tanggalAwal, tanggalAkhir } = getPeriodRange(month, year);

  const { data, error } = await supabase
    .from("lembur")
    .select("*")
    .gte("tanggal", tanggalAwal)
    .lte("tanggal", tanggalAkhir)
    .order("tanggal", { ascending: true });

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "ok", data, tanggalAwal, tanggalAkhir };
}

async function ambilRekapTahunan(nomorWA, tahun) {
  if (!supabase) {
    return { status: "skipped", message: "Supabase belum siap." };
  }

  const { tanggalAwal, tanggalAkhir } = getYearRange(Number(tahun));

  const { data, error } = await supabase
    .from("lembur")
    .select("*")
    .eq("nomor_wa", nomorWA)
    .gte("tanggal", tanggalAwal)
    .lte("tanggal", tanggalAkhir)
    .order("tanggal", { ascending: true });

  if (error) {
    return { status: "error", message: error.message };
  }

  const summary = {};

  for (const item of data || []) {
    const period = getPeriodForDate(item.tanggal);
    const key = `${period.periodeBulan}-${period.periodeTahun}`;

    if (!summary[key]) {
      summary[key] = {
        periode_bulan: period.periodeBulan,
        periode_tahun: period.periodeTahun,
        total_jam: 0,
        uang_lembur: 0,
        uang_makan: 0,
        total_diterima: 0,
        jumlah_data: 0,
      };
    }

    summary[key].total_jam += Number(item.total_jam || 0);
    summary[key].uang_lembur += Number(item.uang_lembur || 0);
    summary[key].uang_makan += Number(item.uang_makan || 0);
    summary[key].total_diterima += Number(item.total_diterima || 0);
    summary[key].jumlah_data += 1;
  }

  return { status: "ok", data: summary, tanggalAwal, tanggalAkhir };
}

// ====================================================================
// Karyawan
// ====================================================================
async function cariKaryawan(nomorWa) {
  if (!supabase) return { status: "skipped", message: "Supabase belum siap." };

  // strip suffix apapun sebelum lookup
  const nomorPolos = String(nomorWa)
    .replace(/@.*$/, "")
    .replace(/:.*$/, "")
    .trim();

  const { data, error } = await supabase
    .from("karyawan")
    .select("*")
    .eq("nomor_wa", nomorPolos)
    .maybeSingle();

  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "not_found" };
  return { status: "ok", data };
}

async function daftarkanKaryawan(nomorWa, jid, nama, divisi) {
  const nomorPolos = String(nomorWa)
    .replace(/@.*$/, "")
    .replace(/:.*$/, "")
    .trim();

  const { data, error } = await supabase
    .from("karyawan")
    .upsert([{ nomor_wa: nomorPolos, jid: jid || "", nama, divisi }], {
      onConflict: "nomor_wa",
    })
    .select()
    .single();

  if (error) return { status: "error", message: error.message };
  return { status: "ok", data };
}

// ====================================================================
// Kode pekerjaan
// ====================================================================
async function ambilSemuaKodePekerjaan() {
  if (!supabase) return { status: "skipped", message: "Supabase belum siap." };

  const { data, error } = await supabase
    .from("kode_pekerjaan")
    .select("*")
    .order("kode", { ascending: true });

  if (error) return { status: "error", message: error.message };
  return { status: "ok", data: data || [] };
}

// ====================================================================
// Hapus & edit lembur
// ====================================================================
async function ambilLemburById(id) {
  if (!supabase) return { status: "skipped", message: "Supabase belum siap." };

  const { data, error } = await supabase
    .from("lembur")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "not_found" };
  return { status: "ok", data };
}

async function hapusLemburById(id) {
  if (!supabase) return { status: "skipped", message: "Supabase belum siap." };

  const { error } = await supabase.from("lembur").delete().eq("id", id);
  if (error) return { status: "error", message: error.message };
  return { status: "ok" };
}

async function updateLemburById(id, updateData) {
  if (!supabase) return { status: "skipped", message: "Supabase belum siap." };

  const { data, error } = await supabase
    .from("lembur")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) return { status: "error", message: error.message };
  return { status: "ok", data };
}

async function tambahPendaftaran(nomorWa, jid, nama, divisi) {
  const nomorPolos = String(nomorWa)
    .replace(/@.*$/, "")
    .replace(/:.*$/, "")
    .trim();

  const { data, error } = await supabase
    .from("pendaftaran")
    .insert([{ nomor_wa: nomorPolos, jid, nama, divisi }])
    .select()
    .single();

  if (error) return { status: "error", message: error.message };
  return { status: "ok", data };
}

async function ambilPendaftaranById(id) {
  if (!supabase) return { status: "skipped", message: "Supabase belum siap." };

  const { data, error } = await supabase
    .from("pendaftaran")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "not_found" };
  return { status: "ok", data };
}

async function updateStatusPendaftaran(id, status) {
  if (!supabase) return { status: "skipped", message: "Supabase belum siap." };

  const { error } = await supabase
    .from("pendaftaran")
    .update({ status })
    .eq("id", id);

  if (error) return { status: "error", message: error.message };
  return { status: "ok" };
}

module.exports = {
  tambahLembur,
  ambilLemburBulanan,
  ambilLemburPeriode,
  ambilLemburPeriodeSemua,
  ambilRekapTahunan,
  getPeriodRange,
  getPeriodForDate,
  cariKaryawan,
  daftarkanKaryawan,
  ambilSemuaKodePekerjaan,
  ambilLemburById,
  hapusLemburById,
  updateLemburById,
  tambahPendaftaran,
  ambilPendaftaranById,
  updateStatusPendaftaran,
};
