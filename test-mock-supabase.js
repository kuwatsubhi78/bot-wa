function createMockSupabase(seed = {}) {
  const tables = {
    lembur: seed.lembur || [],
    karyawan: seed.karyawan || [],
    kode_pekerjaan: seed.kode_pekerjaan || [],
  };

  let nextId = Math.max(0, ...tables.lembur.map((r) => Number(r.id) || 0)) + 1;

  function matchFilters(row, filters) {
    return filters.every((f) => {
      if (f.op === "eq") return row[f.col] === f.val;
      if (f.op === "gte") return row[f.col] >= f.val;
      if (f.op === "lte") return row[f.col] <= f.val;
      return true;
    });
  }

  function from(table) {
    if (!tables[table]) tables[table] = [];
    const state = {
      filters: [],
      mode: null,
      insertRows: null,
      updateData: null,
      upsertRows: null,
      single: false,
      maybeSingleFlag: false,
    };

    const builder = {
      select() {
        if (!state.mode) state.mode = "select";
        return builder;
      },
      eq(col, val) {
        state.filters.push({ col, op: "eq", val });
        return builder;
      },
      gte(col, val) {
        state.filters.push({ col, op: "gte", val });
        return builder;
      },
      lte(col, val) {
        state.filters.push({ col, op: "lte", val });
        return builder;
      },
      order() {
        return builder;
      },
      insert(rows) {
        state.mode = "insert";
        state.insertRows = rows;
        return builder;
      },
      upsert(rows, opts) {
        state.mode = "upsert";
        state.upsertRows = rows;
        state.onConflict = opts?.onConflict;
        return builder;
      },
      update(data) {
        state.mode = "update";
        state.updateData = data;
        return builder;
      },
      delete() {
        state.mode = "delete";
        return builder;
      },
      single() {
        state.single = true;
        return execute();
      },
      maybeSingle() {
        state.maybeSingleFlag = true;
        return execute();
      },
      then(resolve, reject) {
        return execute().then(resolve, reject);
      },
    };

    async function execute() {
      try {
        if (state.mode === "insert") {
          const inserted = state.insertRows.map((r) => ({
            id: nextId++,
            ...r,
          }));
          tables[table].push(...inserted);
          return state.single
            ? { data: inserted[0], error: null }
            : { data: inserted, error: null };
        }
        if (state.mode === "upsert") {
          const conflictCol = state.onConflict || "id";
          const results = [];
          for (const row of state.upsertRows) {
            const idx = tables[table].findIndex(
              (r) => r[conflictCol] === row[conflictCol],
            );
            if (idx >= 0) {
              tables[table][idx] = { ...tables[table][idx], ...row };
              results.push(tables[table][idx]);
            } else {
              const newRow = { id: nextId++, ...row };
              tables[table].push(newRow);
              results.push(newRow);
            }
          }
          return state.single
            ? { data: results[0], error: null }
            : { data: results, error: null };
        }
        if (state.mode === "update") {
          const matched = tables[table].filter((r) =>
            matchFilters(r, state.filters),
          );
          matched.forEach((r) => Object.assign(r, state.updateData));
          return state.single
            ? { data: matched[0] || null, error: null }
            : { data: matched, error: null };
        }
        if (state.mode === "delete") {
          tables[table] = tables[table].filter(
            (r) => !matchFilters(r, state.filters),
          );
          return { data: null, error: null };
        }
        // select
        const rows = tables[table].filter((r) =>
          matchFilters(r, state.filters),
        );
        if (state.maybeSingleFlag)
          return { data: rows[0] || null, error: null };
        if (state.single) return { data: rows[0] || null, error: null };
        return { data: rows, error: null };
      } catch (err) {
        return { data: null, error: { message: err.message } };
      }
    }

    return builder;
  }

  return { from, _tables: tables };
}

module.exports = { createMockSupabase };
