// 스튜디오 화면(StudioScreen)의 각종 선택지 정의.
//
// 값(id)은 실제 백엔드/외부 서비스가 쓰는 문자열과 일치시켜 둔다 — 화면에서만 쓰는
// 가짜 목록이 아니라, 나중에 백엔드를 붙일 때 그대로 넘길 수 있는 실제 식별자여야
// 화면과 실제 동작이 어긋나는 일이 없다.

// TTS 성우 — `C:\Claude_Project\tts-service\app.py`의 VOICE_PRESET_TO_SPEAKER에 실제로
// 정의된 8개 프리셋. videoRender.server.ts가 `voicePreset`으로 그대로 받아 쓰므로
// 이 선택은 실제 영상에 반영된다.
export const VOICE_PRESETS = [
  { id: "news-anchor", label: "뉴스 앵커 (또렷·신뢰감)" },
  { id: "male-documentary", label: "남성 다큐멘터리 (차분·낮은 톤)" },
  { id: "female-emotional", label: "여성 에세이 (부드러움·감성)" },
  { id: "shorts-active", label: "쇼츠 크리에이터 (밝고 활기참)" },
  { id: "bright-youth", label: "청춘 (발랄한 젊은 톤)" },
  { id: "senior-warm", label: "시니어 (중후함)" },
  { id: "mystic-dramatic", label: "드라마틱 (무게감)" },
  { id: "future-ai", label: "미래 AI (중성적·또렷함)" },
];

// BGM/SFX 프리셋 — K-Street(`src/App.tsx`의 BGM_TRACKS/SFX_TRACKS)에서 실제로 쓰던
// 트랙 id를 그대로 가져옴. 다만 이 프로젝트는 아직 음원 파일도, 믹싱하는 백엔드도 없다.
export const BGM_PRESETS = [
  { id: "epic-doc", label: "🎼 웅장한 다큐멘터리 오케스트라" },
  { id: "emotional-piano", label: "🎹 따뜻한 피아노 에세이" },
  { id: "shorts-synth", label: "⚡ 경쾌한 숏폼 신디사이저" },
  { id: "none", label: "사용 안 함" },
];

export const SFX_PRESETS = [
  { id: "epic-doc", label: "🎼 웅장한 다큐멘터리 전환음" },
  { id: "emotional-piano", label: "🎹 피아노 에세이 전환음" },
  { id: "shorts-synth", label: "⚡ 숏폼 신디사이저 전환음" },
  { id: "none", label: "사용 안 함" },
];

// 배포 규격. `supported`는 videoRender.server.ts의 RESOLUTIONS에 실제로 있는지 여부 —
// 목록에는 보여주되 아직 못 만드는 규격은 화면에서 명확히 구분해서 표시한다.
export const VIDEO_FORMATS = [
  { id: "shorts_9_16", label: "쇼츠 / 릴스 / 틱톡", ratio: "9:16" as const, supported: true },
  { id: "landscape_16_9", label: "가로 영상", ratio: "16:9" as const, supported: true },
  { id: "feed_4_5", label: "세로 피드", ratio: "4:5" as const, supported: false },
];

export function getFormat(formatId: string) {
  return VIDEO_FORMATS.find((f) => f.id === formatId) ?? VIDEO_FORMATS[0];
}

// 시작 화면의 예시 주제 — K-Street 온보딩의 "또는 예시 주제로 빠르게 시작하기" 패턴.
// 사용자가 빈 칸 앞에서 막히지 않게 실제로 쓸 법한 문구를 그룹별로 하나씩 넣어둔다.
export const TOPIC_EXAMPLES: Record<string, string> = {
  pregnancy: "2026년 임신·출산 지원금 총정리",
  infant_child: "2026년 영유아 양육 지원 총정리",
  teen: "2026년 청소년 교육·활동 지원 총정리",
  youth: "2026년 청년 지원 정책 총정리",
  middle_age: "2026년 중장년 재취업·창업 지원 총정리",
  senior: "2026년 어르신 복지·연금 지원 총정리",
};
