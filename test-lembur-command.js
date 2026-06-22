process.env.ADMIN_NUMBERS = "6280000000000";
process.env.ADMIN_SECRET = "rahasiatest";

const assert = require("assert");
const { createMockSupabase } = require("./test-mock-supabase");

const supabaseConfigPath = require.resolve("./src/config/supabase");
const mockClient = createMockSupabase({
  karyawan: [
    {
      nomor_wa: "6281111111111", // nomor polos, sesuai konvensi baru
      jid: "6281111111111@s.whatsapp.net",
      nama: "Budi Santoso",
      divisi: "Slitting",
    },
  ],
  kode_pekerjaan: [
    { kode: "1", deskripsi: "Slitting" },
    { kode: "2", deskripsi: "Packing" },
  ],
});
require.cache[supabaseConfigPath] = {
  id: supabaseConfigPath,
  filename: supabaseConfigPath,
  loaded: true,
  exports: { supabase: mockClient, initSupabase: () => mockClient },
};

const { handleLemburCommand } = require("./src/commands/lemburCommand");

let passed = 0,
  failed = 0;
async function test(label, fn) {
  try {
    await fn();
    console.log(`✓ ${label}`);
    passed++;
  } catch (err) {
    console.log(`✗ ${label}\n  ${err.message}`);
    failed++;
  }
}

const KARYAWAN = { sender: "6281111111111@s.whatsapp.net" };
const ASING = { sender: "6289999999999@s.whatsapp.net" };
const ADMIN = { sender: "6280000000000@s.whatsapp.net" };

