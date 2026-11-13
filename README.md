# 社交魔方 / social-cube

云端优先的会前回忆闭环：对谈 → Claim 差分草案 → 推送确认 → 人物 Brief。

## v0.1 API

SQLite 持久化（默认 `data/social-cube.sqlite`；测试用内存库）+ mock 抽取（无需 API key）。

| Method | Path | 作用 |
|--------|------|------|
| GET | `/health` | 健康检查 |
| POST | `/v1/people` | 创建人物 |
| POST | `/v1/sessions` | 入库一场对谈（含转写） |
| POST | `/v1/sessions/{id}/extract` | mock 抽取 → 打开确认单 |
| POST | `/v1/sessions/{id}/extractions` | 手工写入 proposed claims |
| GET | `/v1/inbox/confirmations` | 待确认推送卡片 |
| POST | `/v1/inbox/confirmations/{id}/decide` | accept / edit / reject |
| GET | `/v1/people/{id}/brief` | 会前一屏（仅已确认 Claim） |

契约见 `types.ts`、`openapi.yaml`。

### 规则

- 已确认 Claim 为真相源；Person 只存最后确认的关系温度。
- 不自动 accept；性格长文不进 v0.1。
- 语音确认复用同一 `decide` body。
- 离线后置；真 LLM 抽取可替换 `src/extract.ts`。

### 本地运行

```bash
npm install
npm run typecheck
npm run smoke
npm start          # http://127.0.0.1:8787 ，db=data/social-cube.sqlite
```

环境变量：

- `PORT`（默认 8787）
- `SOCIAL_CUBE_DB`（默认 `data/social-cube.sqlite`）
- `SOCIAL_CUBE_SEED=0` 关闭演示种子

演示种子：确认单 `cnf_demo`，人物 `p_zhang`。
