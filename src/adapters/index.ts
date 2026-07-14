import type { ToolAdapter, ToolId, ToolSurface } from "../types.js";
import { piAdapter } from "./pi.js";
import { claudeAdapter } from "./claude.js";
import { opencodeAdapter } from "./opencode.js";
import { factoryAdapter } from "./factory.js";
import { aiderAdapter } from "./aider.js";
import { continueAdapter } from "./continue.js";
import { kiloAdapter } from "./kilo.js";
import { crushAdapter } from "./crush.js";
import {
  antigravityAdapter,
  ampAdapter,
  augmentAdapter,
  clineAdapter,
  cursorAdapter,
  geminiCliAdapter,
  githubCopilotAdapter,
  gooseAdapter,
  junieAdapter,
  kimiCliAdapter,
  replitAgentAdapter,
  rooAdapter,
  sourcegraphCodyAdapter,
  t3ChatAdapter,
  traeAdapter,
  vscodeAdapter,
  windsurfAdapter,
  zedAdapter,
  copilotCliAdapter,
  amazonQAdapter,
  kiroAdapter,
  warpAdapter,
  openHandsAdapter,
  plandexAdapter,
  mentatAdapter,
  openInterpreterAdapter,
  mistralVibeAdapter,
  tabbyAdapter,
  voidEditorAdapter,
  pearAiAdapter,
  devinAdapter,
  sweepAdapter,
  qodoAdapter,
  continueCliAdapter,
  aiderDeskAdapter,
  boltAdapter,
  lovableAdapter,
} from "./manual.js";
import { codexAdapter, codexAppAdapter, codexIdeAdapter } from "./codex.js";
import { qwenCodeAdapter } from "./qwen.js";

const baseAdapters: ToolAdapter[] = [
  piAdapter,
  claudeAdapter,
  opencodeAdapter,
  factoryAdapter,
  aiderAdapter,
  continueAdapter,
  kiloAdapter,
  crushAdapter,
  qwenCodeAdapter,
  clineAdapter,
  rooAdapter,
  cursorAdapter,
  codexAdapter,
  codexAppAdapter,
  codexIdeAdapter,
  t3ChatAdapter,
  antigravityAdapter,
  windsurfAdapter,
  vscodeAdapter,
  githubCopilotAdapter,
  geminiCliAdapter,
  kimiCliAdapter,
  ampAdapter,
  gooseAdapter,
  zedAdapter,
  augmentAdapter,
  junieAdapter,
  traeAdapter,
  sourcegraphCodyAdapter,
  replitAgentAdapter,
  copilotCliAdapter,
  amazonQAdapter,
  kiroAdapter,
  warpAdapter,
  openHandsAdapter,
  plandexAdapter,
  mentatAdapter,
  openInterpreterAdapter,
  mistralVibeAdapter,
  tabbyAdapter,
  voidEditorAdapter,
  pearAiAdapter,
  devinAdapter,
  sweepAdapter,
  qodoAdapter,
  continueCliAdapter,
  aiderDeskAdapter,
  boltAdapter,
  lovableAdapter,
];

const surfaceDefaults: Partial<Record<ToolId, ToolSurface[]>> = {
  pi: ["cli"],
  claude: ["cli", "ide"],
  opencode: ["cli", "desktop", "ide"],
  factory: ["cli"],
  aider: ["cli"],
  continue: ["extension", "ide"],
  kilo: ["cli", "extension", "ide"],
  crush: ["cli"],
};

const authDefaults: Partial<Record<ToolId, string[]>> = {
  opencode: ["opencode-openai-chatgpt", "opencode-github-copilot", "opencode-gitlab-duo"],
};

export const adapters: ToolAdapter[] = baseAdapters.map((adapter) => ({
  ...adapter,
  surfaces: adapter.surfaces ?? surfaceDefaults[adapter.id] ?? [],
  providerInjection: adapter.providerInjection ?? "automatic",
  authFlowIds: adapter.authFlowIds ?? authDefaults[adapter.id] ?? [],
  detect: adapter.detect ?? { commands: adapter.command ? [adapter.command] : [] },
}));

export const adapterMap = new Map<ToolId, ToolAdapter>(adapters.map((adapter) => [adapter.id, adapter]));
