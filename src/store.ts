export interface Confirmation {
  id: string;
  session_id: string;
  person_id: string;
  claim_ids: string[];
  status: "pending" | "decided";
  created_at: string;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}
