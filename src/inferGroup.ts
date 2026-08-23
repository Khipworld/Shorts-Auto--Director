import type { LifecycleGroup } from "./types";

// 주제 한 줄에서 대상 그룹을 찾아낸다.
//
// 왜 필요한가: 원래는 시작 화면에서 그룹을 따로 골랐는데, 사용자가 "대상그룹과 주제를
// 주제 입력 하나로 대체"하라고 해서 주제만 받게 됐다. 그런데 백엔드 파이프라인은 여전히
// 그룹 단위로 돌아가므로(자료수집·검증·제약조건이 전부 groupId 기준), 주제에서 그룹을
// 알아내야 한다.
//
// AI를 부르지 않고 키워드로 맞춘다 — 즉시 반응하고 비용도 안 들고, 무엇보다 왜 그렇게
// 판단했는지 사용자가 바로 알 수 있다. 못 찾으면 추측하지 않고 물어본다.

// 그룹별로 실제 주제 문장에 나올 법한 말들. 그룹 label/searchHint만으로는
// "출산", "육아", "노인" 같은 표현을 놓쳐서 따로 적어둔다.
const GROUP_KEYWORDS: Record<string, string[]> = {
  pregnancy: ["임신", "임산부", "임신부", "출산", "산모", "난임", "産"],
  infant_child: ["영유아", "유아", "아동", "육아", "어린이집", "보육", "양육", "출생", "신생아", "아기"],
  teen: ["청소년", "중학생", "고등학생", "학생", "10대", "십대", "교복"],
  youth: ["청년", "20대", "이십대", "대학생", "취준", "사회초년생", "신혼"],
  middle_age: ["중장년", "신중년", "40대", "50대", "재취업", "전직", "장년"],
  senior: ["노인", "어르신", "60세", "65세", "고령", "시니어", "은퇴", "연금", "노후"],
};

export interface GroupGuess {
  groupId: string;
  groupLabel: string;
  matchedWord: string; // 어떤 말을 보고 그렇게 판단했는지 — 화면에 그대로 보여준다
}

export function inferGroupFromTopic(topic: string, groups: LifecycleGroup[]): GroupGuess | null {
  const text = topic.trim();
  if (!text) return null;

  // 여러 그룹이 걸리면 더 긴(구체적인) 단어가 이긴다.
  // 예: "청년 임신부 지원"이면 "임신부"(3자)가 "청년"(2자)보다 구체적이라고 본다.
  let best: { groupId: string; word: string } | null = null;
  for (const [groupId, words] of Object.entries(GROUP_KEYWORDS)) {
    for (const w of words) {
      if (!text.includes(w)) continue;
      if (!best || w.length > best.word.length) best = { groupId, word: w };
    }
  }
  if (!best) return null;

  const group = groups.find((g) => g.id === best!.groupId);
  if (!group) return null;
  return { groupId: group.id, groupLabel: group.label, matchedWord: best.word };
}
