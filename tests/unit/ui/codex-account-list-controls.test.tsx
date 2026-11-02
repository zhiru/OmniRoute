import React, { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ConnectionsListPanel from "@/app/(dashboard)/dashboard/providers/[id]/components/ConnectionsListPanel";

vi.mock("@/app/(dashboard)/dashboard/providers/[id]/components/ConnectionRow", () => ({
  default: ({
    connection,
    codexViewMode,
  }: {
    connection: { name: string };
    codexViewMode: string;
  }) => (
    <div data-testid="account-row" data-view={codexViewMode}>
      {connection.name}
    </div>
  ),
}));
const noop = () => {};
function Harness({ filter = "all" }: { filter?: string }) {
  const [page, setPage] = useState(0),
    [healthFilter, setHealthFilter] = useState(filter),
    [accountSearch, setAccountSearch] = useState("");
  const connections = Array.from({ length: 1000 }, (_, i) => ({
    id: `account-${i}`,
    name: `Account ${i}`,
    priority: i + 1,
    isActive: i % 2 === 0,
    testStatus: "active",
  }));
  const base: Record<string, unknown> = {
    connections,
    providerId: "codex",
    selectedIds: new Set(),
    batchUpdating: null,
    batchRetesting: false,
    batchDeleting: false,
    batchTesting: false,
    page,
    healthFilter,
    accountSearch,
    PAGE_SIZE: 10,
    connProxyMap: {},
    quotaByConnectionId: { "account-3": { bankedResetCredits: 2 } },
    quotaRefreshingIds: new Set(),
    setSelectedIds: noop,
    setPage,
    setHealthFilter,
    setAccountSearch,
    t: (key: string) => key,
  };
  const props = new Proxy(base, {
    get: (target, key: string) => (key in target ? target[key] : noop),
  }) as unknown as React.ComponentProps<typeof ConnectionsListPanel>;
  return <ConnectionsListPanel {...props} />;
}
afterEach(cleanup);
describe("Codex account list controls", () => {
  it("paginates a thousand accounts and filters across the whole list", () => {
    render(<Harness />);
    expect(screen.getAllByTestId("account-row")).toHaveLength(10);
    fireEvent.click(screen.getAllByRole("button", { name: "Next page" })[0]);
    expect(screen.getAllByTestId("account-row")[0].textContent).toBe("Account 10");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Account 999" } });
    expect(screen.getAllByTestId("account-row")).toHaveLength(1);
    expect(screen.getByTestId("account-row").textContent).toBe("Account 999");
  });
  it("shows only accounts with known credits and separates disabled accounts", () => {
    render(<Harness filter="reset_credits" />);
    expect(screen.getAllByTestId("account-row")).toHaveLength(1);
    expect(screen.getByTestId("account-row").textContent).toBe("Account 3");
    fireEvent.click(screen.getByRole("button", { name: "Inactive" }));
    expect(screen.getAllByTestId("account-row")[0].textContent).toBe("Account 1");
  });
});
