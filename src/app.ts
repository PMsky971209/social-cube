import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type {
  CreateExtractionRequest,
  DecideConfirmationRequest,
  ProposedClaimInput,
} from "../types.ts";
import { applyDecisions, buildPersonBrief, ClaimError } from "./claim-machine.ts";
import { seedDemo } from "./seed.ts";
import {
  createStore,
  newId,
  nowIso,
  toConfirmationItem,
  type Store,
} from "./store.ts";

export function createApp(store: Store = createStore(), seed = true): Hono {
  if (seed) seedDemo(store);

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

  app.get("/health", (c) => c.json({ ok: true, service: "social-cube" }));

  app.post("/v1/sessions/:session_id/extractions", async (c) => {
    const sessionId = c.req.param("session_id");
    const session = store.sessions.get(sessionId);
    if (!session) {
      throw new ClaimError(`Unknown session ${sessionId}`, 404);
    }

    const body = (await c.req.json()) as CreateExtractionRequest;
    if (!body?.claims?.length) {
      throw new ClaimError("claims required");
    }

    const createdAt = nowIso();
    const claimIds: string[] = [];
    let personId: string | null = null;

    for (const input of body.claims as ProposedClaimInput[]) {
      if (!store.people.has(input.person_id)) {
        throw new ClaimError(`Unknown person ${input.person_id}`, 404);
      }
      if (personId && personId !== input.person_id) {
        throw new ClaimError(
          "v0.1 extractions support one person_id per confirmation",
        );
      }
      personId = input.person_id;

      const id = newId("c");
      store.claims.set(id, {
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

    session.status = "extracted";
    store.sessions.set(session.id, session);

    const confirmationId = newId("cnf");
    store.confirmations.set(confirmationId, {
      id: confirmationId,
      session_id: sessionId,
      person_id: personId!,
      claim_ids: claimIds,
      status: "pending",
      created_at: createdAt,
    });

    return c.json(
      {
        session_id: sessionId,
        claim_ids: claimIds,
        confirmation_id: confirmationId,
      },
      201,
    );
  });

  app.get("/v1/inbox/confirmations", (c) => {
    const status = c.req.query("status") ?? "pending";
    const items = [...store.confirmations.values()]
      .filter((cnf) => cnf.status === status)
      .map((cnf) => toConfirmationItem(store, cnf))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .filter((item) => status !== "pending" || item.claims.length > 0);

    return c.json({ items });
  });

  app.post("/v1/inbox/confirmations/:confirmation_id/decide", async (c) => {
    const confirmationId = c.req.param("confirmation_id");
    const confirmation = store.confirmations.get(confirmationId);
    if (!confirmation) {
      throw new ClaimError(`Unknown confirmation ${confirmationId}`, 404);
    }

    const body = (await c.req.json()) as DecideConfirmationRequest;
    if (!body?.via || !body.decisions?.length) {
      throw new ClaimError("via and decisions required");
    }

    const result = applyDecisions(store, confirmation, body.via, body.decisions);
    return c.json(result);
  });

  app.get("/v1/people/:person_id/brief", (c) => {
    const brief = buildPersonBrief(store, c.req.param("person_id"));
    if (!brief) {
      throw new ClaimError("Person not found", 404);
    }
    return c.json(brief);
  });

  return app;
}
