import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveProviderAlias } from "../../open-sse/services/providerAlias.ts";
import { resolveProviderAlias as viaModel } from "../../open-sse/services/model.ts";

// Regression: src/lib/combos/controlCenter.ts ends up in a "use client" bundle
// (ComboControlCenterClient.tsx). Importing open-sse/services/model.ts from it
// dragged the db layer (ioredis/tls/fs) into the browser build and broke
// `next build` on release/v3.8.51. The alias resolver now lives in a light module.
test("resolveProviderAlias lives in a db-free module and keeps its behaviour", () => {
  assert.equal(resolveProviderAlias("agy"), "antigravity");
  assert.equal(resolveProviderAlias("opencode"), "opencode-zen");
  assert.equal(resolveProviderAlias("antigravity"), "antigravity");
  assert.equal(resolveProviderAlias(null), null);
  assert.equal(viaModel, resolveProviderAlias);
  const light = readFileSync("open-sse/services/providerAlias.ts", "utf8");
  assert.doesNotMatch(light, /@\/lib\/db|\.\/model\.ts/);
  const cc = readFileSync("src/lib/combos/controlCenter.ts", "utf8");
  assert.doesNotMatch(cc, /open-sse\/services\/model\.ts/);
});
