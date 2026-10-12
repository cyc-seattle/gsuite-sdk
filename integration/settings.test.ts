import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { resolveGroupSettingsTemplate, type GroupSettings } from "../src/index.js";
import "./steps.js";
import { startWorld, stopWorld, world } from "./world.js";

const feature = await loadFeature("./settings.feature");

describeFeature(feature, ({ Scenario, BeforeEachScenario, AfterEachScenario }) => {
  let settings: GroupSettings;

  BeforeEachScenario(startWorld);
  AfterEachScenario(stopWorld);

  Scenario("Reading a group's settings", ({ When, Then }) => {
    When("the settings of {string} are read", async (_, group: string) => {
      const w = world();
      settings = await w.settings.getSettings(w.emailOf(group));
    });
    Then("{string} lets people ask to join", (_, group: string) => {
      expect(settings).toMatchObject({ email: world().emailOf(group), whoCanJoin: "CAN_REQUEST_TO_JOIN" });
    });
  });

  Scenario("Applying a settings template", ({ When, Then }) => {
    When("{string} gets the {string} settings", async (_, group: string, template: string) => {
      const w = world();
      await w.settings.patchSettings(w.emailOf(group), resolveGroupSettingsTemplate(template));
    });
    Then("the settings of {string} match the {string} template", async (_, group: string, template: string) => {
      const w = world();
      expect(await w.settings.getSettings(w.emailOf(group))).toMatchObject(resolveGroupSettingsTemplate(template));
    });
  });
});
