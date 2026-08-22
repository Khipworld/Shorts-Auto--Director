import express from "express";
import dotenv from "dotenv";
import { registerApiKeyRoutes } from "./apiKeys.server";
import { findVerifiedPhoto } from "./src/pipeline/7-subtitles-media/imageSearch.server";
import { splitNarrationIntoSubtitles, classifyAnthropicError } from "./src/pipeline/7-subtitles-media/subtitleSplit.server";

dotenv.config();
dotenv.config({ path: ".env.local", override: true });

const app = express();
const PORT = Number(process.env.PORT) || 3100;

app.use(express.json({ limit: "20mb" }));

// 설정 콘솔: 외부 API 키 등록/테스트 (암호화 저장)
registerApiKeyRoutes(app);

// [7] 자막·영상 소재 생성 — 재사용 이미지 검색+검증 파이프라인
app.post("/api/images/find", async (req, res) => {
  try {
    const { query, subject, context } = req.body ?? {};
    if (!query || typeof query !== "string" || !query.trim()) {
      return res.status(400).json({ error: "query 값이 필요합니다." });
    }
    const result = await findVerifiedPhoto(query.trim(), subject || query, context || "");
    if (result && "quotaError" in result) {
      return res.json({ photo: null, isQuotaError: true, billingUrl: result.billingUrl });
    }
    return res.json({ photo: result, isQuotaError: false });
  } catch (error: any) {
    console.error("Image search error:", error);
    return res.status(500).json({ error: "이미지 검색에 실패했습니다.", details: error?.message || error });
  }
});

// [7] 자막·영상 소재 생성 — 재사용 자막 재분할 파이프라인
app.post("/api/subtitles/split", async (req, res) => {
  try {
    const { narration, duration, startTime = 0 } = req.body ?? {};
    if (!narration || typeof narration !== "string" || !narration.trim()) {
      return res.status(400).json({ error: "narration 값이 필요합니다." });
    }
    const subtitles = await splitNarrationIntoSubtitles(narration.trim(), Number(duration) || 30, Number(startTime) || 0);
    return res.json({ subtitles });
  } catch (error: any) {
    console.error("Subtitle split error:", error);
    const quota = classifyAnthropicError(String(error?.message || error));
    return res.status(500).json({ error: "자막 분할에 실패했습니다.", details: error?.message || error, isQuotaError: quota.isQuotaError, billingUrl: quota.billingUrl });
  }
});

app.listen(PORT, () => {
  console.log(`Shorts Auto Director server listening on http://localhost:${PORT}`);
});
