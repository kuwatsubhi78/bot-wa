function nowWIB() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

function todayISO() {
  const wib = nowWIB();
  return `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, "0")}-${String(wib.getUTCDate()).padStart(2, "0")}`;
}

function yesterdayISO() {
  const wib = nowWIB();
  wib.setUTCDate(wib.getUTCDate() - 1);
  return `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, "0")}-${String(wib.getUTCDate()).padStart(2, "0")}`;
}

module.exports = { nowWIB, todayISO, yesterdayISO };
