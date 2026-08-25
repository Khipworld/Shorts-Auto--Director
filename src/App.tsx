import { useState } from "react";
import StudioScreen from "./StudioScreen";
import WorkLogScreen from "./WorkLogScreen";
import type {
  CollectionResult,
  VerificationReport,
  ConstraintReport,
  HookSeoReport,
  AdReferenceReport,
  ScriptResult,
  SubtitleLine,
} from "./types";

export interface CardItem {
  badge: string; // "01", "02"...
  title: string;
  detail: string;
}

// 자막을 화면 어디에 놓을지. vertical/horizontal은 0~100 비율(50이 정중앙), margin은
// 자막 상자 좌우 여백. 미리보기에는 즉시 반영되지만, 실제 mp4에 반영하려면
// videoRender.server.ts의 drawtext 좌표 계산을 함께 고쳐야 한다(아직 미반영).
export interface SubtitleLayout {
  vertical: number;
  horizontal: number;
  margin: number;
}

// 음향 설정. voicePreset만 실제 렌더링에 전달되고(TTS 서비스가 지원하는 실제 값),
// BGM/SFX는 아직 음원 파일도 믹싱 백엔드도 없어서 화면 상태로만 보관한다.
export interface AudioSettings {
  voicePreset: string;
  speechSpeed: number; // 나레이션 말하기 속도 (0.8~1.8). 영상 길이를 좌우하는 값.

  // 각 음향은 켜고 끌 수 있다. 프리셋에 "사용 안 함"을 넣는 것보다 체크박스가 분명하다.
  bgmEnabled: boolean;
  bgmPreset: string;
  bgmVolume: number;

  // 내 음원 — 켜면 프리셋 BGM 대신 이 파일을 쓴다.
  // 뮤직비디오 모드도 여기로 들어온다(음악이 타임라인을 결정하는 방식).
  customBgmEnabled: boolean;
  customBgmId: string;   // 서버 보관함(/api/music)에 올린 음원의 id. 비어 있으면 아직 안 고름.
  customBgmName: string; // 화면에 보여줄 이름 (보관함에서 지우면 비워진다)
  customBgmVolume: number;

  sfxEnabled: boolean;
  sfxPreset: string;
  sfxVolume: number;
}

/**
 * 주제 외에 사용자가 더 정확히 지시하고 싶을 때 쓰는 항목들.
 * 사용자 지시(2026-08-26): 평소엔 접혀 있다가 필요할 때만 펼쳐 쓴다.
 * 비워두면 지금처럼 AI가 알아서 정한다.
 */
export interface BriefSettings {
  audience: string;      // 누구에게 (예: 20대 사회초년생)
  goal: string;          // 원하는 행동 (정보 전달 / 구매 / 방문 / 구독)
  tone: string;          // 톤 (정보전달 / 친근 / 긴박 / 감성)
  targetSeconds: number; // 길이 목표(초). 0이면 자동
  mustInclude: string;   // 꼭 넣을 내용
  mustAvoid: string;     // 빼야 할 내용
  isSponsoredContent: boolean; // 협찬 여부 — 여기로 옮김
}

/** 주제와 함께 넣는 소재. URL·사진·음악 파일을 받는다. */
export interface SourceMaterial {
  kind: "url" | "image" | "audio";
  value: string; // URL이면 주소, 파일이면 파일명
}

// 이 화면 세션에서 진행 중인 하나의 쇼츠 작업물 상태.
// 사용자 요구사항: "주제 입력 → 자료수집/검증/제약조건(내부 프로세스) → 결과물(영상을 보고
// 수정) → 수동 업로드" — [1][3][4]단계는 화면에 노출하지 않고 GeneratingScreen이 자동으로
// 순서대로 처리하며, 사용자에게는 시작 화면과 (영상) 결과 화면만 보인다.
//
// 2026-08-22 추가: 실제 Viralux 영상과 비교해본 결과, 나레이션 한 문단 + AI 배경 이미지
// 방식은 "이미지가 뭘 뜻하는지 모르겠다"는 문제가 있었음 — 정부기관 카드뉴스의 표준 포맷
// (번호 배지 + 제목 + 핵심수치 카드)으로 구조를 바꿈. hookHeadline(오프닝 후킹 문구)과
// cards(카드별 제목/핵심수치)가 나레이션/자막을 대체하는 편집 단위.
export interface ProjectState {
  groupId: string;
  groupLabel: string;
  platformId: string;
  topic: string; // 사용자가 직접 입력한 주제 (비어 있으면 그룹 전체를 주제로 봄)
  categoryId: string; // 콘텐츠 종류 (public_info / product / place / knowledge / trend / etc)
  brief: BriefSettings;        // 접어둔 상세 지시 항목
  materials: SourceMaterial[]; // 함께 넣은 소재 (URL·사진·음악)

