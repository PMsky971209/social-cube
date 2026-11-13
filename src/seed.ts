import type { Claim, Person, Session } from "../types.ts";
import type { Confirmation, Store } from "./store.ts";
import { nowIso } from "./store.ts";

/** Deterministic demo data so smoke tests are stable. */
export function seedDemo(store: Store): void {
  const created = nowIso();

  const zhang: Person = {
    id: "p_zhang",
    display_name: "张三",
    aliases: ["老张", "张总"],
    relationship_temperature: null,
    created_at: created,
    updated_at: created,
  };

  const session: Session = {
    id: "s_demo",
    started_at: "2026-11-12T02:00:00.000Z",
    ended_at: "2026-11-12T03:00:00.000Z",
    source: "qwen_earbuds",
    transcript_ref: "demo://transcript/s_demo",
    participant_person_ids: ["p_zhang"],
    status: "extracted",
    created_at: created,
  };

  const claims: Claim[] = [
    {
      id: "c_commit",
      person_id: "p_zhang",
      session_id: "s_demo",
      type: "commitment",
      op: "add",
      summary: "对方承诺下周发报价",
      payload: {
        text: "下周发报价",
        due_at: "2026-11-20T00:00:00.000Z",
        owner: "them",
      },
      evidence: { quote: "我下周把报价发你", t_start: 312.5 },
      tags: ["报价", "下周", "对方承诺"],
      status: "proposed",
      confidence: 0.82,
      created_at: created,
    },
    {
      id: "c_stance",
      person_id: "p_zhang",
      session_id: "s_demo",
      type: "stance",
      op: "add",
      summary: "对方对价格偏谨慎",
      payload: { topic: "价格", position: "偏谨慎、要再比两家" },
      evidence: { quote: "价格我再看看，可能要比两家" },
      tags: ["价格", "偏谨慎"],
      status: "proposed",
      confidence: 0.74,
      created_at: created,
    },
    {
      id: "c_temp",
      person_id: "p_zhang",
      session_id: "s_demo",
      type: "relationship_temperature",
      op: "add",
      summary: "关系温度偏暖",
      payload: { value: "warm", note: "语气熟络，有后续合作意向" },
      evidence: { quote: "咱们合作挺顺的，下周继续聊" },
      tags: ["warm", "合作"],
      status: "proposed",
      confidence: 0.7,
      created_at: created,
    },
    {
      id: "c_taboo",
      person_id: "p_zhang",
      session_id: "s_demo",
      type: "taboo",
      op: "add",
      summary: "忌讳谈前任公司",
      payload: { topic: "前任公司", note: "对方主动跳过该话题" },
      evidence: { quote: "那个就算了，换个话题" },
      tags: ["前任公司"],
      status: "proposed",
      confidence: 0.66,
      created_at: created,
    },
  ];

  const confirmation: Confirmation = {
    id: "cnf_demo",
    session_id: "s_demo",
    person_id: "p_zhang",
    claim_ids: claims.map((c) => c.id),
    status: "pending",
    created_at: created,
  };

  store.people.set(zhang.id, zhang);
  store.sessions.set(session.id, session);
  for (const claim of claims) store.claims.set(claim.id, claim);
  store.confirmations.set(confirmation.id, confirmation);
}
