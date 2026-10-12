import { defineSteps } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import type { GroupRole } from "../src/index.js";
import { world } from "./world.js";

const MINUTE = 60_000;

function role(word: string): GroupRole {
  return word.toUpperCase() as GroupRole;
}

/** Steps that more than one feature uses. */
defineSteps(({ Step }) => {
  Step("a group {string}", (_, name: string) => {
    const w = world();
    w.model.insertGroup({ email: w.newGroupEmail(name), name }, { settled: true });
  });

  Step("{string} is already in {string} as a {word}", (_, member: string, group: string, word: string) => {
    const w = world();
    w.model.insertMember(w.emailOf(group), { email: w.emailOf(member), role: role(word) }, { settled: true });
  });

  Step("{string} is added to {string} as a {word}", async (_, member: string, group: string, word: string) => {
    const w = world();
    try {
      await w.directory.addMember(w.emailOf(group), w.emailOf(member), role(word));
    } catch (error) {
      w.error = error;
    }
  });

  Step("adding succeeds", () => {
    expect(world().error).toBeUndefined();
  });

  Step("{string} lists {string} as a {word}", async (_, group: string, member: string, word: string) => {
    const w = world();
    const members = await w.directory.listMembers(w.emailOf(group));
    expect(members).toContainEqual(expect.objectContaining({ email: w.emailOf(member), role: role(word) }));
  });

  Step("a minute passes", () => {
    world().clock.advance(MINUTE);
  });

  Step("the list holds {string}, {string}, and {string}", (_, first: string, second: string, third: string) => {
    expect([...world().listed].sort()).toEqual([first, second, third].sort());
  });
});