  formatId: string;
  audio: AudioSettings;
  subtitleLayout: SubtitleLayout;
  withIntro: boolean; // 맨 앞에 동적 도입부(금색 티켓이 날아오는 3초)를 붙일지

  collection?: CollectionResult;
  verification?: VerificationReport;
  constraints?: ConstraintReport;
  adReferences?: AdReferenceReport; // 후킹 문구의 근거가 된 실제 광고 사례
  hookSeo?: HookSeoReport;
  hashtags: string[];

  script?: ScriptResult;
  hookHeadline: string; // 오프닝 화면의 굵은 후킹 문구 (예: "나만 몰랐던 220만원?")
  cards: CardItem[]; // 카드뉴스 형식의 본문 (번호 + 제목 + 핵심수치)
  narration: string; // hookHeadline+cards를 이어 붙인 나레이션 (TTS용, 화면 편집 대상 아님)
  subtitles: SubtitleLine[];
  videoJobId?: string;
}

export interface StartOptions {
  groupId: string;
  groupLabel: string;
  platformId: string;
  topic: string;
  isSponsoredContent: boolean;
  categoryId?: string;
}

// 화면을 열자마자 스튜디오가 보이도록, 아직 아무것도 만들지 않은 빈 작업물로 시작한다.
// (예전엔 시작 화면에서 그룹/플랫폼을 고른 뒤에야 작업물이 생겼다.)
export function blankProject(): ProjectState {
  return emptyProject({ groupId: "", groupLabel: "", platformId: "youtube_shorts", topic: "", isSponsoredContent: false });
}

export function emptyProject(opts: StartOptions): ProjectState {
  return {
    groupId: opts.groupId,
    groupLabel: opts.groupLabel,
    platformId: opts.platformId,
    topic: opts.topic,
    categoryId: opts.categoryId ?? "",
    brief: {
      audience: "",
      goal: "",
      tone: "",
      targetSeconds: 0,
      mustInclude: "",
      mustAvoid: "",
      isSponsoredContent: opts.isSponsoredContent,
    },
    materials: [],

    formatId: "shorts_9_16",
    audio: {
      voicePreset: "news-anchor",
      bgmEnabled: true,
      customBgmEnabled: false,
      sfxEnabled: true,
      // 실측 기준값: 1.0이면 참고 영상의 2배가 넘게 길어져서, 최적 길이(20~35초)에
      // 들어가도록 기본을 1.4로 둔다.
      speechSpeed: 1.4,
      bgmPreset: "epic-doc",
      bgmVolume: 60,
      customBgmId: "",
      customBgmName: "",
      customBgmVolume: 40,
      sfxPreset: "epic-doc",
      sfxVolume: 50,
    },
    subtitleLayout: { vertical: 58, horizontal: 50, margin: 8 },
    withIntro: true, // 참고 영상(임신부편)에 있던 연출이라 기본으로 켜둔다

    hashtags: [],
    hookHeadline: "",
    cards: [],
    narration: "",
    subtitles: [],
  };
}

