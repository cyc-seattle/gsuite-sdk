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

## Retries

`safeCall` wraps a request. It waits between requests and retries transient errors, such as rate limits and 5xx responses.

```ts
import { safeCall } from "@cyc-seattle/gsuite-sdk";

await safeCall(() => row.save());
```

## Release

Every merge to `main` releases from the PR title. The title must be a conventional commit. `fix:` makes a patch release, `feat:` a minor release, and a `!` after the type a major release. Types such as `docs:`, `build:`, and `test:` release nothing. semantic-release publishes to npm and creates the GitHub release.
