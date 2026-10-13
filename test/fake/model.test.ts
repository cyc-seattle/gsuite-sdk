import { describe, it, expect, beforeEach } from "vitest";
import { FakeApiError, ManualClock, WorkspaceModel } from "../../src/fake/index.js";
import { GROUP_SETTINGS_TEMPLATES } from "../../src/index.js";

const MINUTE = 60_000;

let clock: ManualClock;
let model: WorkspaceModel;

beforeEach(() => {
  clock = new ManualClock();
  model = new WorkspaceModel({ clock, newGroupDelayMs: MINUTE, pageSize: 2 });
});

function errorOf(call: () => unknown): FakeApiError {
  try {
    call();
  } catch (error) {
    if (error instanceof FakeApiError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a FakeApiError");
}

function seedGroup(email: string): void {
  model.insertGroup({ email }, { settled: true });
}

function memberEmails(groupKey: string): string[] {
  return (model.listMembers(groupKey, { maxResults: 2 }).members ?? []).map((member) => member.email);
}

describe("groups", () => {
  it("gets a group by email, in any case, or by ID", () => {
    const created = model.insertGroup({ email: "Sailors@example.org", name: "Sailors" });

    expect(model.getGroup("sailors@example.org")).toEqual(created);
    expect(model.getGroup(created.id)).toEqual(created);
    expect(created).toMatchObject({ email: "Sailors@example.org", name: "Sailors", directMembersCount: "0" });
  });

  it("answers 404 for an unknown group", () => {
    expect(errorOf(() => model.getGroup("missing@example.org")).body).toEqual({
      error: {
        code: 404,
        message: "Resource Not Found: groupKey",
        errors: [{ message: "Resource Not Found: groupKey", domain: "global", reason: "notFound" }],
      },
    });
  });

  it("answers 409 for a group that exists", () => {
    seedGroup("sailors@example.org");

    expect(errorOf(() => model.insertGroup({ email: "sailors@example.org" }))).toMatchObject({
      status: 409,
      reason: "duplicate",
    });
  });

  it("pages through groups in email order", () => {
    for (const name of ["e", "c", "a", "d", "b"]) {
      seedGroup(`${name}@example.org`);
    }

    const emails: string[] = [];
    let pageToken: string | undefined;
    let pages = 0;
    do {
      const page = model.listGroups({ customer: "my_customer", pageToken });
      emails.push(...(page.groups ?? []).map((group) => group.email));
      pageToken = page.nextPageToken;
      pages++;
    } while (pageToken);

    expect(pages).toBe(3);
    expect(emails).toEqual(["a", "b", "c", "d", "e"].map((name) => `${name}@example.org`));
  });

  it("leaves the list out when there are no groups", () => {
    expect(model.listGroups({ customer: "my_customer" })).toEqual({ kind: "admin#directory#groups" });
  });

  it("needs a customer or domain to list groups", () => {
    expect(errorOf(() => model.listGroups({})).status).toBe(400);
  });

  it("rejects a page token it didn't issue", () => {
    expect(errorOf(() => model.listGroups({ customer: "my_customer", pageToken: "nonsense" })).status).toBe(400);
  });
});

describe("members", () => {
  beforeEach(() => {
    seedGroup("sailors@example.org");
  });

  it("adds a person as a USER with the given role", () => {
    const member = model.insertMember("sailors@example.org", { email: "ann@example.org", role: "MANAGER" });

    expect(member).toMatchObject({ email: "ann@example.org", role: "MANAGER", type: "USER", status: "ACTIVE" });
    expect(model.getMember("sailors@example.org", "ANN@example.org")).toEqual(member);
  });

  it("defaults the role to MEMBER", () => {
    expect(model.insertMember("sailors@example.org", { email: "ann@example.org" }).role).toBe("MEMBER");
  });

  it("gives a person the same ID in every group", () => {
    seedGroup("coaches@example.org");

    const first = model.insertMember("sailors@example.org", { email: "ann@example.org" });
    const second = model.insertMember("coaches@example.org", { email: "ann@example.org" });

    expect(second.id).toBe(first.id);
    expect(model.getMember("coaches@example.org", first.id)).toEqual(second);
  });

  it("answers 409 for a member already in the group", () => {
    model.insertMember("sailors@example.org", { email: "ann@example.org" });

    expect(errorOf(() => model.insertMember("sailors@example.org", { email: "ann@example.org" })).body).toEqual({
      error: {
        code: 409,
        message: "Member already exists.",
        errors: [{ message: "Member already exists.", domain: "global", reason: "duplicate" }],
      },
    });
  });

  it("answers 404 for an unknown group or member", () => {
    expect(errorOf(() => model.insertMember("missing@example.org", { email: "ann@example.org" })).message).toBe(
      "Resource Not Found: groupKey",
    );
    expect(errorOf(() => model.listMembers("missing@example.org")).status).toBe(404);
    expect(errorOf(() => model.getMember("sailors@example.org", "ann@example.org")).message).toBe(
      "Resource Not Found: memberKey",
    );
    expect(errorOf(() => model.updateMember("sailors@example.org", "ann@example.org", { role: "OWNER" })).status).toBe(
      404,
    );
  });

  it("rejects a role Google doesn't have", () => {
    expect(
      errorOf(() => model.insertMember("sailors@example.org", { email: "ann@example.org", role: "ADMIN" })).status,
    ).toBe(400);
  });

  it("updates a member's role", () => {
    model.insertMember("sailors@example.org", { email: "ann@example.org" });

    model.updateMember("sailors@example.org", "ann@example.org", { role: "OWNER" });

    expect(model.getMember("sailors@example.org", "ann@example.org").role).toBe("OWNER");
  });

  it("pages through members in the order they were added", () => {
    for (const name of ["c", "a", "b"]) {
      model.insertMember("sailors@example.org", { email: `${name}@example.org` });
    }

    const first = model.listMembers("sailors@example.org");
    const second = model.listMembers("sailors@example.org", { pageToken: first.nextPageToken });

    expect(first.members?.map((member) => member.email)).toEqual(["c@example.org", "a@example.org"]);
    expect(second.members?.map((member) => member.email)).toEqual(["b@example.org"]);
    expect(second.nextPageToken).toBeUndefined();
  });

  it("leaves the list out when a group has no members", () => {
    expect(model.listMembers("sailors@example.org")).toEqual({ kind: "admin#directory#members" });
  });
});

describe("a new group", () => {
  it("refuses members with a 404 until its delay passes", () => {
    model.insertGroup({ email: "new@example.org" });

    clock.advance(MINUTE - 1);
    expect(errorOf(() => model.insertMember("new@example.org", { email: "ann@example.org" }))).toMatchObject({
      status: 404,
      message: "Resource Not Found: groupKey",
    });
    expect(model.getGroup("new@example.org").email).toBe("new@example.org");

    clock.advance(1);
    expect(model.insertMember("new@example.org", { email: "ann@example.org" }).email).toBe("ann@example.org");
  });

  it("accepts members at once when seeded as settled", () => {
    seedGroup("new@example.org");

    expect(model.insertMember("new@example.org", { email: "ann@example.org" }).email).toBe("ann@example.org");
  });
});

describe("nested groups", () => {
  beforeEach(() => {
    seedGroup("program@example.org");
    seedGroup("class@example.org");
  });

  it("lists a nested group as a direct member at once", () => {
    model.insertMember("program@example.org", { email: "class@example.org" });

    expect(model.getMember("program@example.org", "class@example.org")).toMatchObject({ type: "GROUP" });
    expect(memberEmails("program@example.org")).toEqual(["class@example.org"]);
  });

  it("gives a nested group the group's ID", () => {
    const member = model.insertMember("program@example.org", { email: "class@example.org" }, { settled: true });

    expect(member.id).toBe(model.getGroup("class@example.org").id);
  });
});

describe("membership cycles", () => {
  beforeEach(() => {
    for (const name of ["a", "b", "c"]) {
      seedGroup(`${name}@example.org`);
    }
  });

  const cycle = {
    error: {
      code: 412,
      message: "Cyclic memberships not allowed",
      errors: [{ message: "Cyclic memberships not allowed", domain: "global", reason: "conditionNotMet" }],
    },
  };

  it("rejects a group as its own member", () => {
    expect(errorOf(() => model.insertMember("a@example.org", { email: "a@example.org" })).body).toEqual(cycle);
  });

  it("rejects a direct cycle", () => {
    model.insertMember("a@example.org", { email: "b@example.org" }, { settled: true });

    expect(errorOf(() => model.insertMember("b@example.org", { email: "a@example.org" })).body).toEqual(cycle);
  });

  it("rejects a cycle through a group in between", () => {
    model.insertMember("a@example.org", { email: "b@example.org" });
    model.insertMember("b@example.org", { email: "c@example.org" });

    expect(errorOf(() => model.insertMember("c@example.org", { email: "a@example.org" })).body).toEqual(cycle);
  });

  it("allows one group under two parents", () => {
    model.insertMember("a@example.org", { email: "c@example.org" });

    expect(model.insertMember("b@example.org", { email: "c@example.org" }).type).toBe("GROUP");
  });
});

describe("group settings", () => {
  beforeEach(() => {
    seedGroup("sailors@example.org");
  });

  it("starts a group with default settings", () => {
    expect(model.getSettings("sailors@example.org")).toMatchObject({
      kind: "groupsSettings#groups",
      email: "sailors@example.org",
      whoCanJoin: "CAN_REQUEST_TO_JOIN",
    });
  });

  it("starts with every field the templates set, except the one Google omits while empty", () => {
    const fields = new Set(Object.values(GROUP_SETTINGS_TEMPLATES).flatMap((template) => Object.keys(template)));
    fields.delete("defaultMessageDenyNotificationText");

    expect(Object.keys(model.getSettings("sailors@example.org"))).toEqual(expect.arrayContaining([...fields]));
    expect(model.getSettings("sailors@example.org")).not.toHaveProperty("defaultMessageDenyNotificationText");
  });

  it("patches only the given fields", () => {
    const patched = model.patchSettings("sailors@example.org", {
      whoCanJoin: "INVITED_CAN_JOIN",
      email: "other@example.org",
    });

    expect(patched).toMatchObject({
      email: "sailors@example.org",
      whoCanJoin: "INVITED_CAN_JOIN",
      allowWebPosting: "true",
    });
    expect(model.getSettings("sailors@example.org")).toEqual(patched);
  });

  it("answers 404 for an unknown group", () => {
    expect(errorOf(() => model.getSettings("missing@example.org")).status).toBe(404);
    expect(errorOf(() => model.patchSettings("missing@example.org", {})).status).toBe(404);
  });
});
