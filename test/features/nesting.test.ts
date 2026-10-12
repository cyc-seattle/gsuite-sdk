import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { getHttpStatus } from "../../src/index.js";
import "./steps.js";
import { startWorld, stopWorld, world } from "./world.js";

const feature = await loadFeature("features/nesting.feature");

describeFeature(feature, ({ Scenario, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(startWorld);
  AfterEachScenario(stopWorld);

  Scenario("A group can't join a group inside it", ({ Then }) => {
    Then("adding fails because it would make a cycle", () => {
      const { error } = world();
      expect(getHttpStatus(error)).toBe(412);
      expect(error).toMatchObject({ message: "Cyclic memberships not allowed" });
    });
  });
});
