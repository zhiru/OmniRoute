"use client";

import type { ReactNode } from "react";
import { TabsContent } from "@omniroute/ui-kit/tabs";

export default function ProviderDetailSection({
  enabled,
  value,
  children,
}: {
  enabled: boolean;
  value: string;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  // Keep drafts and local panel state when switching between provider tasks.
  return (
    <TabsContent value={value} forceMount className="space-y-6">
      {children}
    </TabsContent>
  );
}
