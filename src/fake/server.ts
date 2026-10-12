import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { GroupSettings } from "../directory.js";
import { FakeApiError } from "./errors.js";
import { WorkspaceModel } from "./model.js";

type Handler = (model: WorkspaceModel, match: string[], url: URL, body: unknown) => unknown;

interface Route {
  method: string;
  path: RegExp;
  handle: Handler;
}

const SEGMENT = "([^/]+)";

/** Exactly the Directory and Groups Settings calls the SDK makes. */
const ROUTES: Route[] = [
  {
    method: "GET",
    path: new RegExp(`^/admin/directory/v1/groups$`),
    handle: (model, _, url) =>
      model.listGroups({
        customer: query(url, "customer"),
        domain: query(url, "domain"),
        pageToken: query(url, "pageToken"),
        maxResults: numberQuery(url, "maxResults"),
      }),
  },
  {
    method: "POST",
    path: new RegExp(`^/admin/directory/v1/groups$`),
    handle: (model, _, __, body) => model.insertGroup(asObject(body)),
  },
  {
    method: "GET",
    path: new RegExp(`^/admin/directory/v1/groups/${SEGMENT}$`),
    handle: (model, [groupKey]) => model.getGroup(groupKey!),
  },
  {
    method: "GET",
    path: new RegExp(`^/admin/directory/v1/groups/${SEGMENT}/members$`),
    handle: (model, [groupKey], url) =>
      model.listMembers(groupKey!, {
        pageToken: query(url, "pageToken"),
        maxResults: numberQuery(url, "maxResults"),
      }),
  },
  {
    method: "POST",
    path: new RegExp(`^/admin/directory/v1/groups/${SEGMENT}/members$`),
    handle: (model, [groupKey], _, body) => model.insertMember(groupKey!, asObject(body)),
  },
  {
    method: "GET",
    path: new RegExp(`^/admin/directory/v1/groups/${SEGMENT}/members/${SEGMENT}$`),
    handle: (model, [groupKey, memberKey]) => model.getMember(groupKey!, memberKey!),
  },
  {
    method: "PUT",
    path: new RegExp(`^/admin/directory/v1/groups/${SEGMENT}/members/${SEGMENT}$`),
    handle: (model, [groupKey, memberKey], _, body) => model.updateMember(groupKey!, memberKey!, asObject(body)),
  },
  {
    method: "GET",
    path: new RegExp(`^/groups/v1/groups/${SEGMENT}$`),
    handle: (model, [groupUniqueId]) => model.getSettings(groupUniqueId!),
  },
  {
    method: "PATCH",
    path: new RegExp(`^/groups/v1/groups/${SEGMENT}$`),
    handle: (model, [groupUniqueId], _, body) => model.patchSettings(groupUniqueId!, asObject(body) as GroupSettings),
  },
];

/** An HTTP server that answers like Google's Directory and Groups Settings APIs, over `model`. */
export function createFakeServer(model: WorkspaceModel): Server {
  return createServer((request, response) => {
    handle(model, request, response).catch((error: unknown) => {
      sendError(response, new FakeApiError(500, "backendError", String(error)));
    });
  });
}

export interface StartFakeServerOptions {
  model?: WorkspaceModel;
  host?: string;
  /** 0, the default, picks a free port. */
  port?: number;
}

export interface RunningFakeServer {
  /** Pass this as the clients' `rootUrl`. */
  rootUrl: string;
  model: WorkspaceModel;
  close(): Promise<void>;
}

/** Starts a fake server, by default on a free loopback port, and says where it listens. */
export async function startFakeServer(options: StartFakeServerOptions = {}): Promise<RunningFakeServer> {
  const model = options.model ?? new WorkspaceModel();
  const host = options.host ?? "127.0.0.1";
  const server = createFakeServer(model);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, () => resolve());
  });
  const { port } = server.address() as AddressInfo;

  return {
    rootUrl: `http://${host.includes(":") ? `[${host}]` : host}:${port}/`,
    model,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

async function handle(model: WorkspaceModel, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://fake");
  const route = ROUTES.find((candidate) => candidate.method === request.method && candidate.path.test(url.pathname));
  if (!route) {
    sendError(response, new FakeApiError(404, "notFound", "Not Found"));
    return;
  }

  const raw = await readBody(request);
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : undefined;
  } catch {
    sendError(response, new FakeApiError(400, "parseError", "Parse Error"));
    return;
  }

  const match = route.path.exec(url.pathname)!.slice(1).map(decodeURIComponent);
  try {
    const result = route.handle(model, match, url, body);
    if (url.pathname.startsWith("/groups/v1/") && url.searchParams.get("alt") !== "json") {
      sendAtom(response, result as GroupSettings);
    } else {
      send(response, 200, result);
    }
  } catch (error) {
    if (error instanceof FakeApiError) {
      sendError(response, error);
      return;
    }
    throw error;
  }
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=UTF-8" });
  response.end(JSON.stringify(body));
}

// Groups Settings answers in Atom unless asked for JSON. So does the fake, so a client that forgets
// `alt=json` fails here as it would against Google.
function sendAtom(response: ServerResponse, settings: GroupSettings): void {
  const fields = Object.entries(settings)
    .filter(([key]) => key !== "kind")
    .map(([key, value]) => `<apps:${key}>${escapeXml(String(value))}</apps:${key}>`)
    .join("");
  response.writeHead(200, { "Content-Type": "application/atom+xml; charset=UTF-8" });
  response.end(
    `<?xml version="1.0" encoding="UTF-8"?><entry xmlns="http://www.w3.org/2005/Atom" xmlns:apps="http://schemas.google.com/apps/2006">${fields}</entry>`,
  );
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sendError(response: ServerResponse, error: FakeApiError): void {
  send(response, error.status, error.body);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function query(url: URL, name: string): string | undefined {
  return url.searchParams.get(name) ?? undefined;
}

function numberQuery(url: URL, name: string): number | undefined {
  const value = url.searchParams.get(name);
  return value === null ? undefined : Number(value);
}

function asObject(body: unknown): Record<string, string | null | undefined> {
  return typeof body === "object" && body !== null ? (body as Record<string, string>) : {};
}
