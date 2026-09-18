const WIN_GO_API =
  "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is missing.");
}

if (!SUPABASE_SECRET_KEY) {
  throw new Error("SUPABASE_SECRET_KEY is missing.");
}

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

async function getWinGoResults() {
  const url =
    WIN_GO_API +
    (WIN_GO_API.includes("?") ? "&" : "?") +
    "pageNo=1&pageSize=50&_=" +
    Date.now();

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json, text/plain, */*",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36"
    }
  });

  console.log("WinGo HTTP status:", response.status);
  console.log(
    "WinGo content-type:",
    response.headers.get("content-type")
  );

  const body = await response.text();

  console.log(
    "WinGo response preview:",
    body.substring(0, 1000)
  );

  if (!response.ok) {
    throw new Error(
      `WinGo API returned HTTP ${response.status}`
    );
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error("WinGo returned non-JSON data.");
  }
}
async function saveToSupabase(records) {
  const url =
    `${SUPABASE_URL}/rest/v1/wingo_results` +
    "?on_conflict=issue";

  const response = await fetch(url, {
    method: "POST",

    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,

      "Content-Type": "application/json",

      Prefer: "resolution=merge-duplicates,return=minimal"
    },

    body: JSON.stringify(records)
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Supabase HTTP ${response.status}: ${errorText}`
    );
  }
}

async function getDatabaseCount() {
  const url =
    `${SUPABASE_URL}/rest/v1/wingo_results` +
    "?select=id";

  const response = await fetch(url, {
    method: "HEAD",

    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,

      Prefer: "count=exact"
    }
  });

  if (!response.ok) {
    return null;
  }

  const range = response.headers.get("content-range");

  if (!range) {
    return null;
  }

  const total = range.split("/")[1];

  return total === "*" ? null : Number(total);
}

async function main() {
  console.log("=================================");
  console.log("WinGo Collector Starting");
  console.log("=================================");

  const json = await getWinGoResults();

  const raw =
    json?.data?.list ??
    json?.data ??
    json?.list ??
    [];

  if (!Array.isArray(raw)) {
    throw new Error(
      "Unexpected WinGo API response format."
    );
  }

  const results = normalize(raw);

  console.log(
    `Valid results received: ${results.length}`
  );

  if (!results.length) {
    throw new Error(
      "WinGo API returned zero valid results."
    );
  }

  const records = results.map((x) => ({
    issue: x.issue,
    result: x.result,
    side: getSide(x.result)
  }));

  console.log(
    `Sending ${records.length} records to Supabase...`
  );

  await saveToSupabase(records);

  console.log("Supabase save successful.");

  const count = await getDatabaseCount();

  if (count !== null) {
    console.log(
      `Total records currently stored: ${count}`
    );
  }

  console.log("=================================");
  console.log("Collector completed successfully");
  console.log("=================================");
}

main().catch((error) => {
  console.error("");
  console.error("❌ COLLECTOR FAILED");
  console.error(error);
  console.error("");
  process.exit(1);
});
