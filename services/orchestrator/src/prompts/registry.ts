import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type PromptVersion = { name: string; version: string; content: string; path: string };
export type PromptListing = { name: string; versions: string[]; aliases: Record<string, string> };

export class PromptRegistry {
  constructor(private readonly root: string) {}
  private async aliases(): Promise<Record<string, Record<string, string>>> { try { return JSON.parse(await readFile(join(this.root, "registry.json"), "utf8")); } catch { return {}; } }
  async resolve(name: string, version = "production"): Promise<PromptVersion> {
    const folder = join(this.root, name), versions = (await readdir(folder)).filter((file) => file.endsWith(".md")).sort();
    const alias = (await this.aliases())[name]?.[version], filename = version === "latest" ? versions.at(-1) : `${alias ?? version}.md`;
    if (!filename || !versions.includes(filename)) throw new Error(`Prompt ${name}@${version} not found`);
    return { name, version: filename.replace(/\.md$/, ""), content: await readFile(join(folder, filename), "utf8"), path: join(folder, filename) };
  }
  async list(): Promise<PromptListing[]> {
    const entries = await readdir(this.root, { withFileTypes: true }), aliases = await this.aliases(), result: PromptListing[] = [];
    for (const entry of entries) { if (!entry.isDirectory()) continue; const versions = (await readdir(join(this.root, entry.name))).filter((file) => file.endsWith(".md")).map((file) => file.replace(/\.md$/, "")).sort(); if (versions.length) result.push({ name: entry.name, versions, aliases: aliases[entry.name] ?? {} }); }
    return result;
  }
  async promote(name: string, version: string, channel = "production"): Promise<void> { await this.resolve(name, version); const aliases = await this.aliases(); aliases[name] = { ...(aliases[name] ?? {}), [channel]: version }; const target = join(this.root, "registry.json"), temporary = `${target}.tmp`; await writeFile(temporary, `${JSON.stringify(aliases, null, 2)}\n`, "utf8"); await rename(temporary, target); }
}
