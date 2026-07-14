import fs from "node:fs/promises";
import path from "node:path";
import { applyEdits, modify, parse, type FormattingOptions } from "jsonc-parser";
import YAML from "yaml";
import { lockdownSecretFile } from "./secure-mode.js";

const formatting: FormattingOptions = { insertSpaces: true, tabSize: 2, eol: "\n" };

export async function pathExists(file: string): Promise<boolean> {
  try {
    await fs.stat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function readText(file: string): Promise<string> {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

export function parseJsoncObject(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  const errors: import("jsonc-parser").ParseError[] = [];
  const value = parse(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length) throw new Error(`Invalid JSON/JSONC configuration: ${JSON.stringify(errors)}`);
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function setJsonc(text: string, path: (string | number)[], value: unknown): string {
  const source = text.trim() ? text : "{}\n";
  return applyEdits(source, modify(source, path, value, { formattingOptions: formatting }));
}

export function updateYaml(text: string, updates: Array<{ path: (string | number)[]; value: unknown }>): string {
  const doc = text.trim() ? YAML.parseDocument(text) : new YAML.Document({});
  for (const update of updates) doc.setIn(update.path, update.value as never);
  return doc.toString({ lineWidth: 0 });
}

export async function atomicWrite(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.cpm-${process.pid}-${Date.now()}.tmp`;
  await fs.writeFile(tmp, content, { encoding: "utf8", mode: 0o600 });
  await fs.rename(tmp, file);
  // Owner-only mode: POSIX chmod 0600; Windows ACL via icacls (best-effort — see secure-mode.ts).
  await lockdownSecretFile(file, "best-effort");
}
