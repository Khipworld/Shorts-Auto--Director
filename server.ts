import express from "express";
import path from "node:path";
import dotenv from "dotenv";
import { registerApiKeyRoutes } from "./apiKeys.server";
import { findVerifiedPhoto } from "./src/pipeline/7-subtitles-media/imageSearch.server";
import { splitNarrationIntoSubtitles, classifyAnthropicError } from "./src/pipeline/7-subtitles-media/subtitleSplit.server";
import { collectSourcesForGroup } from "./src/pipeline/1-data-collection/collectSources.server";
import { LIFECYCLE_GROUPS } from "./src/pipeline/1-data-collection/lifecycleGroups";
import { analyzeProsCons } from "./src/pipeline/2-pros-cons/analyzeProsCons.server";
import { verifySourcesForGroup } from "./src/pipeline/3-verification/verifySources.server";
import { checkConstraints } from "./src/pipeline/4-constraints/checkConstraints.server";
import { generateHookSeo } from "./src/pipeline/5-hook-seo/generateHookSeo.server";
import { generateScript } from "./src/pipeline/6-script/generateScript.server";
import { packageOutput } from "./src/pipeline/8-platform-output/packageOutput.server";

dotenv.config();
dotenv.config({ path: ".env.local", override: true });

const app = express();
const PORT = Number(process.env.PORT) || 3100;

app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(process.cwd(), "public")));

// 설정 콘솔: 외부 API 키 등록/테스트 (암호화 저장)
registerApiKeyRoutes(app);

// [1] 자료 수집 — 생애주기 그룹 목록 (정보/시사성 > 정부지원사업·정책 안내 1차 카테고리)
app.get("/api/pipeline/1/groups", (_req, res) => {
  res.json({ groups: LIFECYCLE_GROUPS });
});

// [1] 자료 수집 — 그룹 하나에 대해 웹 검색으로 출처 수집 + 신뢰도 등급 + 신규/변경 판정
app.post("/api/pipeline/1/collect", async (req, res) => {
  try {
    const { groupId } = req.body ?? {};
    if (!groupId || typeof groupId !== "string") {
      return res.status(400).json({ error: "groupId 값이 필요합니다." });
    }
    const result = await collectSourcesForGroup(groupId);
    return res.json(result);
  } catch (error: any) {
    console.error("Data collection error:", error);
    const quota = classifyAnthropicError(String(error?.message || error));
    return res.status(500).json({ error: "자료 수집에 실패했습니다.", details: error?.message || error, isQuotaError: quota.isQuotaError, billingUrl: quota.billingUrl });
  }
});

// [2] 장단점 분석 — [1]단계 최신 수집 결과 기반 장단점 리포트
app.post("/api/pipeline/2/analyze", async (req, res) => {
  try {
    const { groupId } = req.body ?? {};
    if (!groupId || typeof groupId !== "string") {
      return res.status(400).json({ error: "groupId 값이 필요합니다." });
    }
    const result = await analyzeProsCons(groupId);
    return res.json(result);
  } catch (error: any) {
    console.error("Pros/cons analysis error:", error);
    const quota = classifyAnthropicError(String(error?.message || error));
    return res.status(500).json({ error: error?.message || "장단점 분석에 실패했습니다.", isQuotaError: quota.isQuotaError, billingUrl: quota.billingUrl });
  }
});

// [3] 사실/신뢰성 검증 — 교차 확인 + 신뢰도 등급 + 미검증 분리, 판단 근거 로그 포함
app.post("/api/pipeline/3/verify", async (req, res) => {
  try {
    const { groupId } = req.body ?? {};
    if (!groupId || typeof groupId !== "string") {
      return res.status(400).json({ error: "groupId 값이 필요합니다." });
    }
    const result = await verifySourcesForGroup(groupId);
    return res.json(result);
  } catch (error: any) {
    console.error("Verification error:", error);
    const quota = classifyAnthropicError(String(error?.message || error));
    return res.status(500).json({ error: error?.message || "검증에 실패했습니다.", isQuotaError: quota.isQuotaError, billingUrl: quota.billingUrl });
  }
});

// [4] 제약조건 파악 — 정치적 편향/명예훼손/미성년자 규제/광고표시/저작권 사전 안내
app.post("/api/pipeline/4/check", async (req, res) => {
  try {
    const { groupId, isSponsoredContent } = req.body ?? {};
    if (!groupId || typeof groupId !== "string") {
      return res.status(400).json({ error: "groupId 값이 필요합니다." });
    }
    const result = await checkConstraints(groupId, { isSponsoredContent });
    return res.json(result);
  } catch (error: any) {
    console.error("Constraint check error:", error);
    const quota = classifyAnthropicError(String(error?.message || error));
    return res.status(500).json({ error: error?.message || "제약조건 확인에 실패했습니다.", isQuotaError: quota.isQuotaError, billingUrl: quota.billingUrl });
  }
});

// [5] 플랫폼별 후킹·SEO 분석
app.post("/api/pipeline/5/hook-seo", async (req, res) => {
  try {
    const { groupId, platforms } = req.body ?? {};
    if (!groupId || typeof groupId !== "string") {
      return res.status(400).json({ error: "groupId 값이 필요합니다." });
    }
    const result = await generateHookSeo(groupId, Array.isArray(platforms) ? platforms : undefined);
    return res.json(result);
  } catch (error: any) {
    console.error("Hook/SEO generation error:", error);
    const quota = classifyAnthropicError(String(error?.message || error));
    return res.status(500).json({ error: error?.message || "후킹/SEO 생성에 실패했습니다.", isQuotaError: quota.isQuotaError, billingUrl: quota.billingUrl });
  }
});

// [6] 대본 생성
app.post("/api/pipeline/6/script", async (req, res) => {
  try {
    const { groupId, platformId, chosenHook } = req.body ?? {};
    if (!groupId || typeof groupId !== "string") return res.status(400).json({ error: "groupId 값이 필요합니다." });
    if (!platformId || typeof platformId !== "string") return res.status(400).json({ error: "platformId 값이 필요합니다." });
    const result = await generateScript(groupId, platformId, { chosenHook });
    return res.json(result);
  } catch (error: any) {
    console.error("Script generation error:", error);
    const quota = classifyAnthropicError(String(error?.message || error));
    return res.status(500).json({ error: error?.message || "대본 생성에 실패했습니다.", isQuotaError: quota.isQuotaError, billingUrl: quota.billingUrl });
  }
});

// [8] 플랫폼별 출력물 생성 — 제목/설명/해시태그/대본/자막을 하나로 묶은 업로드 패키지
app.post("/api/pipeline/8/package", async (req, res) => {
  try {
    const { groupId, platformId } = req.body ?? {};
    if (!groupId || typeof groupId !== "string") return res.status(400).json({ error: "groupId 값이 필요합니다." });
    if (!platformId || typeof platformId !== "string") return res.status(400).json({ error: "platformId 값이 필요합니다." });
    const result = await packageOutput(groupId, platformId);
    return res.json(result);
  } catch (error: any) {
    console.error("Output packaging error:", error);
    const quota = classifyAnthropicError(String(error?.message || error));
    return res.status(500).json({ error: error?.message || "출력물 패키징에 실패했습니다.", isQuotaError: quota.isQuotaError, billingUrl: quota.billingUrl });
  }
});

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
