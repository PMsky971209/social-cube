# 社交魔方 / social-cube

云端优先的会前回忆闭环：对谈 → Claim 差分草案 → 推送确认 → 人物 Brief。

## 文件

| 文件 | 作用 |
|------|------|
| `types.ts` | TypeScript 契约 |
| `openapi.yaml` | HTTP API 形状 |

## 闭环

1. 接入一场 Session（耳机转写 / 上传）。
2. `POST /sessions/{id}/extractions` — 写入 `proposed` claims，打开确认单。
3. 推送 → `GET /inbox/confirmations` → 勾选标签。
4. `POST .../decide`（`via: push`，语音确认同形）— 仅 accepted/edited 进入 Brief。
5. `GET /people/{id}/brief` — 承诺 → 立场 → 温度 → 忌讳。

## 规则

- 已确认 Claim 为真相源；Person 只存最后确认的关系温度。
- 不自动 accept；性格长文不进 v0.1。
- 语音确认复用同一 `decide` body。
- 离线后置。