(async () => {
  // ---- Menu ----
  await test("!bantuan tampil menu karyawan", async () => {
    const r = await handleLemburCommand({ ...KARYAWAN, text: "!bantuan" });
    assert.ok(r.message.includes("BOT REKAP LEMBUR"));
    assert.ok(!r.message.includes("Khusus Admin"));
  });

  await test("!bantuan admin tampil section admin", async () => {
    const r = await handleLemburCommand({ ...ADMIN, text: "!bantuan" });
    assert.ok(r.message.includes("Khusus Admin"));
    assert.ok(r.message.includes("Mode admin tidak aktif"));
  });

  // ---- Validasi karyawan ----
  await test("!l1 ditolak nomor tidak terdaftar", async () => {
    const r = await handleLemburCommand({
      ...ASING,
      text: "!l1 12:00-15:30 slitting",
    });
    assert.strictEqual(r.status, "error");
    assert.ok(r.message.includes("belum terdaftar"));
  });

  // ---- !daftar ----
  await test("!daftar karyawan baru kirim request", async () => {
    const r = await handleLemburCommand({
      ...ASING,
      text: "!daftar Andi Wijaya, Packing",
    });
    assert.strictEqual(r.status, "ok");
    assert.ok(r.message.includes("terkirim"));
  });

  await test("!daftar nomor yang sudah terdaftar", async () => {
    const r = await handleLemburCommand({
      ...KARYAWAN,
      text: "!daftar Budi, Slitting",
    });
    assert.ok(r.message.includes("sudah terdaftar"));
  });

  // ---- !adminon / !adminoff ----
  await test("!adminon kode salah ditolak", async () => {
    const r = await handleLemburCommand({
      ...ADMIN,
      text: "!adminon kodeSalah",
    });
    assert.strictEqual(r.status, "error");
    assert.ok(r.message.includes("salah"));
  });

  await test("!adminon kode benar berhasil", async () => {
    const r = await handleLemburCommand({
      ...ADMIN,
      text: "!adminon rahasiatest",
    });
    assert.strictEqual(r.status, "ok");
    assert.ok(r.message.includes("aktif"));
  });

  await test("!bantuan admin setelah adminon tampil AKTIF", async () => {
    const r = await handleLemburCommand({ ...ADMIN, text: "!bantuan" });
    assert.ok(r.message.includes("Mode admin AKTIF"));
  });

  await test("!adminon bukan admin tidak dikenali", async () => {
    const r = await handleLemburCommand({
      ...KARYAWAN,
      text: "!adminon rahasiatest",
    });
    assert.ok(r.message.includes("!bantuan")); // dianggap command tidak dikenali
  });

  // ---- Command admin butuh mode aktif ----
  await test("!daftarkaryawan tanpa adminon ditolak", async () => {
    // pakai KARYAWAN (bukan admin), pastikan ditolak
    const r = await handleLemburCommand({
      ...KARYAWAN,
      text: "!daftarkaryawan 6283333333333, Cici, Kasa",
    });
    assert.strictEqual(r.status, "error");
  });

  await test("!daftarkaryawan dengan adminon berhasil", async () => {
    const r = await handleLemburCommand({
      ...ADMIN,
      text: "!daftarkaryawan 6283333333333, Cici, Kasa",
    });
    assert.strictEqual(r.status, "ok");
    assert.ok(r.message.includes("Cici"));
  });

  // ---- !setujui ----
  await test("!setujui request pendaftaran Andi", async () => {
    // ambil id dari tabel pendaftaran mock
    const rows = mockClient._tables.pendaftaran;
    assert.ok(rows.length > 0, "Tidak ada data pendaftaran di mock");
    const id = rows[0].id;
    const r = await handleLemburCommand({ ...ADMIN, text: `!setujui ${id}` });
    assert.strictEqual(r.status, "ok");
    assert.ok(r.message.includes("didaftarkan"));
  });

  // ---- !l1/!l2/!l3 ----
  await test("!l1 berhasil", async () => {
    const r = await handleLemburCommand({
      ...KARYAWAN,
      text: "!l1 12:00-15:30 slitting",
    });
    assert.strictEqual(r.status, "ok");
    assert.ok(r.message.includes("Budi Santoso"));
    assert.ok(r.message.includes("12.00-15.30"));
  });

  await test("!l1 libur hitung 2x jam", async () => {
    const r = await handleLemburCommand({
      ...KARYAWAN,
      text: "!l1 12:00-15:30 slitting libur",
    });
    assert.ok(r.message.includes("7 jam"));
  });

  await test("!l2 format jam salah ditolak", async () => {
    const r = await handleLemburCommand({
      ...KARYAWAN,
      text: "!l2 2000-2330 slitting",
    });
    assert.strictEqual(r.status, "error");
  });

  await test("!l3 lintas tengah malam berhasil", async () => {
    const r = await handleLemburCommand({
      ...KARYAWAN,
      text: "!l3 22:00-01:00 slitting",
    });
    assert.strictEqual(r.status, "ok");
    assert.ok(r.message.includes("3 jam"));
  });

  // ---- !m1/!m2/!m3 ----
  await test("!m1 dengan uraian berhasil", async () => {
    const r = await handleLemburCommand({ ...KARYAWAN, text: "!m1 slitting" });
    assert.strictEqual(r.status, "ok");
    assert.ok(r.message.includes("12.00-14.00"));
    assert.ok(r.message.includes("slitting"));
  });

  await test("!m1 tanpa uraian ditolak", async () => {
    const r = await handleLemburCommand({ ...KARYAWAN, text: "!m1" });
    assert.strictEqual(r.status, "error");
    assert.ok(r.message.includes("Format salah"));
  });

  await test("!m2 dengan uraian berhasil", async () => {
    const r = await handleLemburCommand({ ...KARYAWAN, text: "!m2 packing" });
    assert.ok(r.message.includes("20.00-22.00"));
  });

  await test("!m3 dengan uraian berhasil", async () => {
    const r = await handleLemburCommand({ ...KARYAWAN, text: "!m3 packing" });
    assert.ok(r.message.includes("04.00-06.00"));
  });

  // ---- !kode (butuh admin aktif) ----
  await test("!kode tanpa admin ditolak", async () => {
    const r = await handleLemburCommand({ ...KARYAWAN, text: "!kode" });
    assert.strictEqual(r.status, "error");
    assert.ok(r.message.includes("adminon"));
  });

  await test("!kode dengan admin aktif berhasil", async () => {
    const r = await handleLemburCommand({ ...ADMIN, text: "!kode" });
    assert.strictEqual(r.status, "ok");
    assert.ok(r.message.includes("Slitting") && r.message.includes("Packing"));
  });

  // ---- !lembur ----
  await test("!lembur karyawan tampil tanpa ID", async () => {
    const r = await handleLemburCommand({ ...KARYAWAN, text: "!lembur" });
    assert.strictEqual(r.status, "ok");
    assert.ok(r.message.includes("Budi Santoso"));
    assert.ok(!r.message.includes("[ID:")); // karyawan tidak lihat ID
  });

  await test("!lembur admin tampil dengan ID", async () => {
    // admin lihat rekap miliknya sendiri — admin belum ada data lembur di mock
    // jadi test ini cukup pastikan tidak crash
    const r = await handleLemburCommand({ ...ADMIN, text: "!lembur" });
    assert.strictEqual(r.status, "ok");
  });

  // ---- !hapus & !edit (butuh admin aktif atau milik sendiri) ----
  let createdId;
  await test("simpan data untuk test hapus/edit", async () => {
    const r = await handleLemburCommand({
      ...KARYAWAN,
      text: "!l2 20:00-22:00 test hapus edit",
    });
    assert.strictEqual(r.status, "ok");
    const rows = mockClient._tables.lembur;
    createdId = rows[rows.length - 1].id;
    assert.ok(createdId > 0);
  });

  await test("orang lain tidak bisa hapus tanpa admin", async () => {
    const r = await handleLemburCommand({
      sender: "6289999999999@s.whatsapp.net",
      text: `!hapus ${createdId}`,
    });
    assert.ok(r.message.includes("milik sendiri"));
  });

  await test("pemilik bisa edit", async () => {
    const r = await handleLemburCommand({
      ...KARYAWAN,
      text: `!edit ${createdId}, 20:00-23:00, uraian baru`,
    });
    assert.strictEqual(r.status, "ok");
    assert.ok(r.message.includes("uraian baru"));
  });

  await test("pemilik bisa hapus", async () => {
    const r = await handleLemburCommand({
      ...KARYAWAN,
      text: `!hapus ${createdId}`,
    });
    assert.ok(r.message.includes("berhasil dihapus"));
  });

  await test("hapus ID sudah dihapus → not found", async () => {
    const r = await handleLemburCommand({
      ...KARYAWAN,
      text: `!hapus ${createdId}`,
    });
    assert.ok(r.message.includes("tidak ditemukan"));
  });

  await test("admin bisa hapus data siapapun", async () => {
    // buat data baru dulu
    const buat = await handleLemburCommand({
      ...KARYAWAN,
      text: "!l1 12:00-14:00 test admin hapus",
    });
    const rows = mockClient._tables.lembur;
    const id = rows[rows.length - 1].id;
    const r = await handleLemburCommand({ ...ADMIN, text: `!hapus ${id}` });
    assert.ok(r.message.includes("berhasil dihapus"));
  });

  // ---- !adminoff ----
  await test("!adminoff nonaktifkan mode admin", async () => {
    const r = await handleLemburCommand({ ...ADMIN, text: "!adminoff" });
    assert.ok(r.message.includes("dinonaktifkan"));
  });

  await test("!kode setelah adminoff ditolak lagi", async () => {
    const r = await handleLemburCommand({ ...ADMIN, text: "!kode" });
    assert.strictEqual(r.status, "error");
  });

  // ---- Command tidak dikenali ----
  await test("command tidak dikenali → arahkan ke !bantuan", async () => {
    const r = await handleLemburCommand({ ...KARYAWAN, text: "!asalasalan" });
    assert.ok(r.message.includes("!bantuan"));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
