# 社交魔方 / social-cube

云端优先的会前回忆闭环：对谈 → Claim 差分草案 → 推送确认 → 人物 Brief。

## v0.1 API

SQLite 持久化 + 抽取（**通义千问**优先，无 key 时回退 mock）。

| Method | Path | 作用 |
|--------|------|------|
| GET | `/health` | 健康检查（含当前 extractor） |
| POST | `/v1/people` | 创建人物 |
| POST | `/v1/sessions` | 入库一场对谈（含转写） |
| POST | `/v1/sessions/{id}/extract` | 抽取 → 打开确认单（qwen 或 mock） |
| POST | `/v1/sessions/{id}/extractions` | 手工写入 proposed claims |
| GET | `/v1/inbox/confirmations` | 待确认推送卡片 |
| POST | `/v1/inbox/confirmations/{id}/decide` | accept / edit / reject |
| GET | `/v1/people/{id}/brief` | 会前一屏（仅已确认 Claim） |

契约见 `types.ts`、`openapi.yaml`。

### 通义千问抽取

1. 在 [DashScope 控制台](https://dashscope.console.aliyun.com/) 创建 API Key  
2. 复制 `.env.example` → `.env`，填入 `DASHSCOPE_API_KEY`（**不要把 key 发到聊天里**）  
3. `npm start` 后 `POST .../extract` 会走 `qwen-plus`（可用 `SOCIAL_CUBE_QWEN_MODEL` 改）

实现：`src/extract-qwen.ts`（OpenAI 兼容模式）+ `src/extract-validate.ts`（校验 JSON，不合规直接丢弃）。  
仍不自动 accept——模型只产 `proposed`，必须经 `decide`。

### 规则

- 已确认 Claim 为真相源；Person 只存最后确认的关系温度。
- 不自动 accept；性格长文不进 v0.1。
- 语音确认复用同一 `decide` body。
- 离线后置。

### 本地运行

```bash
npm install
cp .env.example .env   # 可选：填入 DASHSCOPE_API_KEY
npm run typecheck
npm run smoke
npm start              # http://127.0.0.1:8787
```

环境变量：

- `PORT`（默认 8787）
- `SOCIAL_CUBE_DB`（默认 `data/social-cube.sqlite`）
- `SOCIAL_CUBE_SEED=0` 关闭演示种子
- `SOCIAL_CUBE_EXTRACTOR=auto|qwen|mock`
- `DASHSCOPE_API_KEY` / `SOCIAL_CUBE_QWEN_API_KEY`
- `SOCIAL_CUBE_QWEN_MODEL`（默认 `qwen-plus`）
- `SOCIAL_CUBE_QWEN_BASE_URL`（默认 DashScope 兼容模式）

演示种子：确认单 `cnf_demo`，人物 `p_zhang`。
