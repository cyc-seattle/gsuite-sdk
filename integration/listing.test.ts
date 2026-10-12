import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import "./steps.js";
import { startWorld, stopWorld, world } from "./world.js";

const feature = await loadFeature("./listing.feature");

describeFeature(feature, ({ Scenario, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(startWorld);
  AfterEachScenario(stopWorld);

  Scenario("Listing groups that span pages", ({ When }) => {
    When("the groups are listed", async () => {
      const w = world();
      const groups = await w.directory.listGroups("my_customer");
      w.listed = groups.flatMap((group) => w.nameOf(group.email) ?? []);
    });
  });

  Scenario("Listing members that span pages", ({ When }) => {
    When("the members of {string} are listed", async (_, group: string) => {
      const w = world();
      const members = await w.directory.listMembers(w.emailOf(group));
      w.listed = members.flatMap((member) => w.nameOf(member.email) ?? []);
    });
  });
});
