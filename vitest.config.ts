import preset from "@cyc-seattle/ts-config/vitest";
import { configDefaults, defineConfig, mergeConfig } from "vitest/config";

// The feature steps run under their own task, `integration`.
export default mergeConfig(
  preset,
  defineConfig({ test: { exclude: [...configDefaults.exclude, "test/features/**"] } }),
);
