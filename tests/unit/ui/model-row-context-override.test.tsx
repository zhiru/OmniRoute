// @vitest-environment jsdom
/**
 * Catalog (native-provider) ModelRow gets the same opt-in context-window override
 * editor as PassthroughModelRow:
 *  1) no callback -> no affordance (row unchanged).
 *  2) an existing override shows as the context-window badge with the number.
 *  3) edit + Enter saves the number.
 *  4) blank saves null (clear).
 *  5) invalid saves NaN and keeps the editor open.
 *  6) Escape cancels without saving.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { ModelRowProps } from "@/app/(dashboard)/dashboard/providers/[id]/components/ModelRow";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/shared/components", async () => ({
  // KEA-7886: form adapters (Button/Input/Checkbox/Select/FilterPills) as DOM-faithful stubs
  ...(await import("../../helpers/sharedComponentStubs")).formStubs,
  Badge: ({ children, title }: any) => <span title={title}>{children}</span>,
  CapabilityBadge: ({ children, title }: any) => <span title={title}>{children}</span>,
}));

vi.mock(
  "../../../src/app/(dashboard)/dashboard/providers/[id]/components/ModelCompatPopover",
  () => ({ default: () => null })
);

const { default: ModelRow } =
  await import("../../../src/app/(dashboard)/dashboard/providers/[id]/components/ModelRow");

const t = (key: string) => key;
const noop = () => {};

const setInputValue = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

const containers: Array<{ root: ReturnType<typeof createRoot>; el: HTMLDivElement }> = [];

function mount(props: Partial<ModelRowProps> = {}) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => {
    const row = (
      <ModelRow
        model={{ id: "gpt-5", name: "GPT 5", source: "system" }}
        fullModel="openai/gpt-5"
        provider="openai"
        onCopy={noop}
        t={t}
        effectiveModelNormalize={() => false}
        effectiveModelPreserveDeveloper={() => false}
        saveModelCompatFlags={noop}
        getUpstreamHeadersRecord={() => ({})}
        {...props}
      />
    );
    root.render(
      props.collectionView === "table" ? (
        <table>
          <tbody>{row}</tbody>
        </table>
      ) : (
        row
      )
    );
  });
  containers.push({ root, el });
  return el;
}

const overrideBadge = (el: HTMLElement) =>
  el.querySelector<HTMLElement>('span[title="contextWindowOverrideHint"]');

const overrideButton = (el: HTMLElement) =>
  [...el.querySelectorAll("button")].find(
    (b) => b.getAttribute("title") === "contextWindowOverrideLabel"
  );

const pressKey = async (input: HTMLInputElement, key: string) => {
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

afterEach(() => {
  for (const { root, el } of containers.splice(0)) {
    act(() => root.unmount());
    el.remove();
  }
});

describe("catalog ModelRow context-window override", () => {
  it("shows no affordance and no badge without a callback", () => {
    const el = mount({ contextWindowOverride: 5000 });
    expect(overrideButton(el)).toBeUndefined();
    expect(el.querySelector("input")).toBeNull();
    // Without a callback the row is exactly as before: not even a badge.
    expect(overrideBadge(el)).toBeNull();
  });

  it("shows an existing override as a badge with the number", () => {
    const el = mount({
      contextWindowOverride: 200000,
      onSaveContextWindowOverride: async () => {},
    });
    expect(overrideBadge(el)?.textContent).toBe("200,000");
  });

  it("opens seeded with the current value and saves a number on Enter", async () => {
    const saved: Array<[string, number | null]> = [];
    const el = mount({
      contextWindowOverride: 128000,
      onSaveContextWindowOverride: async (id: string, value: number | null) => {
        saved.push([id, value]);
      },
    });
    act(() => overrideButton(el)!.click());
    const input = el.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("128000");
    await act(async () => setInputValue(input, "1000000"));
    await pressKey(input, "Enter");
    expect(saved).toEqual([["gpt-5", 1000000]]);
    // Saved successfully -> editor closes.
    expect(el.querySelector("input")).toBeNull();
  });

  it("saves null when the field is blank (clears the override)", async () => {
    const saved: Array<number | null> = [];
    const el = mount({
      contextWindowOverride: 8000,
      onSaveContextWindowOverride: async (_id: string, value: number | null) => {
        saved.push(value);
      },
    });
    act(() => overrideButton(el)!.click());
    const input = el.querySelector("input") as HTMLInputElement;
    await act(async () => setInputValue(input, ""));
    await pressKey(input, "Enter");
    expect(saved).toEqual([null]);
  });

  it("signals invalid input with NaN and keeps the editor open", async () => {
    const saved: Array<number | null> = [];
    const el = mount({
      onSaveContextWindowOverride: async (_id: string, value: number | null) => {
        saved.push(value);
      },
    });
    act(() => overrideButton(el)!.click());
    const input = el.querySelector("input") as HTMLInputElement;
    await act(async () => setInputValue(input, "0"));
    await pressKey(input, "Enter");
    expect(saved).toHaveLength(1);
    expect(Number.isNaN(saved[0] as number)).toBe(true);
    expect(el.querySelector("input")).not.toBeNull();
  });

  it("Escape cancels without saving", async () => {
    const saved: Array<number | null> = [];
    const el = mount({
      contextWindowOverride: 8000,
      onSaveContextWindowOverride: async (_id: string, value: number | null) => {
        saved.push(value);
      },
    });
    act(() => overrideButton(el)!.click());
    const input = el.querySelector("input") as HTMLInputElement;
    await act(async () => setInputValue(input, "99"));
    await pressKey(input, "Escape");
    expect(saved).toEqual([]);
    expect(el.querySelector("input")).toBeNull();
    expect(el.textContent).toContain("8,000");
  });
});

describe("Codex model actions across collection views", () => {
  it.each(["list", "cards", "table"] as const)(
    "keeps copy, visibility, testing and context editing usable in %s",
    async (collectionView) => {
      const onCopy = vi.fn();
      const onTestModel = vi.fn(async () => {});
      const onToggleHidden = vi.fn(async () => {});
      const onSaveContextWindowOverride = vi.fn(async () => {});
      const el = mount({
        provider: "codex",
        fullModel: "codex/gpt-5",
        collectionView,
        contextWindowOverride: 128000,
        onSaveContextWindowOverride,
        onCopy,
        onTestModel,
        onToggleHidden,
      });
      expect(overrideBadge(el)?.textContent).toBe("128,000");
      if (collectionView === "table") expect(el.querySelectorAll("td")).toHaveLength(3);
      act(() => el.querySelector<HTMLButtonElement>('button[title="copyModel"]')!.click());
      expect(onCopy).toHaveBeenCalledWith("codex/gpt-5", "model-gpt-5");
      expect(overrideButton(el)).toBeUndefined();
      await act(async () => {
        el.querySelector<HTMLButtonElement>("button[aria-haspopup='dialog']")!.click();
      });
      const menu = document.querySelector<HTMLElement>("[role='dialog']")!;
      expect(menu).not.toBeNull();
      await act(async () => {
        menu.querySelector<HTMLButtonElement>('button[title="testModel"]')!.click();
        menu.querySelector<HTMLButtonElement>('button[title="Hide model"]')!.click();
      });
      expect(onTestModel).toHaveBeenCalledWith("gpt-5", "codex/gpt-5");
      expect(onToggleHidden).toHaveBeenCalledWith("gpt-5", true);
      await act(async () => overrideButton(menu)!.click());
      const input = el.querySelector<HTMLInputElement>(
        'input[aria-label="contextWindowOverrideLabel"]'
      )!;
      expect(input.value).toBe("128000");
      await act(async () => setInputValue(input, "200000"));
      await pressKey(input, "Enter");
      expect(onSaveContextWindowOverride).toHaveBeenCalledWith("gpt-5", 200000);
      expect(el.querySelector("input")).toBeNull();
    }
  );
});
