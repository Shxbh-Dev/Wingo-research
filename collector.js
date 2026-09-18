const WIN_GO_API =
  "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is missing");
}

if (!SUPABASE_SECRET_KEY) {
  throw new Error("SUPABASE_SECRET_KEY is missing");
}

function normalize(list) {
  return list
    .map((item) => ({
      issue: String(item?.issueNumber ?? "").trim(),
      result: Number(item?.number)
    }))
    .filter(
      (x) =>
        x.issue &&
        Number.isInteger(x.result) &&
        x.result >= 0 &&
        x.result <= 9
    );
}

function getSide(number) {
  return number >= 5 ? "BIG" : "SMALL";
}

async function getWinGoResults() {
  const url =
    WIN_GO_API +
    "?_=" +
    Date.now();

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json, text/plain, */*",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36"
    }
  });

  const body = await response.text();

  if (!response.ok) {
    console.error("WinGo HTTP status:", response.status);
    console.error("WinGo response:", body.slice(0, 1000));

    throw new Error(
      `WinGo API returned HTTP ${response.status}`
    );
  }

  let json;

  try {
    json = JSON.parse(body);
  } catch {
    console.error("Invalid JSON response:");
    console.error(body.slice(0, 1000));
    throw new Error("WinGo API did not return JSON");
  }

  return json;
}

async function saveToSupabase(records) {
  const url =
    `${SUPABASE_URL}/rest/v1/wingo_results` +
    "?on_conflict=issue";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_SECRET_KEY,
      "Authorization": `Bearer ${SUPABASE_SECRET_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(records)
  });

  if (!response.ok) {
    const error = await response.text();

    throw new Error(
      `Supabase HTTP ${response.status}: ${error}`
    );
  }
}

async function main() {
  console.log("================================");
  console.log("WIN GO 24/7 COLLECTOR");
  console.log("================================");

  console.log("API:");
  console.log(WIN_GO_API);

  const json = await getWinGoResults();

  /*
   * EXACT structure used by NEW LOGIC AI.html:
   *
   * data.data.list
   *
   * item.issueNumber
   * item.number
   */
  const list =
    json?.data?.list;

  if (!Array.isArray(list)) {
    console.error(
      "Unexpected API structure:"
    );

    console.error(
      JSON.stringify(json).slice(0, 2000)
    );

    throw new Error(
      "data.data.list was not found"
    );
  }

  console.log(
    `API records received: ${list.length}`
  );

  const results = normalize(list);

  if (!results.length) {
    throw new Error(
      "No valid WinGo records found"
    );
  }

  console.log(
    `Valid records: ${results.length}`
  );

  /*
   * Convert to Supabase format.
   */
  const records = results.map((x) => ({
    issue: x.issue,
    result: x.result,
    side: getSide(x.result)
  }));

  /*
   * Send the complete returned history.
   *
   * Because issue is UNIQUE and on_conflict=issue,
   * old records are updated and new periods are inserted.
   */
  await saveToSupabase(records);

  console.log(
    `Saved ${records.length} records to Supabase`
  );

  console.log(
    `Latest issue: ${results[0].issue}`
  );

  console.log(
    `Latest number: ${results[0].result}`
  );

  console.log(
    `Latest side: ${getSide(results[0].result)}`
  );

  console.log("================================");
  console.log("COLLECTION SUCCESS");
  console.log("================================");
}

main().catch((error) => {
  console.error("");
  console.error("❌ COLLECTOR FAILED");
  console.error(error);
  console.error("");

  process.exit(1);
});
