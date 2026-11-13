import type {
  Claim,
  ClaimDecision,
  ConfirmVia,
  DecideConfirmationResponse,
  Person,
  PersonBrief,
  RelationshipTemperature,
  RelationshipTemperaturePayload,
} from "../types.ts";
import type { Confirmation, Store } from "./store.ts";
import { nowIso } from "./store.ts";

export class ClaimError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "ClaimError";
  }
}

function assertProposed(claim: Claim): void {
  if (claim.status !== "proposed") {
    throw new ClaimError(
      `Claim ${claim.id} is ${claim.status}, expected proposed`,
      409,
    );
  }
}

function applySupersede(store: Store, claim: Claim): void {
  if (!claim.replaces_claim_id) return;
  const old = store.claims.get(claim.replaces_claim_id);
  if (old && (old.status === "accepted" || old.status === "edited")) {
    old.status = "superseded";
    store.claims.set(old.id, old);
  }
}

function syncTemperature(person: Person, claim: Claim): void {
  if (claim.type !== "relationship_temperature") return;
  if (claim.op === "retract") {
    person.relationship_temperature = null;
    return;
  }
  const payload = claim.payload as RelationshipTemperaturePayload;
  person.relationship_temperature = payload.value;
}

function openCommitmentsCount(store: Store, personId: string): number {
  let n = 0;
  for (const claim of store.claims.values()) {
    if (
      claim.person_id === personId &&
      claim.type === "commitment" &&
      (claim.status === "accepted" || claim.status === "edited") &&
      claim.op !== "retract"
    ) {
      n += 1;
    }
  }
  return n;
}

export function applyDecisions(
  store: Store,
  confirmation: Confirmation,
  via: ConfirmVia,
  decisions: ClaimDecision[],
): DecideConfirmationResponse {
  if (confirmation.status === "decided") {
    throw new ClaimError("Confirmation already decided", 409);
  }

  const allowed = new Set(confirmation.claim_ids);
  const seen = new Set<string>();
  const applied: string[] = [];
  const rejected: string[] = [];
  const decidedAt = nowIso();

  for (const decision of decisions) {
    if (!allowed.has(decision.claim_id)) {
      throw new ClaimError(
        `Claim ${decision.claim_id} is not in this confirmation`,
      );
    }
    if (seen.has(decision.claim_id)) {
      throw new ClaimError(`Duplicate decision for ${decision.claim_id}`);
    }
    seen.add(decision.claim_id);

    const claim = store.claims.get(decision.claim_id);
    if (!claim) {
      throw new ClaimError(`Unknown claim ${decision.claim_id}`, 404);
    }
    assertProposed(claim);

    if (decision.action === "reject") {
      claim.status = "rejected";
      claim.confirmed_at = decidedAt;
      claim.confirmed_via = via;
      store.claims.set(claim.id, claim);
      rejected.push(claim.id);
      continue;
    }

    if (decision.action === "edit") {
      if (!decision.patch) {
        throw new ClaimError(`edit requires patch for ${claim.id}`);
      }
      if (decision.patch.summary !== undefined) {
        claim.summary = decision.patch.summary;
      }
      if (decision.patch.payload !== undefined) {
        claim.payload = decision.patch.payload;
      }
      if (decision.patch.tags !== undefined) {
        claim.tags = decision.patch.tags;
      }
      claim.status = "edited";
    } else {
      claim.status = "accepted";
    }

    if (decision.selected_tags !== undefined) {
      claim.tags = decision.selected_tags;
    }

    claim.confirmed_at = decidedAt;
    claim.confirmed_via = via;
    applySupersede(store, claim);

    const person = store.people.get(claim.person_id);
    if (!person) {
      throw new ClaimError(`Unknown person ${claim.person_id}`, 404);
    }
    syncTemperature(person, claim);
    person.updated_at = decidedAt;
    store.people.set(person.id, person);
    store.claims.set(claim.id, claim);
    applied.push(claim.id);
  }

  // Any undecided proposed claims in this confirmation stay proposed;
  // mark confirmation decided once the user submitted a decide call.
  confirmation.status = "decided";
  store.confirmations.set(confirmation.id, confirmation);

  const personId = confirmation.person_id;
  const person = store.people.get(personId)!;

  return {
    person_id: personId,
    applied,
    rejected,
    person_preview: {
      relationship_temperature:
        (person.relationship_temperature as RelationshipTemperature | null) ??
        null,
      open_commitments_count: openCommitmentsCount(store, personId),
    },
  };
}

export function buildPersonBrief(
  store: Store,
  personId: string,
): PersonBrief | null {
  const person = store.people.get(personId);
  if (!person) return null;

  const live = [...store.claims.values()].filter(
    (c) =>
      c.person_id === personId &&
      (c.status === "accepted" || c.status === "edited") &&
      c.op !== "retract",
  );

  const commitments = live
    .filter((c) => c.type === "commitment")
    .map((c) => {
      const payload = c.payload as {
        text: string;
        due_at?: string | null;
        owner: "me" | "them" | "both";
      };
      return {
        claim_id: c.id,
        summary: c.summary,
        due_at: payload.due_at ?? null,
        owner: payload.owner,
      };
    });

  const stances = live
    .filter((c) => c.type === "stance")
    .map((c) => {
      const payload = c.payload as { topic: string; position: string };
      return {
        claim_id: c.id,
        topic: payload.topic,
        position: payload.position,
      };
    });

  const taboos = live
    .filter((c) => c.type === "taboo")
    .map((c) => {
      const payload = c.payload as { topic: string; note?: string | null };
      return {
        claim_id: c.id,
        topic: payload.topic,
        note: payload.note ?? null,
      };
    });

  let lastSessionAt: string | null = null;
  for (const session of store.sessions.values()) {
    if (!session.participant_person_ids.includes(personId)) continue;
    if (!lastSessionAt || session.started_at > lastSessionAt) {
      lastSessionAt = session.started_at;
    }
  }

  return {
    person: {
      id: person.id,
      display_name: person.display_name,
      relationship_temperature: person.relationship_temperature ?? null,
    },
    commitments,
    stances,
    taboos,
    last_session_at: lastSessionAt,
  };
}
