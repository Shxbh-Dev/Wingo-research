import { createClient } from "@supabase/supabase-js";

const API =
  "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SECRET_KEY environment variables."
  );
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

function normalize(rows) {
  return rows
    .map((x) => ({
      issue: String(
        x.issueNumber ??
        x.issue ??
        x.period ??
        ""
      ).trim(),

      result: Number(
        x.number ??
        x.result ??
        x.openNumber
      )
    }))
    .filter(
      (x) =>
        x.issue &&
        Number.isInteger(x.result) &&
        x.result >= 0 &&
        x.result <= 9
    );
}

function getSide(result) {
  return result >= 5 ? "BIG" : "SMALL";
}

async function fetchWinGo() {
  const url =
    API +
    (API.includes("?") ? "&" : "?") +
    "_=" +
    Date.now();

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`WinGo API HTTP ${response.status}`);
  }

  return response.json();
}

async function main() {
  console.log("Starting WinGo collector...");

  const json = await fetchWinGo();

  const raw =
    json?.data?.list ??
    json?.data ??
    json?.list ??
    [];

  if (!Array.isArray(raw)) {
    throw new Error("WinGo API returned an unexpected data format.");
  }

  const results = normalize(raw);

  if (!results.length) {
    throw new Error("No valid WinGo results found.");
  }

  console.log(`API returned ${results.length} valid results.`);

  const records = results.map((x) => ({
    issue: x.issue,
    result: x.result,
    side: getSide(x.result)
  }));

  /*
   * Upsert means:
   * - new periods are inserted
   * - already stored periods are ignored/updated
   * - duplicate periods are not created
   */
  const { data, error } = await supabase
    .from("wingo_results")
    .upsert(records, {
      onConflict: "issue"
    })
    .select();

  if (error) {
    throw new Error(
      `Supabase error: ${error.message}`
    );
  }

  console.log(
    `Successfully stored ${data?.length ?? 0} records.`
  );

  /*
   * Verify database count.
   */
  const { count, error: countError } = await supabase
    .from("wingo_results")
    .select("*", {
      count: "exact",
      head: true
    });

  if (countError) {
    console.warn(
      "Could not read database count:",
      countError.message
    );
  } else {
    console.log(
      `Total stored WinGo results: ${count}`
    );
  }

  console.log("Collector finished successfully.");
}

main().catch((error) => {
  console.error("COLLECTOR FAILED:");
  console.error(error);
  process.exit(1);
});
