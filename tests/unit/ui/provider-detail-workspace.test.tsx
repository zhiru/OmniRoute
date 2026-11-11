// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tabs, TabsList, TabsTrigger } from "@omniroute/ui-kit/tabs";
import ProviderDetailSection from "../../../src/app/(dashboard)/dashboard/providers/[id]/components/ProviderDetailSection";
import ConnectionRow, {
  type ConnectionRowProps,
} from "../../../src/app/(dashboard)/dashboard/providers/[id]/components/ConnectionRow";

const mounts: Array<{ root: ReturnType<typeof createRoot>; el: HTMLDivElement }> = [];
function render(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(node));
  mounts.push({ root, el });
  return el;
}
function props(isCodex: boolean, onToggleAutoSync = vi.fn()): ConnectionRowProps {
  const noop = () => {};
  return {
    connection: {
      id: "preview-account",
      provider: isCodex ? "codex" : "agy",
      name: "Team account",
      isActive: true,
      providerSpecificData: { autoSync: false },
    },
    isCodex,
    isOAuth: false,
    isFirst: true,
    isLast: true,
    onMoveUp: noop,
    onMoveDown: noop,
    onToggleActive: noop,
    onToggleRateLimit: noop,
    onRetest: noop,
    onEdit: noop,
    onDelete: noop,
    onToggleAutoSync,
  } as ConnectionRowProps;
}
beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  for (const { root, el } of mounts.splice(0)) {
    act(() => root.unmount());
    el.remove();
  }
  vi.clearAllMocks();
});

describe("provider detail workspace", () => {
  it("keeps a draft when changing tasks and hides inactive panels", () => {
    const el = render(
      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="models">Models</TabsTrigger>
        </TabsList>
        <ProviderDetailSection enabled value="accounts">
          Accounts list
        </ProviderDetailSection>
        <ProviderDetailSection enabled value="models">
          <input aria-label="Model draft" defaultValue="draft model" />
        </ProviderDetailSection>
      </Tabs>
    );
    const tabs = el.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const panels = el.querySelectorAll<HTMLElement>('[role="tabpanel"]');
    expect(panels[1].hidden).toBe(true);
    act(() => tabs[1].click());
    expect(panels[1].hidden).toBe(false);
    const input = el.querySelector<HTMLInputElement>("input")!;
    input.value = "edited draft";
    act(() => tabs[0].click());
    act(() => tabs[1].click());
    expect(el.querySelector("input")).toBe(input);
    expect(input.value).toBe("edited draft");
  });

  it("reveals Codex controls without changing account settings", () => {
    const toggle = vi.fn();
    const el = render(<ConnectionRow {...props(true, toggle)} />);
    const disclosure = el.querySelector<HTMLButtonElement>(
      '[aria-expanded="false"][aria-controls]'
    )!;
    expect(disclosure).not.toBeNull();
    expect(el.textContent).toContain("Team account");
    expect(el.querySelector('button[aria-label="Edit"]')?.closest("[hidden]")).not.toBeNull();
    act(() => disclosure.click());
    expect(disclosure.getAttribute("aria-expanded")).toBe("true");
    expect(toggle).not.toHaveBeenCalled();
    const sync = [...el.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Sync")!;
    expect(sync).toBeDefined();
    act(() => sync.click());
    expect(toggle).toHaveBeenCalledExactlyOnceWith(true);
    act(() => disclosure.click());
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(el.querySelector('button[aria-label="Edit"]')?.closest("[hidden]")).not.toBeNull();
  });

  it("preserves the existing visible controls for other providers", () => {
    const el = render(<ConnectionRow {...props(false)} />);
    expect(el.textContent).toContain("Sync");
    expect(el.querySelector('button[aria-label="Edit"]')?.closest("[hidden]")).toBeNull();
  });
});
