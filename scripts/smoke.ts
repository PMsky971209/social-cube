import { createApp } from "../src/app.ts";
import { openDb } from "../src/db.ts";
import { extractClaims } from "../src/extract.ts";
import { normalizeProposedClaims } from "../src/extract-validate.ts";


async function req(
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  body?: unknown,
) {
  const init: RequestInit = {
    method,
    headers: { "content-type": "application/json" },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await app.request(path, init);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  return { status: res.status, data };
}

async function main() {
  // --- schema normalize (Qwen JSON shape) ---
  const normalized = normalizeProposedClaims("p_x", {
    claims: [
      {
        type: "commitment",
        op: "add",
        summary: "对方承诺下周发报价，这是一句很长很长会被截断的摘要文字多余部分",
        payload: { text: "下周发报价", owner: "them", due_at: null },
        evidence: { quote: "我下周把报价发你" },
        tags: ["报价"],
        confidence: 0.9,
      },
      { type: "stance", summary: "缺 payload", evidence: { quote: "x" } },
    ],
  });
  if (normalized.length !== 1 || normalized[0]!.summary.length > 40) {
    throw new Error("normalizeProposedClaims failed");
  }

  // --- force mock extract (no network) ---
  process.env.SOCIAL_CUBE_EXTRACTOR = "mock";
  const mock = await extractClaims({
    person_id: "p_x",
    person_display_name: "测试",
    transcript_text: "我下周把报价发你。价格再看看。合作挺顺的。",
  });
  if (mock.extractor !== "mock" || mock.claims.length < 1) {
    throw new Error("mock extractClaims failed");
  }

  // --- seeded decide/brief path ---
  const seeded = createApp({ db: openDb(":memory:"), seed: true });

  const inbox = await req(seeded, "GET", "/v1/inbox/confirmations?status=pending");
  if (inbox.data.items.length !== 1) {
    throw new Error(`expected 1 pending confirmation, got ${inbox.data.items.length}`);
  }
  const confirmationId = inbox.data.items[0].confirmation_id as string;

  const emptyBrief = await req(seeded, "GET", "/v1/people/p_zhang/brief");
  if (
    emptyBrief.data.commitments.length !== 0 ||
    emptyBrief.data.stances.length !== 0 ||
    emptyBrief.data.taboos.length !== 0
  ) {
    throw new Error("brief should be empty before confirmation");
  }

  const decided = await req(
    seeded,
    "POST",
    `/v1/inbox/confirmations/${confirmationId}/decide`,
    {
      via: "push",
      decisions: [
        {
          claim_id: "c_commit",
          action: "accept",
          selected_tags: ["报价", "下周"],
        },
        {
          claim_id: "c_stance",
          action: "edit",
          selected_tags: ["偏谨慎"],
          patch: {
            summary: "对方对价格偏谨慎",
            payload: { topic: "价格", position: "偏谨慎、要再比两家" },
          },
        },
        { claim_id: "c_temp", action: "accept", selected_tags: ["warm"] },
        { claim_id: "c_taboo", action: "reject" },
      ],
    },
  );

  if (decided.data.applied.length !== 3 || decided.data.rejected.length !== 1) {
    throw new Error(`unexpected decide result: ${JSON.stringify(decided.data)}`);
  }
  if (decided.data.person_preview.relationship_temperature !== "warm") {
    throw new Error("temperature should sync to warm");
  }

  const brief = await req(seeded, "GET", "/v1/people/p_zhang/brief");
  if (brief.data.commitments.length !== 1) {
    throw new Error("expected 1 commitment in brief");
  }
  if (brief.data.taboos.length !== 0) {
    throw new Error("rejected taboo must not appear in brief");
  }

  // --- ingest → mock extract → decide persistence across reopen ---
  const dbPath = ":memory:";
  const db = openDb(dbPath);
  const app = createApp({ db, seed: false });

  const person = await req(app, "POST", "/v1/people", {
    id: "p_li",
    display_name: "李四",
    aliases: ["小李"],
  });

  const session = await req(app, "POST", "/v1/sessions", {
    person_id: person.data.id,
    source: "upload",
    transcript_text:
      "我下周把方案发你。价格我再看看，要比两家。咱们合作挺顺的。前任公司别提了，换个话题。",
  });

  const extracted = await req(
    app,
    "POST",
    `/v1/sessions/${session.data.id}/extract`,
  );
  if (!extracted.data.confirmation_id || extracted.data.claim_ids.length < 2) {
    throw new Error(`extract failed: ${JSON.stringify(extracted.data)}`);
  }

  const pending = await req(app, "GET", "/v1/inbox/confirmations?status=pending");
  const card = pending.data.items.find(
    (i: { confirmation_id: string }) =>
      i.confirmation_id === extracted.data.confirmation_id,
  );
  if (!card) throw new Error("extracted confirmation missing from inbox");

  const decisions = card.claims.map(
    (claim: { claim_id: string }, index: number) => ({
      claim_id: claim.claim_id,
      action: index === card.claims.length - 1 ? "reject" : "accept",
    }),
  );
  await req(app, "POST", `/v1/inbox/confirmations/${card.confirmation_id}/decide`, {
    via: "push",
    decisions,
  });

  // reopen same in-memory handle via new app on same db object
  const app2 = createApp({ db, seed: false });
  const brief2 = await req(app2, "GET", `/v1/people/${person.data.id}/brief`);
  if (brief2.data.commitments.length + brief2.data.stances.length === 0) {
    throw new Error("persisted brief should include accepted claims");
  }

  console.log("smoke ok");
  console.log(
    JSON.stringify(
      {
        seeded_decide: decided.data,
        seeded_brief: brief.data,
        extract: extracted.data,
        persisted_brief: brief2.data,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
