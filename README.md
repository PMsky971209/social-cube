# 社交魔方 / social-cube

云端优先的会前回忆闭环：对谈 → Claim 差分草案 → 推送确认 → 人物 Brief。

## v0.1 API skeleton

内存存储 + 演示种子数据（张三 / 一场对谈 / 4 条 proposed claims）。

| Method | Path | 作用 |
|--------|------|------|
| GET | `/health` | 健康检查 |
| POST | `/v1/sessions/{session_id}/extractions` | 写入 proposed claims 并打开确认单 |
| GET | `/v1/inbox/confirmations` | 待确认推送卡片 |
| POST | `/v1/inbox/confirmations/{id}/decide` | accept / edit / reject（push/voice 同形） |
| GET | `/v1/people/{person_id}/brief` | 会前一屏（仅已确认 Claim） |

契约见 `types.ts`、`openapi.yaml`。

### 规则

- 已确认 Claim 为真相源；Person 只存最后确认的关系温度。
- 不自动 accept；性格长文不进 v0.1。
- 语音确认复用同一 `decide` body。
- 离线后置。

### 本地运行

```bash
npm install
npm start          # http://127.0.0.1:8787
npm run smoke      # 无服务进程的端到端断言
npm run typecheck
```

演示确认单 id：`cnf_demo`；人物 id：`p_zhang`。
