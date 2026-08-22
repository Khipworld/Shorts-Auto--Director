// 서버 파이프라인 모듈의 타입을 그대로 재사용 (타입 전용 import라 번들에 서버 코드가 섞이지 않음).
export type { LifecycleGroup } from "./pipeline/1-data-collection/lifecycleGroups";
export type { CollectionResult, CollectedSource } from "./pipeline/1-data-collection/collectSources.server";
export type { ProsConsReport, ItemProsCons } from "./pipeline/2-pros-cons/analyzeProsCons.server";
export type { VerificationReport, VerificationResult } from "./pipeline/3-verification/verifySources.server";
export type { ConstraintReport, ConstraintCheckItem } from "./pipeline/4-constraints/checkConstraints.server";
export type { HookSeoReport, PlatformHookSeo } from "./pipeline/5-hook-seo/generateHookSeo.server";
export type { PlatformSpec } from "./pipeline/5-hook-seo/platformSpecs";
export type { ScriptResult } from "./pipeline/6-script/generateScript.server";
export type { SubtitleLine } from "./pipeline/7-subtitles-media/subtitleSplit.server";
