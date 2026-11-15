import { describe, expect, it } from "vitest";
import { migrate } from "../src/db/schema.js";
import { loadTalkFiles } from "../src/db/seed.js";
import { TEST_CONFERENCE, insertTalks, testDb } from "./pg.js";
import { mk } from "./search-fixtures.js";

describe("talks.conference migration", () => {
  it("is idempotent and keeps every row", async () => {
    const db = await testDb();
    try {
      await insertTalks(db, [mk("a", 9, 10)]);
      await migrate(db);
      await migrate(db);
      expect((await db.query<{ conference: string }>("select conference from talks")).rows).toEqual([
        { conference: TEST_CONFERENCE },
      ]);
      const index = await db.query<{ indexname: string }>(
        "select indexname from pg_indexes where tablename = 'talks' and indexname = 'talks_conference_start_idx'",
      );
      expect(index.rows).toHaveLength(1);
    } finally {
      await db.close();
    }
  });

  it("backfills a talks table created before the column existed, then enforces not null", async () => {
    const db = await testDb();
    try {
      // The pre-conference schema: no column (and therefore no index), one old row.
      await db.exec("alter table talks drop column conference");
      await db.query("insert into talks (id, title) values ('legacy', 'Old talk')");
      await migrate(db);
      expect((await db.query<{ id: string; conference: string }>("select id, conference from talks order by id")).rows).toEqual([
        { id: "legacy", conference: "kubecon-na-2026" },
      ]);
      await expect(db.query("insert into talks (id, title) values ('bad', 'No conference')")).rejects.toThrow();
      await migrate(db);
      expect((await db.query<{ n: number }>("select count(*)::int n from talks")).rows[0]?.n).toBe(1);
    } finally {
      await db.close();
    }
  });

  it("reads one catalogue file per conference and takes the slug from the file name", async () => {
    const files = await loadTalkFiles();
    expect(files.map((f) => f.conference)).toContain("kubecon-na-2026");
    for (const f of files) {
      expect(f.conference).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
      expect(f.talks.length).toBeGreaterThan(0);
    }
  });
});
