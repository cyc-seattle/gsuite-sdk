import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { getHttpStatus } from "../src/index.js";
import "./steps.js";
import { startWorld, stopWorld, world } from "./world.js";

const feature = await loadFeature("./nesting.feature");

describeFeature(feature, ({ Scenario, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(startWorld);
  AfterEachScenario(stopWorld);

  Scenario("A nested group isn't listed at first", ({ Then }) => {
    Then("{string} doesn't list {string} yet", async (_, group: string, member: string) => {
      const w = world();
      expect(w.error).toBeUndefined();
      const members = await w.directory.listMembers(w.emailOf(group));
      expect(members.map((m) => m.email)).not.toContain(w.emailOf(member));
    });
  });

  Scenario("A nested group is listed 10 minutes later", ({ And }) => {
    And("{string} was just added to {string}", (_, member: string, group: string) => {
      const w = world();
      w.model.insertMember(w.emailOf(group), { email: w.emailOf(member) });
    });
  });

  Scenario("A group can't join a group inside it", ({ Then }) => {
    Then("adding fails because it would make a cycle", () => {
      const { error } = world();
      expect(getHttpStatus(error)).toBe(412);
      expect(error).toMatchObject({ message: "Cyclic memberships not allowed" });
    });
  });
});
