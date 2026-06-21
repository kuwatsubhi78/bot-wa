process.env.ADMIN_NUMBERS = "6280000000000";

const assert = require("assert");
const { createMockSupabase } = require("./test-mock-supabase");

const supabaseConfigPath = require.resolve("./src/config/supabase");
const mockClient = createMockSupabase({
  karyawan: [
    {
      nomor_wa: "6281111111111@s.whatsapp.net",
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
  await test("!bantuan tampil menu", async () => {
    const r = await handleLemburCommand({ ...KARYAWAN, text: "!bantuan" });
    assert.ok(r.message.includes("BOT REKAP LEMBUR"));
    assert.ok(!r.message.includes("Khusus Admin"));
  });
  await test("!bantuan admin tampil menu admin", async () => {
    const r = await handleLemburCommand({ ...ADMIN, text: "!bantuan" });
    assert.ok(r.message.includes("Khusus Admin"));
  });
  await test("!l1 ditolak untuk nomor tidak terdaftar", async () => {
    const r = await handleLemburCommand({
      ...ASING,
      text: "!l1 12:00-15:30 slitting",
    });
    assert.strictEqual(r.status, "error");
    assert.ok(r.message.includes("belum terdaftar"));
  });
  await test("!daftarkaryawan ditolak bukan admin", async () => {
    const r = await handleLemburCommand({
      ...KARYAWAN,
      text: "!daftarkaryawan 6282222222222@s.whatsapp.net, Andi, Packing",
    });
    assert.strictEqual(r.status, "error");
    assert.ok(r.message.includes("admin"));
  });
  await test("!daftarkaryawan berhasil untuk admin", async () => {
    const r = await handleLemburCommand({
      ...ADMIN,
      text: "!daftarkaryawan 6282222222222@s.whatsapp.net, Andi Wijaya, Packing",
    });
    assert.strictEqual(r.status, "ok");
    assert.ok(r.message.includes("Andi Wijaya"));
  });
  await test("!l1 berhasil", async () => {
    const r = await handleLemburCommand({
      ...KARYAWAN,
      text: "!l1 12:00-15:30 slitting",
    });
    assert.strictEqual(r.status, "ok");
    assert.ok(r.message.includes("Budi Santoso"));
  });
  await test("!l1 libur menghitung 2x jam", async () => {
    const r = await handleLemburCommand({
      ...KARYAWAN,
      text: "!l1 12:00-15:30 slitting libur",
    });
    assert.ok(r.message.includes("7 jam"));
  });
  await test("!l2 jam salah ditolak", async () => {
    const r = await handleLemburCommand({
      ...KARYAWAN,
      text: "!l2 2000-2330 slitting",
    });
    assert.strictEqual(r.status, "error");
  });
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
  await test("!kode tampil daftar", async () => {
    const r = await handleLemburCommand({ ...KARYAWAN, text: "!kode" });
    assert.ok(r.message.includes("Slitting") && r.message.includes("Packing"));
  });
  await test("!lembur menampilkan rekap dengan ID", async () => {
    const r = await handleLemburCommand({ ...KARYAWAN, text: "!lembur" });
    assert.ok(r.message.includes("ID:"));
  });

  let createdId;
  await test("simpan data untuk test hapus/edit", async () => {
    const r = await handleLemburCommand({
      ...KARYAWAN,
      text: "!l2 20:00-22:00 test hapus edit",
    });
    createdId = Number(r.message.match(/ID\s*:\s*(\d+)/)[1]);
    assert.ok(createdId > 0);
  });
  await test("orang lain tidak bisa hapus", async () => {
    const r = await handleLemburCommand({
      sender: "6282222222222@s.whatsapp.net",
      text: `!hapus ${createdId}`,
    });
    assert.ok(r.message.includes("milik sendiri"));
  });
  await test("pemilik bisa edit", async () => {
    const r = await handleLemburCommand({
      ...KARYAWAN,
      text: `!edit ${createdId}, 20:00-23:00, uraian baru`,
    });
    assert.ok(r.message.includes("uraian baru"));
  });
  await test("pemilik bisa hapus", async () => {
    const r = await handleLemburCommand({
      ...KARYAWAN,
      text: `!hapus ${createdId}`,
    });
    assert.ok(r.message.includes("berhasil dihapus"));
  });
  await test("hapus ID yang sudah dihapus → not found", async () => {
    const r = await handleLemburCommand({
      ...KARYAWAN,
      text: `!hapus ${createdId}`,
    });
    assert.ok(r.message.includes("tidak ditemukan"));
  });
  await test("command tidak dikenali → arahkan ke !bantuan", async () => {
    const r = await handleLemburCommand({ ...KARYAWAN, text: "!asalasalan" });
    assert.ok(r.message.includes("!bantuan"));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
