import { describeFeature, defineSteps, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { getHttpStatus } from "../../src/index.js";
import "./steps.js";
import { startWorld, stopWorld, world } from "./world.js";

const feature = await loadFeature("features/new-groups.feature");

defineSteps(({ Given }) => {
  Given("a group {string} was just created", async (_, name: string) => {
    const w = world();
    await w.directory.createGroup(w.newGroupEmail(name), name);
  });
});

describeFeature(feature, ({ Scenario, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(startWorld);
  AfterEachScenario(stopWorld);

  Scenario("A group just created refuses members", ({ Then }) => {
    Then("adding fails because {string} is not found", () => {
      const { error } = world();
      expect(getHttpStatus(error)).toBe(404);
      expect(error).toMatchObject({ message: "Resource Not Found: groupKey" });
    });
  });

  Scenario("A new group accepts members a minute later", () => {});
});
