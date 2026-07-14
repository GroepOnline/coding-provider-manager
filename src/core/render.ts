import { createTwoFilesPatch } from "diff";
import pc from "picocolors";
import type { PlannedChange } from "../types.js";

export function renderPlan(change: PlannedChange): string {
  const icon = change.status === "ready" ? pc.green("READY") : change.status === "manual" ? pc.yellow("MANUAL") : pc.red("UNSUPPORTED");
  const lines = [`${icon} ${pc.bold(change.tool)}${change.path ? ` → ${change.path}` : ""}`];
  for (const note of change.notes) lines.push(`  ${note}`);
  if (change.status === "ready" && change.path && change.before !== change.after) {
    lines.push(createTwoFilesPatch(change.path, change.path, change.before || "", change.after || "", "before", "after", { context: 2 }));
  }
  return lines.join("\n");
}
