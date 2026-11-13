import { createApp } from "../src/app.ts";
import { createStore } from "../src/store.ts";

async function req(
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  body?: unknown,
) {
  const init: RequestInit = { method, headers: { "content-type": "application/json" } };
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
  const store = createStore();
  const app = createApp(store, true);

  const inbox = await req(app, "GET", "/v1/inbox/confirmations?status=pending");
  if (inbox.data.items.length !== 1) {
    throw new Error(`expected 1 pending confirmation, got ${inbox.data.items.length}`);
  }
  const confirmationId = inbox.data.items[0].confirmation_id as string;

  const emptyBrief = await req(app, "GET", "/v1/people/p_zhang/brief");
  if (
    emptyBrief.data.commitments.length !== 0 ||
    emptyBrief.data.stances.length !== 0 ||
    emptyBrief.data.taboos.length !== 0
  ) {
    throw new Error("brief should be empty before confirmation");
  }

  const decided = await req(
    app,
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
  if (decided.data.person_preview.open_commitments_count !== 1) {
    throw new Error("open commitments should be 1");
  }

  const brief = await req(app, "GET", "/v1/people/p_zhang/brief");
  if (brief.data.commitments.length !== 1) {
    throw new Error("expected 1 commitment in brief");
  }
  if (brief.data.stances.length !== 1) {
    throw new Error("expected 1 stance in brief");
  }
  if (brief.data.taboos.length !== 0) {
    throw new Error("rejected taboo must not appear in brief");
  }
  if (brief.data.person.relationship_temperature !== "warm") {
    throw new Error("brief temperature mismatch");
  }

  const pendingAfter = await req(app, "GET", "/v1/inbox/confirmations?status=pending");
  if (pendingAfter.data.items.length !== 0) {
    throw new Error("inbox should be empty after decide");
  }

  console.log("smoke ok");
  console.log(
    JSON.stringify(
      {
        decide: decided.data,
        brief: brief.data,
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
