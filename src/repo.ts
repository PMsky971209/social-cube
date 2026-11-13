import type { Claim, ConfirmationItem, Person, Session } from "../types.ts";
import type { Db } from "./db.ts";
import type { Confirmation } from "./store.ts";

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

export class Repo {
  constructor(readonly db: Db) {}

  upsertPerson(person: Person): void {
    this.db
      .prepare(
        `INSERT INTO people (id, display_name, aliases_json, relationship_temperature, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           display_name=excluded.display_name,
           aliases_json=excluded.aliases_json,
           relationship_temperature=excluded.relationship_temperature,
           updated_at=excluded.updated_at`,
      )
      .run(
        person.id,
        person.display_name,
        JSON.stringify(person.aliases),
        person.relationship_temperature ?? null,
        person.created_at,
        person.updated_at,
      );
  }

  getPerson(id: string): Person | null {
    const row = this.db
      .prepare(
        `SELECT id, display_name, aliases_json, relationship_temperature, created_at, updated_at
         FROM people WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          display_name: string;
          aliases_json: string;
          relationship_temperature: string | null;
          created_at: string;
          updated_at: string;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      display_name: row.display_name,
      aliases: parseJson<string[]>(row.aliases_json),
      relationship_temperature: row.relationship_temperature as Person["relationship_temperature"],
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  upsertSession(
    session: Session & { transcript_text?: string | null },
  ): void {
    this.db
      .prepare(
        `INSERT INTO sessions (
           id, started_at, ended_at, source, transcript_ref, transcript_text,
           participant_person_ids_json, status, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           started_at=excluded.started_at,
           ended_at=excluded.ended_at,
           source=excluded.source,
           transcript_ref=excluded.transcript_ref,
           transcript_text=excluded.transcript_text,
           participant_person_ids_json=excluded.participant_person_ids_json,
           status=excluded.status`,
      )
      .run(
        session.id,
        session.started_at,
        session.ended_at ?? null,
        session.source,
        session.transcript_ref,
        session.transcript_text ?? null,
        JSON.stringify(session.participant_person_ids),
        session.status,
        session.created_at,
      );
  }

  getSession(id: string): (Session & { transcript_text?: string | null }) | null {
    const row = this.db
      .prepare(
        `SELECT id, started_at, ended_at, source, transcript_ref, transcript_text,
                participant_person_ids_json, status, created_at
         FROM sessions WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          started_at: string;
          ended_at: string | null;
          source: Session["source"];
          transcript_ref: string;
          transcript_text: string | null;
          participant_person_ids_json: string;
          status: Session["status"];
          created_at: string;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      started_at: row.started_at,
      ended_at: row.ended_at,
      source: row.source,
      transcript_ref: row.transcript_ref,
      transcript_text: row.transcript_text,
      participant_person_ids: parseJson<string[]>(row.participant_person_ids_json),
      status: row.status,
      created_at: row.created_at,
    };
  }

  upsertClaim(claim: Claim): void {
    this.db
      .prepare(
        `INSERT INTO claims (
           id, person_id, session_id, type, op, summary, payload_json, evidence_json,
           tags_json, status, confidence, replaces_claim_id, confirmed_at, confirmed_via, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           person_id=excluded.person_id,
           session_id=excluded.session_id,
           type=excluded.type,
           op=excluded.op,
           summary=excluded.summary,
           payload_json=excluded.payload_json,
           evidence_json=excluded.evidence_json,
           tags_json=excluded.tags_json,
           status=excluded.status,
           confidence=excluded.confidence,
           replaces_claim_id=excluded.replaces_claim_id,
           confirmed_at=excluded.confirmed_at,
           confirmed_via=excluded.confirmed_via`,
      )
      .run(
        claim.id,
        claim.person_id,
        claim.session_id,
        claim.type,
        claim.op,
        claim.summary,
        JSON.stringify(claim.payload),
        JSON.stringify(claim.evidence),
        JSON.stringify(claim.tags),
        claim.status,
        claim.confidence ?? null,
        claim.replaces_claim_id ?? null,
        claim.confirmed_at ?? null,
        claim.confirmed_via ?? null,
        claim.created_at,
      );
  }

  getClaim(id: string): Claim | null {
    const row = this.db
      .prepare(
        `SELECT id, person_id, session_id, type, op, summary, payload_json, evidence_json,
                tags_json, status, confidence, replaces_claim_id, confirmed_at, confirmed_via, created_at
         FROM claims WHERE id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return rowToClaim(row);
  }

  listClaimsByPerson(personId: string): Claim[] {
    const rows = this.db
      .prepare(
        `SELECT id, person_id, session_id, type, op, summary, payload_json, evidence_json,
                tags_json, status, confidence, replaces_claim_id, confirmed_at, confirmed_via, created_at
         FROM claims WHERE person_id = ?`,
      )
      .all(personId) as Record<string, unknown>[];
    return rows.map(rowToClaim);
  }

  upsertConfirmation(confirmation: Confirmation): void {
    this.db
      .prepare(
        `INSERT INTO confirmations (id, session_id, person_id, claim_ids_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           session_id=excluded.session_id,
           person_id=excluded.person_id,
           claim_ids_json=excluded.claim_ids_json,
           status=excluded.status`,
      )
      .run(
        confirmation.id,
        confirmation.session_id,
        confirmation.person_id,
        JSON.stringify(confirmation.claim_ids),
        confirmation.status,
        confirmation.created_at,
      );
  }

  getConfirmation(id: string): Confirmation | null {
    const row = this.db
      .prepare(
        `SELECT id, session_id, person_id, claim_ids_json, status, created_at
         FROM confirmations WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          session_id: string;
          person_id: string;
          claim_ids_json: string;
          status: Confirmation["status"];
          created_at: string;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      session_id: row.session_id,
      person_id: row.person_id,
      claim_ids: parseJson<string[]>(row.claim_ids_json),
      status: row.status,
      created_at: row.created_at,
    };
  }

  listConfirmations(status?: Confirmation["status"]): Confirmation[] {
    const rows = (
      status
        ? (this.db
            .prepare(
              `SELECT id, session_id, person_id, claim_ids_json, status, created_at
               FROM confirmations WHERE status = ?`,
            )
            .all(status) as Array<{
            id: string;
            session_id: string;
            person_id: string;
            claim_ids_json: string;
            status: Confirmation["status"];
            created_at: string;
          }>)
        : (this.db
            .prepare(
              `SELECT id, session_id, person_id, claim_ids_json, status, created_at
               FROM confirmations`,
            )
            .all() as Array<{
            id: string;
            session_id: string;
            person_id: string;
            claim_ids_json: string;
            status: Confirmation["status"];
            created_at: string;
          }>)
    );
    return rows.map((row) => ({
      id: row.id,
      session_id: row.session_id,
      person_id: row.person_id,
      claim_ids: parseJson<string[]>(row.claim_ids_json),
      status: row.status,
      created_at: row.created_at,
    }));
  }

  listSessionsForPerson(personId: string): Session[] {
    const rows = this.db
      .prepare(
        `SELECT id, started_at, ended_at, source, transcript_ref, transcript_text,
                participant_person_ids_json, status, created_at
         FROM sessions`,
      )
      .all() as Array<{
      id: string;
      started_at: string;
      ended_at: string | null;
      source: Session["source"];
      transcript_ref: string;
      participant_person_ids_json: string;
      status: Session["status"];
      created_at: string;
    }>;
    return rows
      .map((row) => ({
        id: row.id,
        started_at: row.started_at,
        ended_at: row.ended_at,
        source: row.source,
        transcript_ref: row.transcript_ref,
        participant_person_ids: parseJson<string[]>(row.participant_person_ids_json),
        status: row.status,
        created_at: row.created_at,
      }))
      .filter((s) => s.participant_person_ids.includes(personId));
  }

  toConfirmationItem(confirmation: Confirmation): ConfirmationItem | null {
    const person = this.getPerson(confirmation.person_id);
    if (!person) return null;
    const claims = confirmation.claim_ids
      .map((id) => this.getClaim(id))
      .filter((c): c is Claim => c !== null && c.status === "proposed")
      .map((c) => ({
        claim_id: c.id,
        type: c.type,
        op: c.op,
        summary: c.summary,
        tags: c.tags,
        evidence_quote: c.evidence.quote,
        payload: c.payload,
      }));
    return {
      confirmation_id: confirmation.id,
      session_id: confirmation.session_id,
      person: { id: person.id, display_name: person.display_name },
      claims,
    };
  }
}

function rowToClaim(row: Record<string, unknown>): Claim {
  return {
    id: row.id as string,
    person_id: row.person_id as string,
    session_id: row.session_id as string,
    type: row.type as Claim["type"],
    op: row.op as Claim["op"],
    summary: row.summary as string,
    payload: parseJson(row.payload_json as string),
    evidence: parseJson(row.evidence_json as string),
    tags: parseJson(row.tags_json as string),
    status: row.status as Claim["status"],
    confidence: (row.confidence as number | null) ?? null,
    replaces_claim_id: (row.replaces_claim_id as string | null) ?? null,
    confirmed_at: (row.confirmed_at as string | null) ?? null,
    confirmed_via: (row.confirmed_via as Claim["confirmed_via"]) ?? null,
    created_at: row.created_at as string,
  };
}
