const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function initSupabase() {
  if (!supabaseUrl || !supabaseKey) {
    console.log("SUPABASE ENV BELUM DIATUR");
    return null;
  }

  console.log("Supabase Connected");
  return supabase;
}

module.exports = {
  supabase,
  initSupabase,
};
