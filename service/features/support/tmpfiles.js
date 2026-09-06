import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function writeTempFile(content, name = "file") {
  const dir = await mkdtemp(join(tmpdir(), "bdd-fixture-"));
  const filePath = join(dir, name);
  await writeFile(filePath, content);
  return filePath;
}

export async function writeTempJson(data) {
  return writeTempFile(JSON.stringify(data, null, 2), "config.json");
}
