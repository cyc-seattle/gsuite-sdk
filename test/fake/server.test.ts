import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ManualClock, WorkspaceModel, startFakeServer, type RunningFakeServer } from "../../src/fake/index.js";

let server: RunningFakeServer;

beforeEach(async () => {
  const model = new WorkspaceModel({ clock: new ManualClock(), pageSize: 1 });
  model.insertGroup({ email: "sailors@example.org" }, { settled: true });
  model.insertGroup({ email: "coaches@example.org" }, { settled: true });
  server = await startFakeServer({ model });
});

afterEach(async () => {
  await server.close();
});

async function call(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; type: string; body: unknown }> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  const response = await fetch(new URL(path, server.rootUrl), init);
  const type = response.headers.get("content-type") ?? "";
  return {
    status: response.status,
    type,
    body: type.startsWith("application/json") ? await response.json() : await response.text(),
  };
}

describe("startFakeServer", () => {
  it("listens on a free loopback port", () => {
    expect(server.rootUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(server.rootUrl).not.toBe("http://127.0.0.1:0/");
  });
});

describe("Directory API", () => {
  it("lists groups a page at a time", async () => {
    const first = await call("GET", "/admin/directory/v1/groups?customer=my_customer");
    const token = (first.body as { nextPageToken: string }).nextPageToken;
    const second = await call("GET", `/admin/directory/v1/groups?customer=my_customer&pageToken=${token}`);

    expect(first.body).toMatchObject({ groups: [{ email: "coaches@example.org" }] });
    expect(second.body).toMatchObject({ groups: [{ email: "sailors@example.org" }] });
    expect(second.body).not.toHaveProperty("nextPageToken");
  });

  it("creates and gets a group", async () => {
    const created = await call("POST", "/admin/directory/v1/groups", { email: "new@example.org", name: "New" });
    const fetched = await call("GET", "/admin/directory/v1/groups/new%40example.org");

    expect(created.status).toBe(200);
    expect(fetched.body).toEqual(created.body);
  });

  it("inserts, lists, gets, and updates members", async () => {
    const path = "/admin/directory/v1/groups/sailors%40example.org/members";

    expect((await call("POST", path, { email: "ann@example.org", role: "MEMBER" })).status).toBe(200);
    expect((await call("PUT", `${path}/ann%40example.org`, { role: "OWNER" })).body).toMatchObject({ role: "OWNER" });
    expect((await call("GET", `${path}/ann%40example.org`)).body).toMatchObject({
      email: "ann@example.org",
      role: "OWNER",
    });
    expect((await call("GET", path)).body).toMatchObject({ members: [{ email: "ann@example.org" }] });
  });

  it("sends the model's errors with Google's status and body", async () => {
    const response = await call("GET", "/admin/directory/v1/groups/missing%40example.org");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: 404, errors: [{ reason: "notFound" }] } });
  });

  it("answers 400 for a body that isn't JSON", async () => {
    expect((await call("POST", "/admin/directory/v1/groups", "{")).status).toBe(400);
  });
});

describe("Groups Settings API", () => {
  it("gets and patches settings as JSON", async () => {
    const path = "/groups/v1/groups/sailors%40example.org?alt=json";

    const patched = await call("PATCH", path, { whoCanJoin: "INVITED_CAN_JOIN" });
    const fetched = await call("GET", path);

    expect(patched.body).toMatchObject({ whoCanJoin: "INVITED_CAN_JOIN" });
    expect(fetched.body).toEqual(patched.body);
  });

  it("answers in Atom without alt=json, as Google does", async () => {
    const response = await call("GET", "/groups/v1/groups/sailors%40example.org");

    expect(response.type).toMatch(/^application\/atom\+xml/);
    expect(response.body).toContain("<apps:email>sailors@example.org</apps:email>");
  });
});

it("answers 404 for a path the SDK doesn't call", async () => {
  expect((await call("DELETE", "/admin/directory/v1/groups/sailors%40example.org")).status).toBe(404);
  expect((await call("GET", "/admin/directory/v1/users")).status).toBe(404);
});
