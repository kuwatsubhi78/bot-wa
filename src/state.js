export const state = {
  kodePekerjaan: [],
  profilKaryawan: {}, // pakai object Map by ID biar lookup cepat
};

export async function preloadSemua(supabase) {
  const [kode, profil] = await Promise.all([
    supabase
      .from("kode_pekerjaan")
      .select("*")
      .order("kode", { ascending: true }),
    supabase.from("profil_karyawan").select("*"),
  ]);

  if (kode.error)
    throw new Error(`Gagal load kode_pekerjaan: ${kode.error.message}`);
  if (profil.error)
    throw new Error(`Gagal load profil_karyawan: ${profil.error.message}`);

  state.kodePekerjaan = kode.data || [];

  // index by nomor_wa atau id supaya lookup O(1)
  state.profilKaryawan = Object.fromEntries(
    (profil.data || []).map((p) => [p.nomor_wa, p]),
  );

  console.log(`✅ Preload selesai:`);
  console.log(`   - ${state.kodePekerjaan.length} kode pekerjaan`);
  console.log(
    `   - ${Object.keys(state.profilKaryawan).length} profil karyawan`,
  );
}
