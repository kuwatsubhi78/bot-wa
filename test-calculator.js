const assert = require("assert");
const { hitungLembur } = require("./src/utils/calculator");

const cases = [
  {
    label: "20:00-22:00",
    input: ["20:00", "22:00"],
    expected: {
      totalJam: 2,
      uangLembur: 31312,
      uangMakan: 0,
      totalDiterima: 31312,
    },
  },
  {
    label: "18:00-21:30",
    input: ["18:00", "21:30"],
    expected: {
      totalJam: 3.5,
      uangLembur: 54796,
      uangMakan: 6000,
      totalDiterima: 60796,
    },
  },
  {
    label: "22:00-01:00",
    input: ["22:00", "01:00"],
    expected: {
      totalJam: 3,
      uangLembur: 46968,
      uangMakan: 0,
      totalDiterima: 46968,
    },
  },
];

for (const testCase of cases) {
  const result = hitungLembur(...testCase.input);
  assert.strictEqual(result.totalJam, testCase.expected.totalJam);
  assert.strictEqual(result.uangLembur, testCase.expected.uangLembur);
  assert.strictEqual(result.uangMakan, testCase.expected.uangMakan);
  assert.strictEqual(result.totalDiterima, testCase.expected.totalDiterima);
  console.log(`${testCase.label}: OK`);
}

console.log("Semua test kalkulator berhasil.");
