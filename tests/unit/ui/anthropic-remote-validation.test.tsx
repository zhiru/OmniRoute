// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import AddApiKeyModal from "../../../src/app/(dashboard)/dashboard/providers/[id]/components/modals/AddApiKeyModal";

const containers: Array<{ root: ReturnType<typeof createRoot>; element: HTMLDivElement }> = [];

afterEach(() => {
  vi.unstubAllGlobals();
  for (const { root, element } of containers) {
    act(() => root.unmount());
    element.remove();
  }
  containers.length = 0;
});

describe("Anthropic remote validation", () => {
  it.each(["Check", "Save"])("uses the non-spawning route for %s", async (buttonLabel) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ valid: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const element = document.createElement("div");
    document.body.appendChild(element);
    const root = createRoot(element);
    containers.push({ root, element });
    act(() => {
      root.render(
        <AddApiKeyModal
          isOpen
          provider="anthropic"
          providerName="Anthropic"
          onSave={async () => undefined}
          onClose={() => {}}
        />
      );
    });
    const input = element.querySelector<HTMLInputElement>('input[type="password"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(input, "sk-ant-test-only");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const button = Array.from(element.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim().toLowerCase() === buttonLabel.toLowerCase()
    )!;
    await act(async () => button.click());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/providers/anthropic/validate",
      expect.objectContaining({ method: "POST" })
    );
  });
});
