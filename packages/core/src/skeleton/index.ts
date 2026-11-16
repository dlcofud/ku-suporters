/**
 * 지원서 뼈대 생성.
 *
 * 완성본을 써 주지 않는다. 문항마다
 *  - 어떤 순서로 쓸지(구조)
 *  - 무엇을 강조할지(합격 요인 루브릭 E1~E8 기준)
 *  - 내 경험 중 무엇을 꺼내면 좋을지
 *  - 피해야 할 것
 * 만 제시하고, 실제 문장은 사용자가 자기 경험으로 채운다.
 * (AI 대필 논란을 피하고, 출력 토큰도 줄인다.)
 */

import type { NoticeAnalysis } from "../notice/index.js";
import type { LLMClient } from "../llm/index.js";
import { extractJson } from "../llm/index.js";

export type QuestionType = "motivation" | "competency" | "content_idea" | "self_intro" | "goal" | "other";

export type RubricCode = "E1" | "E2" | "E3" | "E4" | "E5" | "E6" | "E7" | "E8";

export const RUBRIC: Record<RubricCode, string> = {
  E1: "SNS 운영 성과",
  E2: "사전 제작 콘텐츠",
  E3: "툴 활용",
  E4: "분야 연결 경험",
  E5: "브랜드 이해",
  E6: "기획안 구체성",
  E7: "협업 경험",
  E8: "진정성·스토리",
};

export interface Experience {
  title: string;
  description: string;
  /** 숫자로 말할 수 있는 성과. 예: "릴스 최고 조회수 2,380회" */
  metrics?: string[];
  tags?: string[];
}

export interface ApplicantProfile {
  major?: string;
  interests?: string[];
  experiences: Experience[];
  channels?: { platform: string; url?: string; followers?: number }[];
}

export interface SkeletonSection {
  question: string;
  type: QuestionType;
  charLimit?: number;
  structure: string[];
  emphasize: { code: RubricCode; label: string; why: string }[];
  suggestedExperiences: { title: string; reason: string }[];
  avoid: string[];
}

export interface Skeleton {
  sections: SkeletonSection[];
  /** 지원서 전체에 걸친 조언 */
  overall: string[];
}

export function classifyQuestion(q: string): QuestionType {
  if (/지원\s*동기|지원하게\s*된|이유/.test(q)) return "motivation";
  if (/콘텐츠|아이디어|기획|만들고\s*싶은/.test(q)) return "content_idea";
  if (/역량|강점|경험|능력|기여/.test(q)) return "competency";
  if (/자기\s*소개|소개해/.test(q)) return "self_intro";
  if (/포부|목표|이루고|각오/.test(q)) return "goal";
  return "other";
}

export function parseCharLimit(q: string): number | undefined {
  const m = q.match(/(\d{2,4})\s*자/);
  return m ? Number(m[1]) : undefined;
}

const TEMPLATES: Record<QuestionType, { structure: string[]; emphasize: [RubricCode, string][]; avoid: string[] }> = {
  motivation: {
    structure: [
      "계기: 이 브랜드·활동을 실제로 접한 구체적인 경험 한 가지",
      "연결: 그 경험이 이 활동의 주요 업무와 어떻게 이어지는지",
      "기여: 내가 이 활동에서 만들 수 있는 것 한 문장",
      "마무리: 뻔한 다짐 대신 나만의 방식이 드러나는 한 문장",
    ],
    emphasize: [
      ["E8", "자기만의 계기가 있으면 수많은 지원 동기 중에서 기억에 남아요"],
      ["E5", "브랜드를 실제로 써 보거나 SNS를 분석한 흔적이 보이면 좋아요"],
    ],
    avoid: ["'평소 관심이 많았다'처럼 근거 없는 표현", "활동 혜택(활동비 등)을 지원 동기로 쓰는 것"],
  },
  competency: {
    structure: [
      "역량 키워드 1~2개를 먼저 제시",
      "근거 경험: 무엇을, 어떤 고민으로 했는지",
      "결과: 조회수·방문자 수·팔로워 증가 같은 숫자",
      "활용: 이 역량이 이번 활동에 어떻게 쓰이는지",
    ],
    emphasize: [
      ["E1", "성과를 숫자로 보여준 후기가 반복해서 합격 요인으로 꼽혀요"],
      ["E4", "같은 분야 경험을 활동 내용과 직접 연결하면 설득력이 커져요"],
      ["E3", "툴 이름보다 그 툴로 만든 결과물 링크가 증거가 돼요"],
    ],
    avoid: ["활동 이름만 나열하기", "수치 없이 '좋은 반응을 얻었다'고 쓰기"],
  },
  content_idea: {
    structure: [
      "타겟: 누구에게 보여줄지",
      "기획 의도: 왜 이 콘텐츠인지 (브랜드의 현재 SNS에서 보완할 점)",
      "형식: 릴스·카드뉴스·블로그 중 무엇으로, 몇 컷·몇 초로",
      "기대 효과: 조회·저장·공유 중 무엇을 노리는지",
    ],
    emphasize: [
      ["E6", "타겟·형식·기대 효과까지 구조화된 기획안이 높게 평가돼요"],
      ["E2", "이 기획을 실제로 만들어 SNS에 올리고 링크를 붙이면 강력한 증거가 돼요"],
      ["E5", "공식 SNS의 장단점을 짚고 시작하면 브랜드 이해가 드러나요"],
    ],
    avoid: ["실현 불가능한 대형 이벤트 기획", "브랜드 톤과 맞지 않는 콘텐츠"],
  },
  self_intro: {
    structure: [
      "한 줄 정체성: 나를 설명하는 키워드 하나",
      "그 키워드를 보여주는 경험 하나",
      "이 활동과의 연결",
    ],
    emphasize: [
      ["E8", "개성 있는 키워드 하나가 긴 이력보다 기억에 남아요"],
      ["E4", "키워드와 활동 분야가 이어지게 고르세요"],
    ],
    avoid: ["학력·성격을 나열하는 일반적인 자기소개"],
  },
  goal: {
    structure: ["활동 중 이루고 싶은 구체적 목표 (숫자로)", "그 목표를 위한 방법", "활동 이후 나에게 남길 것"],
    emphasize: [["E8", "목표가 구체적일수록 진정성이 보여요"]],
    avoid: ["'최선을 다하겠습니다'로 끝내기"],
  },
  other: {
    structure: ["질문이 묻는 핵심을 첫 문장에 답하기", "근거 경험", "이 활동과의 연결"],
    emphasize: [["E4", "어떤 문항이든 활동 내용과 연결하는 것이 기본이에요"]],
    avoid: ["질문과 관계없는 경험 늘어놓기"],
  },
};

