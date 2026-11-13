import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type {
  CreateExtractionRequest,
  DecideConfirmationRequest,
  ProposedClaimInput,
  SessionSource,
} from "../types.ts";
import { applyDecisions, buildPersonBrief, ClaimError } from "./claim-machine.ts";
import { openDb, type Db } from "./db.ts";
import { extractClaimsMock } from "./extract.ts";
import { Repo } from "./repo.ts";
import { seedDemo } from "./seed.ts";
import { newId, nowIso } from "./store.ts";

export interface CreateAppOptions {
  db?: Db;
  seed?: boolean;
}

function writeProposedClaims(
  repo: Repo,
  sessionId: string,
  claims: ProposedClaimInput[],
) {
  const createdAt = nowIso();
  const claimIds: string[] = [];
  let personId: string | null = null;

  for (const input of claims) {
    if (!repo.getPerson(input.person_id)) {
      throw new ClaimError(`Unknown person ${input.person_id}`, 404);
    }
    if (personId && personId !== input.person_id) {
      throw new ClaimError(
        "v0.1 supports one person_id per confirmation",
      );
    }
    personId = input.person_id;

    const id = newId("c");
    repo.upsertClaim({
      id,
      person_id: input.person_id,
      session_id: sessionId,
      type: input.type,
      op: input.op,
      summary: input.summary,
      payload: input.payload,
      evidence: input.evidence,
      tags: input.tags ?? [],
      status: "proposed",
      confidence: input.confidence ?? null,
      replaces_claim_id: input.replaces_claim_id ?? null,
      created_at: createdAt,
    });
    claimIds.push(id);
  }

  if (!personId) {
    throw new ClaimError("claims required");
  }

  const session = repo.getSession(sessionId);
  if (!session) {
    throw new ClaimError(`Unknown session ${sessionId}`, 404);
  }
  session.status = "extracted";
  repo.upsertSession(session);

  const confirmationId = newId("cnf");
  repo.upsertConfirmation({
    id: confirmationId,
    session_id: sessionId,
    person_id: personId,
    claim_ids: claimIds,
    status: "pending",
    created_at: createdAt,
  });

  return {
    session_id: sessionId,
    claim_ids: claimIds,
    confirmation_id: confirmationId,
  };
}

export function createApp(options: CreateAppOptions = {}): Hono {
  const db = options.db ?? openDb(":memory:");
  const repo = new Repo(db);
  if (options.seed ?? true) seedDemo(repo);

  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof ClaimError) {
      return c.json(
        { error: err.message },
        err.status as 400 | 404 | 409 | 500,
      );
    }
    if (err instanceof HTTPException) {
      return err.getResponse();
    }
    console.error(err);
    return c.json({ error: "internal_error" }, 500);
  });

  app.get("/health", (c) =>
    c.json({ ok: true, service: "social-cube", storage: "sqlite" }),
  );

  app.post("/v1/people", async (c) => {
    const body = (await c.req.json()) as {
      display_name?: string;
      aliases?: string[];
      id?: string;
    };
    if (!body.display_name?.trim()) {
      throw new ClaimError("display_name required");
    }
    const created = nowIso();
    const person = {
      id: body.id?.trim() || newId("p"),
      display_name: body.display_name.trim(),
      aliases: body.aliases ?? [],
      relationship_temperature: null,
      created_at: created,
      updated_at: created,
    };
    if (repo.getPerson(person.id)) {
      throw new ClaimError(`Person ${person.id} already exists`, 409);
    }
    repo.upsertPerson(person);
    return c.json(person, 201);
  });

  app.post("/v1/sessions", async (c) => {
    const body = (await c.req.json()) as {
      person_id?: string;
      transcript_text?: string;
      source?: SessionSource;
      started_at?: string;
      ended_at?: string | null;
      id?: string;
    };
    if (!body.person_id) throw new ClaimError("person_id required");
    if (!body.transcript_text?.trim()) {
      throw new ClaimError("transcript_text required");
    }
    if (!repo.getPerson(body.person_id)) {
      throw new ClaimError(`Unknown person ${body.person_id}`, 404);
    }

    const created = nowIso();
    const id = body.id?.trim() || newId("s");
    if (repo.getSession(id)) {
      throw new ClaimError(`Session ${id} already exists`, 409);
    }

    const session = {
      id,
      started_at: body.started_at ?? created,
      ended_at: body.ended_at ?? null,
      source: body.source ?? "upload",
      transcript_ref: `sqlite://sessions/${id}`,
      transcript_text: body.transcript_text.trim(),
      participant_person_ids: [body.person_id],
      status: "ingested" as const,
      created_at: created,
    };
    repo.upsertSession(session);
    return c.json(session, 201);
  });

  app.post("/v1/sessions/:session_id/extract", async (c) => {
    const sessionId = c.req.param("session_id");
    const session = repo.getSession(sessionId);
    if (!session) {
      throw new ClaimError(`Unknown session ${sessionId}`, 404);
    }
    const personId = session.participant_person_ids[0];
    if (!personId) {
      throw new ClaimError("session has no participant");
    }
    const person = repo.getPerson(personId);
    if (!person) {
      throw new ClaimError(`Unknown person ${personId}`, 404);
    }
    if (!session.transcript_text?.trim()) {
      throw new ClaimError("session has no transcript_text");
    }

    const claims = extractClaimsMock({
      person_id: person.id,
      person_display_name: person.display_name,
      transcript_text: session.transcript_text,
    });
    const result = writeProposedClaims(repo, sessionId, claims);
    return c.json({ ...result, extractor: "mock" }, 201);
  });

  app.post("/v1/sessions/:session_id/extractions", async (c) => {
    const sessionId = c.req.param("session_id");
    if (!repo.getSession(sessionId)) {
      throw new ClaimError(`Unknown session ${sessionId}`, 404);
    }

    const body = (await c.req.json()) as CreateExtractionRequest;
    if (!body?.claims?.length) {
      throw new ClaimError("claims required");
    }

    const result = writeProposedClaims(repo, sessionId, body.claims);
    return c.json(result, 201);
  });

  app.get("/v1/inbox/confirmations", (c) => {
    const status = (c.req.query("status") ?? "pending") as
      | "pending"
      | "decided";
    const items = repo
      .listConfirmations(status)
      .map((cnf) => repo.toConfirmationItem(cnf))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .filter((item) => status !== "pending" || item.claims.length > 0);

    return c.json({ items });
  });

  app.post("/v1/inbox/confirmations/:confirmation_id/decide", async (c) => {
    const confirmationId = c.req.param("confirmation_id");
    const confirmation = repo.getConfirmation(confirmationId);
    if (!confirmation) {
      throw new ClaimError(`Unknown confirmation ${confirmationId}`, 404);
    }

    const body = (await c.req.json()) as DecideConfirmationRequest;
    if (!body?.via || !body.decisions?.length) {
      throw new ClaimError("via and decisions required");
    }

    const result = applyDecisions(repo, confirmation, body.via, body.decisions);
    return c.json(result);
  });

  app.get("/v1/people/:person_id/brief", (c) => {
    const brief = buildPersonBrief(repo, c.req.param("person_id"));
    if (!brief) {
      throw new ClaimError("Person not found", 404);
    }
    return c.json(brief);
  });

  return app;
}
