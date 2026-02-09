const BASE = process.env.API_URL || "http://localhost:5000";

interface TestResult {
  name: string;
  pass: boolean;
  detail?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertErrorShape(body: any, expectedCode: string) {
  assert(body.ok === false, `Expected ok=false, got ${JSON.stringify(body.ok)}`);
  assert(body.error && typeof body.error === "object", "Missing error object");
  assert(typeof body.error.code === "string", "Missing error.code string");
  assert(typeof body.error.message === "string", "Missing error.message string");
  assert(body.error.code === expectedCode, `Expected code=${expectedCode}, got ${body.error.code}`);
}

async function run(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, pass: true });
  } catch (e: any) {
    results.push({ name, pass: false, detail: e.message });
  }
}

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

(async () => {
  console.log(`\nSmoke Tests — ${BASE}\n${"=".repeat(40)}\n`);

  await run("GET /api/solos returns array", async () => {
    const { status, body } = await api("/api/solos");
    assert(status === 200, `Expected 200, got ${status}`);
    assert(Array.isArray(body), "Expected array response");
  });

  await run("POST /api/auth/login — missing body returns BAD_REQUEST", async () => {
    const { status, body } = await api("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert(status === 400, `Expected 400, got ${status}`);
    assertErrorShape(body, "BAD_REQUEST");
  });

  await run("POST /api/auth/login — wrong creds returns UNAUTHORIZED", async () => {
    const { status, body } = await api("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "no-one@test.dev", password: "wrong123" }),
    });
    assert(status === 401, `Expected 401, got ${status}`);
    assertErrorShape(body, "UNAUTHORIZED");
  });

  await run("POST /api/auth/signup — short password returns VALIDATION_ERROR", async () => {
    const { status, body } = await api("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@test.dev", password: "abc" }),
    });
    assert(status === 400, `Expected 400, got ${status}`);
    assertErrorShape(body, "VALIDATION_ERROR");
    assert(body.error.details?.fields?.password, "Expected password field error details");
  });

  await run("GET /api/solos/:id/status — not found returns NOT_FOUND", async () => {
    const { status, body } = await api("/api/solos/00000000-0000-0000-0000-000000000000/status");
    assert(status === 404, `Expected 404, got ${status}`);
    assertErrorShape(body, "NOT_FOUND");
  });

  await run("POST /api/solos/:id/retry — no auth returns UNAUTHORIZED", async () => {
    const { status, body } = await api("/api/solos/test/retry", { method: "POST" });
    assert(status === 401, `Expected 401, got ${status}`);
    assertErrorShape(body, "UNAUTHORIZED");
  });

  await run("DELETE /api/solos/:id — no auth returns UNAUTHORIZED", async () => {
    const { status, body } = await api("/api/solos/test", { method: "DELETE" });
    assert(status === 401, `Expected 401, got ${status}`);
    assertErrorShape(body, "UNAUTHORIZED");
  });

  await run("GET /api/admin/stats — no auth returns UNAUTHORIZED", async () => {
    const { status, body } = await api("/api/admin/stats");
    assert(status === 401, `Expected 401, got ${status}`);
    assertErrorShape(body, "UNAUTHORIZED");
  });

  await run("GET /api/vibes returns array", async () => {
    const { status, body } = await api("/api/vibes");
    assert(status === 200, `Expected 200, got ${status}`);
    assert(Array.isArray(body), "Expected array response");
  });

  await run("GET /api/solos/:id/status — existing solo returns status object", async () => {
    const { body: solos } = await api("/api/solos");
    if (!Array.isArray(solos) || solos.length === 0) {
      console.log("  (skipped — no solos in database)");
      return;
    }
    const { status, body } = await api(`/api/solos/${solos[0].id}/status`);
    assert(status === 200, `Expected 200, got ${status}`);
    assert(typeof body.status === "string", "Missing status field");
    assert(["queued", "processing", "ready", "failed"].includes(body.status), `Unexpected status: ${body.status}`);
  });

  console.log("");
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const icon = r.pass ? "PASS" : "FAIL";
    console.log(`  [${icon}] ${r.name}`);
    if (!r.pass && r.detail) console.log(`         ${r.detail}`);
    if (r.pass) passed++;
    else failed++;
  }

  console.log(`\n${passed} passed, ${failed} failed out of ${results.length} tests\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
