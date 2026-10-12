import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import "./steps.js";
import { startWorld, stopWorld } from "./world.js";

const feature = await loadFeature("./members.feature");

describeFeature(feature, ({ Scenario, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(startWorld);
  AfterEachScenario(stopWorld);

  Scenario("Adding a person to a group", () => {});
  Scenario("Adding a member again as a manager promotes them", () => {});
  Scenario("Adding a manager again as a member keeps them a manager", () => {});
});
