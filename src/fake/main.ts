import { WorkspaceModel } from "./model.js";
import { startFakeServer } from "./server.js";

const model = new WorkspaceModel({
  ...optionalNumber("newGroupDelayMs", process.env["NEW_GROUP_DELAY_MS"]),
  ...optionalNumber("nestedMembershipDelayMs", process.env["NESTED_MEMBERSHIP_DELAY_MS"]),
});
const server = await startFakeServer({ model, host: "0.0.0.0", port: Number(process.env["PORT"] ?? 8080) });
console.log(`Workspace fake listening on port ${new URL(server.rootUrl).port}`);

// As PID 1 in a container, Node gets no default SIGTERM handler.
process.on("SIGTERM", () => {
  void server.close().then(() => process.exit(0));
});

function optionalNumber<K extends string>(key: K, value: string | undefined): Partial<Record<K, number>> {
  return value === undefined ? {} : ({ [key]: Number(value) } as Record<K, number>);
}
