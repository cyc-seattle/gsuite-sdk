import { randomUUID } from "node:crypto";
import { Auth } from "googleapis";
import { DirectoryClient, GroupSettingsClient } from "../src/index.js";
import { ManualClock, WorkspaceModel, startFakeServer, type RunningFakeServer } from "../src/fake/index.js";

/** No wait between requests, and an immediate retry, so a scenario takes milliseconds. */
const FAST = { requestDelayMs: 0, retryDelayMs: 0 };

/** Refuses any URL outside the fake, so a client that lost its `rootUrl` fails instead of calling
 * Google. A UserRefreshClient because the clients' GoogleAuth type admits only Google's own classes. */
class FakeOnlyAuthClient extends Auth.UserRefreshClient {
  constructor(private readonly rootUrl: string) {
    super();
    this.setCredentials({ access_token: "fake-token" });
  }

  protected override async getRequestMetadataAsync(url?: string | URL | null) {
    if (!url || new URL(url).origin !== new URL(this.rootUrl).origin) {
      throw new Error(`Refusing a request outside the Workspace fake: ${url}`);
    }
    return super.getRequestMetadataAsync(url);
  }
}

export function fakeOnlyAuth(rootUrl: string): Auth.GoogleAuth {
  return new Auth.GoogleAuth({ authClient: new FakeOnlyAuthClient(rootUrl) });
}

/** One scenario's fake, clients, and what its steps have done. */
export class World {
  readonly runId = randomUUID().slice(0, 8);
  readonly clock = new ManualClock();
  readonly model = new WorkspaceModel({ clock: this.clock, pageSize: 2 });
  readonly groupEmails = new Map<string, string>();
  directory!: DirectoryClient;
  settings!: GroupSettingsClient;
  /** Names from the last list, or the error from the last add. */
  listed: string[] = [];
  error: unknown;
  private server!: RunningFakeServer;

  async start(): Promise<void> {
    this.server = await startFakeServer({ model: this.model });
    const { rootUrl } = this.server;
    const auth = fakeOnlyAuth(rootUrl);
    this.directory = new DirectoryClient(auth, { rootUrl, pacing: FAST });
    this.settings = new GroupSettingsClient(auth, { rootUrl, pacing: FAST });
  }

  async stop(): Promise<void> {
    await this.server.close();
  }

  /** A group's or person's email, unique to this run. */
  emailOf(name: string): string {
    return this.groupEmails.get(name) ?? `${slug(name)}-${this.runId}@example.org`;
  }

  newGroupEmail(name: string): string {
    const email = `${slug(name)}-${this.runId}@groups.example.org`;
    this.groupEmails.set(name, email);
    return email;
  }

  /** The plain name behind a run's email, as the feature file says it. */
  nameOf(email: string): string | undefined {
    for (const [name, groupEmail] of this.groupEmails) {
      if (groupEmail === email) {
        return name;
      }
    }
    const match = new RegExp(`^(.+)-${this.runId}@example\\.org$`).exec(email);
    return match?.[1] ? match[1][0]!.toUpperCase() + match[1].slice(1) : undefined;
  }
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

let current: World | undefined;

export async function startWorld(): Promise<void> {
  current = new World();
  await current.start();
}

export async function stopWorld(): Promise<void> {
  await current?.stop();
  current = undefined;
}

export function world(): World {
  if (!current) {
    throw new Error("No scenario is running");
  }
  return current;
}
