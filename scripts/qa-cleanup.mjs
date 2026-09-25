// Each UI test owns only imports made by its own page. Never remove a user's library files.
export async function trackTestData(page, origin = "http://127.0.0.1:5189") {
  const health = await (await fetch(origin + "/api/health")).json();
  if (!health.dataDir.includes("/.qa-runs/"))
    throw Error(
      "UI tests require an isolated library. Start the server with LUMA_DATA_DIR set to an absolute .qa-runs/<run>/Library path.",
    );
  const ids = new Set();
  const beforePrefs = await (await fetch(origin + "/api/preferences")).json();
  const response = async (r) => {
    try {
      const u = new URL(r.url());
      if (
        !u.pathname.startsWith("/api/import") &&
        !u.pathname.startsWith("/api/jobs/")
      )
        return;
      const d = await r.json();
      if (d.score?.id) ids.add(d.score.id);
      if (d.scores) for (const s of d.scores) ids.add(s.id);
    } catch {}
  };
  page.on("response", response);
  return async () => {
    page.off("response", response);
    for (const id of ids)
      await fetch(origin + "/api/scores/" + id, { method: "DELETE" });
    await fetch(origin + "/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(beforePrefs),
    });
  };
}
