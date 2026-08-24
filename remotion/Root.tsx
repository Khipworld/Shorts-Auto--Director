import React from "react";
import { Composition } from "remotion";
import { staticFile } from "remotion";
import { Shorts, ShortsProps } from "./Shorts";
import { DEFAULT_BRAND, getBrandTheme } from "../src/brand";

// 비교 샘플 — 기존 결과물(임신부편 22.8초)과 같은 내용·같은 색으로 맞췄다.
// 장면 길이도 기존 영상에서 실제로 나온 값을 그대로 썼다.
const sceneSeconds = [5.0, 5.4, 5.2, 5.2, 5.0];

const theme = getBrandTheme(DEFAULT_BRAND, "pregnancy");

const props: ShortsProps = {
  channelName: DEFAULT_BRAND.channelName,
  logoSrc: staticFile("brand/logo.png"),
  highlight: theme.highlight,
  banner: "정부지원 안내",
  badge: "임신부 지원",
  headline: "임신하면 놓치기 쉬운 돈, 최대 220만원",
  cards: [
    { number: "01", title: "출산휴가급여 상한액 인상", highlight: "월 220만원", detail: "210만원에서 인상" },
    { number: "02", title: "회사도 지원받아요", highlight: "월 130만원", detail: "대체인력 채용 사업주 지원" },
    { number: "03", title: "임신·출산 진료비 지원", highlight: "국민행복카드", detail: "고위험 임산부 의료비 포함" },
  ],
  ctaHeadline: "내 지원금 지금 확인하세요",
  ctaButton: "프로필 링크에서 확인",
  ctaFootnote: "2026년 8월 기준",
  gradientTop: theme.gradientTop,
  gradientBottom: theme.gradientBottom,
  sceneSeconds,
};

const FPS = 30;
const total = Math.round(sceneSeconds.reduce((a, b) => a + b, 0) * FPS);

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Shorts"
    component={Shorts as unknown as React.FC<Record<string, unknown>>}
    durationInFrames={total}
    fps={FPS}
    width={1080}
    height={1920}
    defaultProps={props}
  />
);