const TYPE_TAGS: Record<QuestionType, RegExp> = {
  motivation: /브랜드|제품|이용|팬|관심/,
  competency: /SNS|콘텐츠|편집|블로그|릴스|운영|디자인|마케팅/,
  content_idea: /콘텐츠|기획|릴스|카드뉴스|영상/,
  self_intro: /.*/,
  goal: /.*/,
  other: /.*/,
};

function suggestExperiences(type: QuestionType, profile: ApplicantProfile, notice?: NoticeAnalysis) {
  const noticeWords = [...(notice?.activities ?? []), ...(notice?.preferred ?? [])].join(" ");
  const scored = profile.experiences.map((e) => {
    const text = `${e.title} ${e.description} ${(e.tags ?? []).join(" ")}`;
    let score = 0;
    if (TYPE_TAGS[type].test(text)) score += 2;
    if (e.metrics?.length) score += type === "competency" ? 3 : 1;
    for (const w of text.split(/\s+/)) if (w.length >= 2 && noticeWords.includes(w)) score += 1;
    return { e, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ e }) => ({
      title: e.title,
      reason: e.metrics?.length ? `숫자로 말할 수 있는 성과가 있어요: ${e.metrics.join(", ")}` : "이 문항의 주제와 관련 있는 경험이에요",
    }));
}

/** 규칙 기반 뼈대. LLM 없이 즉시 만든다. */
export function buildSkeleton(input: { questions: string[]; profile: ApplicantProfile; notice?: NoticeAnalysis }): Skeleton {
  const questions = input.questions.length ? input.questions : input.notice?.questions ?? [];
  const sections = questions.map((q): SkeletonSection => {
    const type = classifyQuestion(q);
    const t = TEMPLATES[type];
    return {
      question: q,
      type,
      charLimit: parseCharLimit(q),
      structure: t.structure,
      emphasize: t.emphasize.map(([code, why]) => ({ code, label: RUBRIC[code], why })),
      suggestedExperiences: suggestExperiences(type, input.profile, input.notice),
      avoid: t.avoid,
    };
  });
  const overall: string[] = [];
  const hasMetrics = input.profile.experiences.some((e) => e.metrics?.length);
  if (!hasMetrics) overall.push("숫자로 말할 수 있는 성과가 아직 없어요. 마감 전에 콘텐츠를 올려 조회수·저장 수를 만들어 두면 '성과' 문항에 쓸 수 있어요.");
  if (input.notice?.submissions.includes("sns_link") && !(input.profile.channels?.length)) {
    overall.push("이 공고는 SNS 링크를 받아요. 활동용 계정을 먼저 열어 두세요. 팔로워 수보다 콘텐츠가 채워져 있는지가 중요해요.");
  }
  overall.push("완성 문장은 직접 쓰세요. 서포트랩은 구조와 강조점만 제안해요.");
  return { sections, overall };
}

/** LLM으로 문항별 구조를 다듬는다. 완성 문장을 만들지 않도록 출력 형식을 제한한다. */
export async function refineSkeletonWithLLM(skeleton: Skeleton, profile: ApplicantProfile, llm: LLMClient) {
  const res = await llm.complete({
    system:
      "너는 지원서 코치야. 절대 완성된 문장을 써 주지 말고, 문항별로 '구조 단계'와 '이 지원자의 어떤 경험을 어디에 넣을지'만 짧은 명사구로 제안해. JSON {\"sections\":[{\"question\":string,\"structure\":string[]}]} 하나만 출력해.",
    user: JSON.stringify({
      questions: skeleton.sections.map((s) => ({ q: s.question, type: s.type, limit: s.charLimit })),
      experiences: profile.experiences.map((e) => ({ t: e.title, m: e.metrics })),
    }),
    maxOutputTokens: 700,
    json: true,
  });
  const out = extractJson<{ sections?: { question: string; structure: string[] }[] }>(res.text);
  const refined: Skeleton = {
    ...skeleton,
    sections: skeleton.sections.map((s) => {
      const r = out.sections?.find((x) => x.question === s.question);
      return r?.structure?.length ? { ...s, structure: r.structure.slice(0, 6) } : s;
    }),
  };
  return { skeleton: refined, usage: { inputTokens: res.inputTokens, outputTokens: res.outputTokens }, tier: llm.tier };
}