// 화면 디자인을 확인할 때 쓰는 예시 데이터. 스튜디오 화면을 보려면 원래는 자료수집부터
// 대본까지 전부 돌려야 하는데(시간도 걸리고 Claude API 비용도 듦), 레이아웃만 손볼 때는
// 그럴 필요가 없어서 `http://localhost:3100/?demo=1`로 바로 열어볼 수 있게 해둔 것.
// 실제 사용 흐름에는 영향이 없다(주소에 ?demo=1을 붙였을 때만 동작).
function demoProject(): ProjectState {
  const base = emptyProject({
    groupId: "youth",
    groupLabel: "청년",
    platformId: "youtube_shorts",
    topic: "2026년 청년 지원 정책 총정리",
    isSponsoredContent: false,
    categoryId: "public_info",
  });
  return {
    ...base,
    hookHeadline: "2026년 청년 지원금 4가지, 이거 모르면 손해입니다",
    cards: [
      { badge: "01", title: "청년미래적금 신규 도입", detail: "3년 만기 시 최대 2,200만원 목돈 마련" },
      { badge: "02", title: "청년월세 특별지원", detail: "상시 신청 제도로 전환, 월 최대 20만원" },
      { badge: "03", title: "청년일자리도약장려금", detail: "지원 대상과 규모가 함께 확대" },
      { badge: "04", title: "신청은 복지로에서", detail: "각 기관 홈페이지에서 조건 확인 필수" },
    ],
    hashtags: ["#청년지원금", "#청년미래적금", "#2026정책"],
    // 아래는 실제로 /api/pipeline/5/ad-references를 돌려서 나온 결과를 줄여 담은 것
    // (화면 확인용 예시일 뿐, 이 주제와는 무관한 다른 주제의 수집 결과임)
    adReferences: {
      topic: "무선 청소기 신제품 숏폼 광고",
      platformId: "youtube_shorts",
      platformLabel: "유튜브 쇼츠",
      collectedAt: new Date().toISOString(),
      references: [
        {
          title: "삼성전자 비스포크 제트 AI 캠페인 'The JET Walk'",
          platform: "유튜브",
          sourceUrl: "https://www.youtube.com/",
          hookText: "금빛 런웨이에 모델들이 무표정하게 걸어 나오며 시작",
          structure: "패션쇼처럼 시작해 광고임을 숨김 → 모델 손의 청소기가 뒤늦게 드러남 → 반전",
          whyItWorked: "청소기 광고라는 예상을 깨뜨려 초반 이탈을 막음",
          metrics: "공개 5일 만에 조회수 100만 돌파",
        },
        {
          title: "LG전자 코드제로 A9S 오브제컬렉션 – 스파이 영화 콘셉트",
          platform: "유튜브",
          sourceUrl: "https://www.youtube.com/",
          hookText: '"마무리 했나?" — 첩보영화 대사로 시작',
          structure: "먼지 흡입 → 물걸레 → 자동 먼지통 비움 순으로 기능을 미션처럼 배치",
          whyItWorked: "장르적 완성도로 광고 자체를 볼거리로 만듦",
          metrics: "공개 약 3주 만에 조회수 1,000만 돌파",
        },
      ],
      patterns: [
        {
          pattern: "광고임을 바로 드러내지 않고 이질적인 장르로 시작해 초반 1~2초에 시선을 잡는다",
          evidence: ["삼성전자 비스포크 제트 AI 캠페인 'The JET Walk'", "LG전자 코드제로 A9S 오브제컬렉션 – 스파이 영화 콘셉트"],
          applyToTopic: "청소 장면 대신 상황극처럼 시작해 반전으로 이탈을 막는다",
        },
        {
          pattern: "핵심 스펙을 하나의 스토리 안에서 단계별 시퀀스로 시연한다",
          evidence: ["LG전자 코드제로 A9S 오브제컬렉션 – 스파이 영화 콘셉트"],
          applyToTopic: "기능들을 짧은 스토리의 '미션 단계'처럼 순차적으로 보여준다",
        },
      ],
      limitations: [
        "참고 사례를 2건만 찾았습니다(3건 이상 권장). 후킹 문구는 사례 근거가 약한 상태로 만들어집니다.",
        "확인된 2건 모두 쇼츠 전용이 아닌 가로형 브랜드 필름이 유튜브에 공개되어 확산된 사례임",
      ],
    },
  };
}

// 화면은 스튜디오 하나뿐이다.
// 사용자 지시(2026-08-23): 시작 화면과 진행 화면을 없애고 메인 화면에서 바로 시작하며,
// 대상 그룹·주제는 주제 입력 하나로, 배포 플랫폼은 메인 화면의 배포 규격에 합칠 것.
// 자료수집~카드뉴스 구성은 내부 작업이라 화면에 단계별로 표시하지 않는다.
export default function App() {
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const isDemo = params.has("demo");
  const [project, setProject] = useState<ProjectState>(isDemo ? demoProject() : blankProject());
  // 작업 기록은 스튜디오와 별개 화면. 주소에 ?worklog 를 붙이거나 스튜디오에서 눌러 들어간다.
  const [showWorkLog, setShowWorkLog] = useState(params.has("worklog"));

  const updateProject = (updater: (prev: ProjectState) => ProjectState) => setProject((prev) => updater(prev));

  if (showWorkLog) return <WorkLogScreen onBack={() => setShowWorkLog(false)} />;

  return (
    <StudioScreen
      project={project}
      updateProject={updateProject}
      onReset={() => setProject(blankProject())}
      onOpenWorkLog={() => setShowWorkLog(true)}
    />
  );
}
