import type { Db } from "./client.js";

/** multilingual-e5-small output size; every vector column uses it. */
export const EMBEDDING_DIMS = 384;

/**
 * Whole schema, idempotent: safe to run on every start. Tables replace the old
 * Elasticsearch indices one for one. Timestamps are timestamptz; "kept
 * indefinitely" profiles use the same far-future `expires_at` sentinel as before.
 * Search: `fts` (weighted tsvector, GIN) plus `pg_trgm` for typo tolerance on
 * the BM25-like leg, and `embedding` (HNSW, cosine) for the semantic leg.
 */
export const SCHEMA_SQL = `
create extension if not exists vector;
create extension if not exists pg_trgm;

create table if not exists talks (
  id text primary key,
  -- Catalogue event the talk belongs to (conferences.json slug); every query scopes to one.
  conference text not null,
  title text not null,
  abstract text not null default '',
  speaker text not null default '',
  track text not null default '',
  level text,
  room text,
  start_at timestamptz,
  end_at timestamptz,
  tags text[] not null default '{}',
  embedding vector(${EMBEDDING_DIMS}),
  fts tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', immutable_array_to_string(tags, ' ')), 'B') ||
    setweight(to_tsvector('english', coalesce(speaker, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(abstract, '')), 'D')
  ) stored
);

create table if not exists attendees (
  id text primary key,
  display_name text not null,
  interests text[] not null default '{}',
  interest_vector vector(${EMBEDDING_DIMS}),
  consent_cluster_map boolean not null,
  consent_qr_checkin boolean not null,
  created_at timestamptz not null,
  expires_at timestamptz not null
);

create table if not exists schedules (
  attendee_id text primary key,
  talk_ids text[] not null default '{}',
  updated_at timestamptz not null,
  expires_at timestamptz not null
);

create table if not exists entitlements (
  attendee_id text primary key,
  pass_type text not null,
  rooms text[] not null default '{}',
  updated_at timestamptz not null,
  expires_at timestamptz not null
);

-- HMAC(provider:subject) -> attendee; the raw provider subject is never stored.
create table if not exists identities (
  id text primary key,
  attendee_id text not null,
  created_at timestamptz not null,
  expires_at timestamptz not null
);

-- One row per cluster of a run, plus a marker row (see clusters/job.ts) naming the run that is current.
create table if not exists interest_clusters (
  doc_id text primary key,
  cluster_id text,
  run_id text not null,
  label text,
  size integer,
  top_interests text[] not null default '{}',
  centroid vector(${EMBEDDING_DIMS}),
  computed_at timestamptz not null
);

create index if not exists talks_fts_idx on talks using gin (fts);
create index if not exists talks_title_trgm_idx on talks using gin (title gin_trgm_ops);
create index if not exists talks_embedding_idx on talks using hnsw (embedding vector_cosine_ops);
create index if not exists talks_start_idx on talks (start_at);
create index if not exists talks_track_idx on talks (track);
create index if not exists attendees_expires_idx on attendees (expires_at);
create index if not exists schedules_expires_idx on schedules (expires_at);
create index if not exists entitlements_expires_idx on entitlements (expires_at);
create index if not exists identities_attendee_idx on identities (attendee_id);
create index if not exists identities_expires_idx on identities (expires_at);
create index if not exists interest_clusters_run_idx on interest_clusters (run_id);
`;

/** generated columns need an immutable expression; array_to_string is only stable. */
const IMMUTABLE_HELPER_SQL = `
create or replace function immutable_array_to_string(a text[], sep text) returns text
  language sql immutable parallel safe set search_path = pg_catalog as $$ select array_to_string(a, sep) $$;
`;

/**
 * Adds `talks.conference` to a database created before talks were scoped per
 * conference, and backfills the existing (KubeCon NA 2026) catalogue. Idempotent:
 * `add column if not exists` and the index guard make a second run a no-op.
 */
const TALKS_CONFERENCE_SQL = `
alter table talks add column if not exists conference text;
update talks set conference = 'kubecon-na-2026' where conference is null;
alter table talks alter column conference set not null;
create index if not exists talks_conference_start_idx on talks (conference, start_at);
`;

/**
 * Attendee-linked rows never outlive their attendee. Deleting an attendee removes
 * its schedule, entitlement and identity rows (cascade). A write for a deleted
 * attendee fails instead of leaving an orphan row. Consent has no default: every
 * insert states it. A database that already holds orphan rows fails here until
 * they are removed. Idempotent: the guards skip constraints that exist.
 */
const ATTENDEE_CONSTRAINTS_SQL = `
alter table attendees alter column consent_cluster_map drop default, alter column consent_qr_checkin drop default;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'schedules_attendee_fk') then
    alter table schedules add constraint schedules_attendee_fk foreign key (attendee_id) references attendees (id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'entitlements_attendee_fk') then
    alter table entitlements add constraint entitlements_attendee_fk foreign key (attendee_id) references attendees (id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'identities_attendee_fk') then
    alter table identities add constraint identities_attendee_fk foreign key (attendee_id) references attendees (id) on delete cascade;
  end if;
end $$;
`;

/**
 * Row-level security on every app table, and no grants to Supabase's public Data API roles (anon,
 * authenticated). With no policies, RLS denies those roles. The API connects as the table owner,
 * which bypasses RLS, so its queries are unaffected. Idempotent: enabling RLS twice is a no-op,
 * and the role guard skips the revokes on databases without those roles (local Postgres, tests).
 */
const RLS_SQL = `
alter table talks enable row level security;
alter table attendees enable row level security;
alter table schedules enable row level security;
alter table entitlements enable row level security;
alter table identities enable row level security;
alter table interest_clusters enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname in ('anon', 'authenticated')) then
    revoke all on all tables in schema public from anon, authenticated;
    alter default privileges in schema public revoke all on tables from anon, authenticated;
  end if;
end $$;
`;

/** Creates the extensions, tables and indexes that are missing. Safe to run repeatedly and concurrently at start. */
export async function migrate(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(7270001)");
    await tx.exec(`create extension if not exists pg_trgm;${IMMUTABLE_HELPER_SQL}${SCHEMA_SQL}${TALKS_CONFERENCE_SQL}${ATTENDEE_CONSTRAINTS_SQL}${RLS_SQL}`);
  });
}
