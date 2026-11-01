# @cyc-seattle/gsuite-sdk

Typed wrappers around Google Workspace APIs: Calendar, Sheets, the Admin SDK Directory, and Group Settings.

```sh
pnpm add @cyc-seattle/gsuite-sdk
```

Every client takes a `GoogleAuth` instance from `googleapis`. It uses Application Default Credentials (ADC) unless you pass a key. Set `scopes` for the APIs you call.

## Spreadsheets

```ts
import { SpreadsheetClient, type Row } from "@cyc-seattle/gsuite-sdk";
import { google } from "googleapis";

interface Camp extends Row {
  name: string;
  start: string;
}

const auth = new google.auth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const spreadsheet = await new SpreadsheetClient(auth).loadSpreadsheet("<spreadsheet URL or ID>");
const worksheet = await spreadsheet.getOrCreateWorksheet<Camp>("Camps", ["name", "start"]);
const table = await worksheet.getTable();
```

## Calendar

```ts
import { CalendarClient } from "@cyc-seattle/gsuite-sdk";

const calendar = new CalendarClient(auth).loadCalendar("<calendar ID>");
const events = await calendar.listEvents();
```

## Directory and Group Settings

```ts
import { DirectoryClient, GroupSettingsClient } from "@cyc-seattle/gsuite-sdk";

const auth = new google.auth.GoogleAuth({
  scopes: [
    "https://www.googleapis.com/auth/admin.directory.group",
    "https://www.googleapis.com/auth/apps.groups.settings",
  ],
});
const members = await new DirectoryClient(auth).listMembers("team@example.org");
const settings = await new GroupSettingsClient(auth).getSettings("team@example.org");
```

### Client options

`DirectoryClient` and `GroupSettingsClient` take an optional second argument:

- `rootUrl` sends requests somewhere other than Google, such as the [Workspace fake](#workspace-fake). googleapis uses only its origin.
- `pacing` sets `safeCall`'s waits: `requestDelayMs` before every request (default 500) and `retryDelayMs` before the retry of a transient error (default 60000).

```ts
const directory = new DirectoryClient(auth, { rootUrl, pacing: { requestDelayMs: 0, retryDelayMs: 0 } });
```

## Retries

`safeCall` wraps a request. It waits between requests and retries transient errors, such as rate limits and 5xx responses.

```ts
import { safeCall } from "@cyc-seattle/gsuite-sdk";

await safeCall(() => row.save());
```

`safeCall(request, pacing)` takes the same `pacing` as the clients.

## Workspace fake

`@cyc-seattle/gsuite-sdk/fake` stands in for the Directory and Groups Settings APIs. It serves the calls that `DirectoryClient` and `GroupSettingsClient` make, from memory.

```ts
import { ManualClock, WorkspaceModel, startFakeServer } from "@cyc-seattle/gsuite-sdk/fake";

const clock = new ManualClock();
const fake = await startFakeServer({ model: new WorkspaceModel({ clock }) });
const directory = new DirectoryClient(auth, { rootUrl: fake.rootUrl, pacing: { requestDelayMs: 0, retryDelayMs: 0 } });
// ...
await fake.close();
```

`startFakeServer` listens on a free loopback port unless given `host` and `port`. The clients still need an auth object, but the fake ignores its token. A `GoogleAuth` whose `authClient` is a `UserRefreshClient` holding any access token needs no ADC. `test/features/world.ts` builds one.

`WorkspaceModel` holds the groups, members, and settings. Use it directly in unit tests, or seed it before a test: pass `{ settled: true }` to `insertGroup` or `insertMember` to skip the new-group delay. Its options:

| Option            | Default    | What it does                                                          |
| ----------------- | ---------- | --------------------------------------------------------------------- |
| `clock`           | the system | Where the model reads the time. `ManualClock` moves on `advance(ms)`. |
| `newGroupDelayMs` | 60000      | How long a new group refuses member inserts                           |
| `pageSize`        | 200        | The largest page a list returns                                       |

It answers as Google does:

| Case                                       | Status | Reason            | Message                          |
| ------------------------------------------ | ------ | ----------------- | -------------------------------- |
| An unknown group                           | 404    | `notFound`        | `Resource Not Found: groupKey`   |
| An unknown member                          | 404    | `notFound`        | `Resource Not Found: memberKey`  |
| A member insert into a group still too new | 404    | `notFound`        | `Resource Not Found: groupKey`   |
| A member who's already in the group        | 409    | `duplicate`       | `Member already exists.`         |
| A group that already exists                | 409    | `duplicate`       | `Entity already exists.`         |
| A membership that would make a cycle       | 412    | `conditionNotMet` | `Cyclic memberships not allowed` |
| Settings of an unknown group               | 404    | `notFound`        | `Not Found`                      |

Google doesn't document the cycle's status or the settings 404's message. The fake follows the JSON API's conventions for them.

Derived membership isn't modeled, because the SDK reads only direct members.

Groups Settings answers in Atom XML unless the request asks for `alt=json`, like Google.

### Container image

Every release publishes `ghcr.io/cyc-seattle/workspace-fake:<version>` and `:latest`, built from the `Dockerfile`. The fake ignores auth tokens, so any bearer token works.

- It listens on port 8080. `PORT` changes that.
- `NEW_GROUP_DELAY_MS` sets how long a new group refuses member inserts (default 60000). Set it to `0` to seed a group and its members at once.
- `GET /healthz` returns 200.
- It runs as uid 1000 and writes no files, so it works with a read-only root filesystem and all capabilities dropped.
- Seed it through the Directory API: `POST /admin/directory/v1/groups`, then `POST .../groups/<group>/members`.

```sh
docker run -p 8080:8080 -e NEW_GROUP_DELAY_MS=0 ghcr.io/cyc-seattle/workspace-fake
```

## Development

`mise run test` runs the unit tests in `test/`. `mise run integration` runs the Gherkin features in `features/` against the fake, which starts in the test process. `mise run ci` runs both, after `check`. See `AGENTS.md`.

## Release

Every merge to `main` releases from the PR title, once CI passes. The title must be a conventional commit. `fix:` makes a patch release, `feat:` a minor release, and a `!` after the type a major release. Types such as `docs:`, `build:`, and `test:` release nothing. semantic-release publishes to npm and creates the GitHub release.
