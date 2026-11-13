import type {
  Claim,
  ConfirmationItem,
  Person,
  Session,
} from "../types.ts";

export interface Confirmation {
  id: string;
  session_id: string;
  person_id: string;
  claim_ids: string[];
  status: "pending" | "decided";
  created_at: string;
}

export interface Store {
  people: Map<string, Person>;
  sessions: Map<string, Session>;
  claims: Map<string, Claim>;
  confirmations: Map<string, Confirmation>;
}

export function createStore(): Store {
  return {
    people: new Map(),
    sessions: new Map(),
    claims: new Map(),
    confirmations: new Map(),
  };
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function toConfirmationItem(
  store: Store,
  confirmation: Confirmation,
): ConfirmationItem | null {
  const person = store.people.get(confirmation.person_id);
  if (!person) return null;

  const claims = confirmation.claim_ids
    .map((id) => store.claims.get(id))
    .filter((c): c is Claim => c !== undefined && c.status === "proposed")
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
