import React, { useState, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ConnectionsListPanel from "@/app/(dashboard)/dashboard/providers/[id]/components/ConnectionsListPanel";
import { claudeOperationalQuotas } from "@/app/(dashboard)/dashboard/providers/[id]/components/claudeOperationalQuota";

afterEach(cleanup);
const noop = () => {};
type PanelProps = ComponentProps<typeof ConnectionsListPanel>;

function ClaudeAccounts({ tagged = false }: { tagged?: boolean }) {
  const t = useTranslations("providers");
  const [page, setPage] = useState(0);
  const [accountSearch, setAccountSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const props: PanelProps = {
    connections: Array.from({ length: 23 }, (_, i) => ({
      id: `account-${i + 1}`,
      provider: "claude",
      name: `Claude account ${i + 1}`,
      email: `member${i + 1}@example.test`,
      priority: i + 1,
      isActive: i !== 22,
      testStatus: "active",
      providerSpecificData: tagged ? { tag: i < 15 ? "Team A" : "Team B" } : {},
    })),
    providerId: "claude",
    isCcCompatible: false,
    isOAuth: true,
    codexGlobalServiceMode: "none",
    selectedIds,
    setSelectedIds,
    page,
    setPage,
    accountSearch,
    setAccountSearch,
    healthFilter,
    setHealthFilter,
    t,
    PAGE_SIZE: 10,
    batchUpdating: null,
    batchRetesting: false,
    batchDeleting: false,
    batchTesting: false,
    retestingId: null,
    refreshingId: null,
    distributingProxies: false,
    connProxyMap: {},
    proxyConfig: null,
    applyingCodexAuthId: null,
    exportingCodexAuthId: null,
    applyingClaudeAuthId: null,
    exportingClaudeAuthId: null,
    emailsVisible: true,
    deleteConfirm: {
      connection: null,
      deleting: false,
      request: noop,
      confirm: async () => {},
      cancel: noop,
    },
    handleUpdateConnectionStatus: noop,
    handleToggleRateLimit: noop,
    handleToggleQuotaVisibility: noop,
    handleToggleClaudeExtraUsage: noop,
    handleToggleCodexPaidCredits: noop,
    handleToggleCliproxyapiMode: noop,
    handleSetUpstreamProxyMode: noop,
    upstreamProxyMode: "native",
    upstreamProxyFallbackBackend: "cliproxyapi",
    handleToggleCodexLimit: noop,
    handleToggleProxyEnabled: noop,
    handleTogglePerKeyProxyEnabled: noop,
    handleRetestConnection: noop,
    handleRefreshToken: noop,
    handleSwapPriority: noop,
    handleBatchSetActive: noop,
    handleBatchDeleteOpenModal: noop,
    handleBatchRetest: noop,
    handleToggleSelectOne: noop,
    handleToggleSelectAll: noop,
    handleDistributeProxies: noop,
    cpaProviderEnabled: false,
    quotaByConnectionId: {},
    quotaRefreshingIds: new Set(),
    handleRefreshQuota: noop,
    onOpenEditModal: noop,
    onOpenOAuth: noop,
    onSetProxyTarget: noop,
    onOpenApplyCodexModal: noop,
    onExportCodexAuthFile: noop,
    onOpenApplyClaudeModal: noop,
    onExportClaudeAuthFile: noop,
    gateConnectionFlow: noop,
  };
  return <ConnectionsListPanel {...props} />;
}

describe("Claude account collection", () => {
  for (const tagged of [false, true]) {
    it(`searches all pages and supports page selection and views (tagged: ${tagged})`, () => {
      const { container } = render(<ClaudeAccounts tagged={tagged} />);
      expect(screen.getByText("1–10 / 23")).toBeTruthy();
      expect(container.querySelector("details")?.open).toBe(false);
      fireEvent.click(screen.getByRole("button", { name: "Next page" }));
      expect(screen.getByText("11–20 / 23")).toBeTruthy();
      fireEvent.click(screen.getByRole("checkbox", { name: /Select this page/i }));
      expect(screen.getByText(/10 selected/)).toBeTruthy();
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "member23@" } });
      expect(screen.getByText("1–1 / 1")).toBeTruthy();
      expect(screen.getByText("Claude account 23")).toBeTruthy();
      expect(screen.queryByText(/10 selected/)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Cards" }));
      expect(screen.getByRole("combobox", { name: "Cards per row" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Table", exact: true }));
      expect(screen.getAllByRole("columnheader")).toHaveLength(4);
      expect(screen.getAllByRole("cell")).toHaveLength(4);
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "absent-account" } });
      expect(screen.getByText("0–0 / 0")).toBeTruthy();
      expect(screen.queryByRole("table")).toBeNull();
    });
  }
  it("filters inactive accounts and allows showing all accounts", () => {
    const { container } = render(<ClaudeAccounts />);
    container.querySelector("details")!.open = true;
    fireEvent.click(screen.getByRole("button", { name: "Inactive", exact: true }));
    expect(screen.getByText("1–1 / 1")).toBeTruthy();
    expect(screen.getByText("Claude account 23")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /With reset credits/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "All", exact: true }));
    fireEvent.click(screen.getByRole("combobox", { name: "Per page" }));
    fireEvent.click(screen.getByRole("option", { name: "All", exact: true }));
    expect(screen.getByText("1–23 / 23")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next page" })).toHaveProperty("disabled", true);
  });
});

describe("Claude reported quota windows", () => {
  it("does not fabricate windows for empty, unavailable or credit-only payloads", () => {
    for (const cache of [
      undefined,
      {},
      { quotas: {} },
      { quotas: { "session (5h)": null } },
      { message: "Unavailable", quotas: { "weekly (7d)": { used: 40, total: 100 } } },
    ]) {
      expect(claudeOperationalQuotas(cache)).toEqual([]);
    }
  });
  it("ignores missing utilization and preserves observed zeroes, scopes and dates", () => {
    expect(
      claudeOperationalQuotas({
        quotas: {
          "weekly (7d)": { used: 0, total: 100 },
          "session (5h)": { used: 0, total: 100, fractionReported: false },
          missing: { used: null, total: 100 },
          invalid: { used: NaN, total: 100 },
        },
        modelQuotas: {
          sonnet: {
            remainingPercentage: 60,
            displayName: "Sonnet weekly",
            resetAt: "2030-01-01T12:00:00Z",
          },
        },
      })
    ).toEqual([
      { name: "weekly (7d)", label: "weekly (7d)", usedPercent: 0, resetAt: null },
      { name: "sonnet", label: "Sonnet weekly", usedPercent: 40, resetAt: "2030-01-01T12:00:00Z" },
    ]);
  });
});
