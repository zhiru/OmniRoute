import test from "node:test";
import assert from "node:assert/strict";

import {
  ANTIGRAVITY_PUBLIC_MODELS,
  resolveAntigravityModelId,
} from "../../open-sse/config/antigravityModelAliases.ts";
import { AGY_PUBLIC_MODELS } from "../../open-sse/config/agyModels.ts";
import { MODEL_SPECS } from "../../src/shared/constants/modelSpecs.ts";

// Production call logs showed `antigravity/gemini-3.8-flash-tiered` answering 200 while
// `gemini-3.8-flash-high` 404'd 18/18 times: the suffixed ids reached the upstream
// verbatim because only the 3.7 tiers were aliased onto their tiered endpoint.
const TIERS = [
  ["gemini-3.8-flash-high", "Gemini 3.8 Flash (High)", 24576],
  ["gemini-3.8-flash-medium", "Gemini 3.8 Flash (Medium)", 8192],
  ["gemini-3.8-flash-low", "Gemini 3.8 Flash (Low)", 1024],
] as const;

test("gemini-3.8 flash tiers alias onto the live tiered endpoint id", () => {
  for (const [id] of TIERS) assert.equal(resolveAntigravityModelId(id), "gemini-3.8-flash-tiered");
  assert.equal(resolveAntigravityModelId("gemini-3.8-flash"), "gemini-3.8-flash-tiered");
  assert.equal(resolveAntigravityModelId("gemini-3.8-flash-tiered"), "gemini-3.8-flash-tiered");
});

test("gemini-3.8 flash tiers are public on both Antigravity surfaces, after the 3.7 tiers", () => {
  for (const models of [ANTIGRAVITY_PUBLIC_MODELS, AGY_PUBLIC_MODELS]) {
    const ids = models.map((m) => m.id);
    for (const [id, name] of TIERS) {
      const entry = models.find((m) => m.id === id);
      assert.ok(entry, `${id} must be public`);
      assert.equal(entry!.name, name);
      assert.ok(ids.indexOf(id) > ids.indexOf("gemini-3.7-flash-tiered"), `${id} after 3.7`);
    }
    assert.ok(ids.includes("gemini-3.8-flash-tiered"));
  }
});

test("gemini-3.8 flash tiers carry the same thinking budgets as 3.7", () => {
  for (const [id, , budget] of TIERS) {
    assert.equal(MODEL_SPECS[id]?.defaultThinkingBudget, budget, id);
    assert.equal(MODEL_SPECS[id]?.thinkingBudgetCap, 24576, id);
  }
});
