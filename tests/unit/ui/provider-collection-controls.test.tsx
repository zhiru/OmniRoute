import React, { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  CollectionPagination,
  CollectionViewControls,
  CollectionLayout,
  type CollectionPageSize,
  type CollectionView,
} from "@/app/(dashboard)/dashboard/providers/[id]/components/ProviderCollectionControls";
import ConnectionRow from "@/app/(dashboard)/dashboard/providers/[id]/components/ConnectionRow";
import type { ConnectionRowProps } from "@/app/(dashboard)/dashboard/providers/[id]/components/connectionRowTypes";
const noop = () => {};
afterEach(cleanup);
function Controls() {
  const [view, setView] = useState<CollectionView>("list"),
    [columns, setColumns] = useState(3),
    [size, setSize] = useState<CollectionPageSize>(10),
    [page, setPage] = useState(0);
  return (
    <>
      <CollectionViewControls
        view={view}
        onChange={setView}
        columns={columns}
        onColumnsChange={setColumns}
      />
      <CollectionPagination
        total={101}
        page={page}
        pageSize={size}
        onPage={setPage}
        onPageSize={setSize}
      />
      <output>
        {view}:{columns}:{size}
      </output>
    </>
  );
}
describe("Provider collection views and pagination", () => {
  it("offers list, cards and table while configuring cards independently", () => {
    render(<Controls />);
    fireEvent.click(screen.getByRole("button", { name: "Cards" }));
    expect(screen.getByRole("button", { name: "Cards" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("combobox", { name: "Cards per row" }));
    fireEvent.click(screen.getByRole("option", { name: "4", exact: true }));
    expect(screen.getByRole("status").textContent).toBe("cards:4:10");
    fireEvent.click(screen.getByRole("button", { name: "Table", exact: true }));
    expect(screen.getByRole("status").textContent).toBe("table:4:10");
  });
  it("offers all requested sizes and collapses pagination for All", () => {
    render(<Controls />);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByRole("button", { name: "Page 2" }).getAttribute("aria-current")).toBe(
      "page"
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Per page" }));
    for (const value of ["10", "15", "20", "50", "100", "All"])
      expect(screen.getByRole("option", { name: value, exact: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: "All", exact: true }));
    expect(screen.getByRole("button", { name: "Next page" })).toHaveProperty("disabled", true);
    expect(screen.getByText("1–101 / 101")).toBeTruthy();
  });
  it("keeps an empty collection at zero and disables page navigation", () => {
    render(
      <CollectionPagination total={0} page={5} pageSize="all" onPage={noop} onPageSize={noop} />
    );
    expect(screen.getByText("0–0 / 0")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Previous page" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Next page" })).toHaveProperty("disabled", true);
  });
  it("renders semantic account table cells and retains actions and details", () => {
    const onEdit = vi.fn();
    const props = {
      connection: {
        id: "a",
        name: "Account A",
        provider: "codex",
        isActive: true,
        testStatus: "active",
      },
      isCodex: true,
      isOAuth: false,
      codexViewMode: "table",
      onRetest: noop,
      onToggleActive: noop,
      onEdit,
      onDelete: noop,
    } as ConnectionRowProps;
    render(
      <CollectionLayout
        view="table"
        columns={3}
        headers={["Account", "Status", "Quota", "Actions"]}
      >
        <ConnectionRow {...props} />
      </CollectionLayout>
    );
    expect(screen.getAllByRole("columnheader")).toHaveLength(4);
    expect(screen.getAllByRole("cell")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getAllByRole("cell")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledOnce();
  });
  for (const view of ["list", "cards", "table"] as const) {
    it(`renders one weekly bar for a weekly-only account in ${view} view`, () => {
      const props = {
        connection: {
          id: "weekly",
          provider: "codex",
          name: "Weekly account",
          isActive: true,
          testStatus: "active",
        },
        isCodex: true,
        isOAuth: false,
        codexViewMode: view,
        quotaCache: {
          quotas: {
            session: { used: 50, total: 100, windowSeconds: 604800, displayName: "Weekly" },
          },
        },
        onRetest: noop,
        onToggleActive: noop,
        onEdit: noop,
        onDelete: noop,
      } as ConnectionRowProps;
      render(
        <CollectionLayout
          view={view}
          columns={3}
          headers={["Account", "Status", "Quota", "Actions"]}
        >
          <ConnectionRow {...props} />
        </CollectionLayout>
      );
      expect(screen.getAllByRole("meter")).toHaveLength(1);
      expect(screen.getByRole("meter", { name: "7d" }).getAttribute("aria-valuenow")).toBe("50");
      expect(screen.queryByText("5h")).toBeNull();
    });
  }
});

describe("Claude collection rows", () => {
  const claudeProps: ConnectionRowProps = {
    connection: {
      id: "claude-account",
      provider: "claude",
      name: "Claude account",
      testStatus: "active",
    },
    isClaude: true,
    isOAuth: true,
    isFirst: true,
    isLast: true,
    onMoveUp: noop,
    onMoveDown: noop,
    onRetest: noop,
    onToggleActive: noop,
    onToggleRateLimit: noop,
    onEdit: noop,
    onDelete: noop,
  };
  for (const view of ["list", "cards", "table"] as const) {
    it(`shows only reported Claude scopes in ${view}`, () => {
      render(
        <CollectionLayout
          view={view}
          columns={3}
          headers={["Account", "Status", "Quota", "Actions"]}
        >
          <ConnectionRow
            {...claudeProps}
            codexViewMode={view}
            quotaCache={{
              quotas: {
                "session (5h)": { used: 0, total: 100, fractionReported: false },
                "weekly (7d)": { used: 0, total: 100 },
              },
              modelQuotas: { "weekly sonnet (7d)": { used: 42, total: 100 } },
            }}
          />
        </CollectionLayout>
      );
      expect(screen.getAllByRole("meter")).toHaveLength(2);
      expect(screen.getByRole("meter", { name: "weekly (7d)" }).getAttribute("aria-valuenow")).toBe(
        "0"
      );
      expect(
        screen.getByRole("meter", { name: "weekly sonnet (7d)" }).getAttribute("aria-valuenow")
      ).toBe("42");
      expect(screen.queryByText("5h")).toBeNull();
      expect(screen.queryByText("session (5h)")).toBeNull();
      if (view === "table") expect(screen.getAllByRole("cell")).toHaveLength(4);
    });
  }
  it("offers Claude auth actions in the card menu and preserves extra-usage controls in details", () => {
    const onApplyClaudeAuthLocal = vi.fn(),
      onExportClaudeAuthFile = vi.fn(),
      onToggleClaudeExtraUsage = vi.fn();
    render(
      <ConnectionRow
        {...claudeProps}
        codexViewMode="cards"
        onApplyClaudeAuthLocal={onApplyClaudeAuthLocal}
        onExportClaudeAuthFile={onExportClaudeAuthFile}
        onToggleClaudeExtraUsage={onToggleClaudeExtraUsage}
      />
    );
    expect(screen.queryAllByRole("meter")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("button", { name: /Apply auth/i }));
    fireEvent.click(screen.getByRole("button", { name: /Export auth/i }));
    expect(onApplyClaudeAuthLocal).toHaveBeenCalledOnce();
    expect(onExportClaudeAuthFile).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /Codex|reset credits/i })).toBeNull();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    fireEvent.click(screen.getByRole("button", { name: /Extra usage/i }));
    expect(onToggleClaudeExtraUsage).toHaveBeenCalledOnce();
  });
  it("does not show quota usage when the account hides it", () => {
    render(
      <ConnectionRow
        {...claudeProps}
        connection={{ ...claudeProps.connection, quotaVisible: false }}
        quotaCache={{ quotas: { "session (5h)": { used: 20, total: 100 } } }}
      />
    );
    expect(screen.queryAllByRole("meter")).toHaveLength(0);
    expect(screen.queryByText("session (5h)")).toBeNull();
  });
});
