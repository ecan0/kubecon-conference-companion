import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { createEmbedder, type Embedder } from "../embed/embedder.js";
import { createPgDb, vectorLiteral, type Db } from "./client.js";
import { migrate } from "./schema.js";
import type { CatalogTalk } from "./talks.js";

/** Directory of catalogue files, one per conference: `data/talks/<slug>.json`. */
export const DEFAULT_TALKS_DIR = fileURLToPath(new URL("../../../data/talks/", import.meta.url));

/** A talk file's contents plus the conference its file name stands for. */
export interface TalkFile {
  conference: string;
  talks: CatalogTalk[];
}

/**
 * Reads every `data/talks/<slug>.json`; the conference is the file name without
 * `.json`, so the slug is not repeated in every entry.
 */
export async function loadTalkFiles(dir = process.env.TALKS_DIR || DEFAULT_TALKS_DIR): Promise<TalkFile[]> {
  const names = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
  const files = await Promise.all(
    names.map(async (name): Promise<TalkFile> => ({
      conference: basename(name, ".json"),
      talks: JSON.parse(await readFile(join(dir, name), "utf8")) as CatalogTalk[],
    })),
  );
  return files.filter((f) => f.talks.length > 0);
}

/** Every talk from every file, in file-name order (tests and the offline evals). */
export async function loadTalks(dir = process.env.TALKS_DIR || DEFAULT_TALKS_DIR): Promise<CatalogTalk[]> {
  return (await loadTalkFiles(dir)).flatMap((f) => f.talks);
}

/** Text the semantic leg embeds for a talk: title first, then the abstract. */
export function talkPassage(t: Pick<CatalogTalk, "title" | "abstract">): string {
  return `${t.title}. ${t.abstract}`;
}

/** Upserts talks (talk id is the key, so re-running overwrites) with their passage embeddings. */
export async function seedTalks(db: Db, embedder: Embedder, talks: CatalogTalk[], conference: string): Promise<number> {
  for (const t of talks) {
    const embedding = await embedder.embed(talkPassage(t), "passage");
    await db.query(
      `insert into talks (id, conference, title, abstract, speaker, track, level, room, start_at, end_at, tags, embedding)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::vector)
       on conflict (id) do update set
         conference = excluded.conference, title = excluded.title, abstract = excluded.abstract,
         speaker = excluded.speaker, track = excluded.track, level = excluded.level, room = excluded.room,
         start_at = excluded.start_at, end_at = excluded.end_at, tags = excluded.tags, embedding = excluded.embedding`,
      [t.id, conference, t.title, t.abstract ?? "", t.speaker ?? "", t.track ?? "", t.level ?? null, t.room ?? null, t.start ?? null, t.end ?? null, t.tags ?? [], vectorLiteral(embedding)],
    );
  }
  return talks.length;
}

/** `npm run seed`: create the schema if missing, then load every data/talks/<slug>.json. */
async function main() {
  const config = loadConfig();
  const db = createPgDb(config.databaseUrl, { caFile: config.databaseCaFile });
  try {
    await migrate(db);
    const embedder = createEmbedder();
    const files = await loadTalkFiles();
    if (files.length === 0) throw new Error("no talk files found in data/talks");
    for (const file of files) {
      const n = await seedTalks(db, embedder, file.talks, file.conference);
      console.log(`seeded ${n} talks for ${file.conference}`);
    }
    const count = await db.query<{ n: string }>("select count(*)::text as n from talks");
    console.log(`table now has ${count.rows[0]?.n} rows (${embedder.provider} embeddings)`);
  } finally {
    await db.close();
  }
}

// Run only when executed directly, not when imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
