// [8] 플랫폼별 출력물 생성 — [5]후킹/SEO + [6]대본 + [7]자막을 하나로 묶어, 실제 영상 편집자
// (또는 이후 자동 렌더링 파이프라인)가 바로 쓸 수 있는 "업로드 패키지"를 만든다.
//
// 주의: 실제 mp4 렌더링(TTS 음성 합성, ffmpeg 인코딩)은 여기 포함되지 않는다 — TTS는 아직
// 라이선스 검토가 끝나지 않았고([[project-shorts-auto-director]] 참고, K-Street의 Coqui
// XTTS-v2는 비영리 전용이라 이 프로젝트엔 못 씀), 실제 렌더링 백엔드는 그 결정 이후 별도로
// 붙일 예정. 지금은 "제목/설명/해시태그 + 대본 + 자막 타임스탬프"를 패키징하는 것까지가 범위.
import { generateHookSeo } from "../5-hook-seo/generateHookSeo.server";
import { generateScript, ScriptResult } from "../6-script/generateScript.server";
import { getPlatformSpec } from "../5-hook-seo/platformSpecs";
import { splitNarrationIntoSubtitles, SubtitleLine } from "../7-subtitles-media/subtitleSplit.server";

export interface OutputPackage {
  groupId: string;
  groupLabel: string;
  platformId: string;
  platformLabel: string;
  aspectRatio: string;
  title: string;
  description: string;
  hashtags: string[];
  thumbnailPhrases: string[];
  narration: string;
  subtitles: SubtitleLine[];
  estimatedDurationSec: number;
  sourceUrlsUsed: string[];
  unverifiedLeakCheck: ScriptResult["unverifiedLeakCheck"];
}

function buildDescription(script: ScriptResult, chosenHook: string, hashtags: string[]): string {
  const sourcesLine =
    script.sourceUrlsUsed.length > 3
      ? `${script.sourceUrlsUsed.slice(0, 3).join(", ")} 외 ${script.sourceUrlsUsed.length - 3}건`
      : script.sourceUrlsUsed.join(", ");
  return [script.title, "", chosenHook, "", hashtags.join(" "), "", `※ 본 영상은 다음 출처를 참고해 제작되었습니다: ${sourcesLine}`].join("\n");
}

export async function packageOutput(groupId: string, platformId: string): Promise<OutputPackage> {
  const platformSpec = getPlatformSpec(platformId);
  if (!platformSpec) throw new Error(`알 수 없는 플랫폼입니다: ${platformId}`);

  const hookSeo = await generateHookSeo(groupId, [platformId]);
  const platformHookSeo = hookSeo.platforms[0];
  if (!platformHookSeo) throw new Error("후킹/SEO 결과를 가져오지 못했습니다.");
  const chosenHook = platformHookSeo.hooks[0] ?? "";

  const script = await generateScript(groupId, platformId, { chosenHook });
  const subtitles = await splitNarrationIntoSubtitles(script.narration, script.estimatedDurationSec, 0);

  return {
    groupId,
    groupLabel: script.groupLabel,
    platformId,
    platformLabel: platformHookSeo.platformLabel,
    aspectRatio: platformSpec.aspectRatio,
    title: script.title,
    description: buildDescription(script, chosenHook, platformHookSeo.hashtags),
    hashtags: platformHookSeo.hashtags,
    thumbnailPhrases: platformHookSeo.thumbnailPhrases,
    narration: script.narration,
    subtitles,
    estimatedDurationSec: script.estimatedDurationSec,
    sourceUrlsUsed: script.sourceUrlsUsed,
    unverifiedLeakCheck: script.unverifiedLeakCheck,
  };
}
