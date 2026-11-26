/**
 * 계정 실험실 생명체의 종류 · 색 · 단계 이름. 화면(클라이언트)에서도 쓰므로 다른 모듈을 import 하지 않는다.
 */
/** 생명체 종류 · 색 (화면이 이 값으로 그린다) */
export const LAB_SPECIES = ["tree", "cactus", "mushroom", "slime"] as const;
export type LabSpecies = (typeof LAB_SPECIES)[number];
export const LAB_HUES = ["#7EDDAA", "#8EC2FF", "#FF8DB9", "#FFE45C", "#C5B8FF"] as const;

export function variantOf(seed = 0): { species: LabSpecies; hue: string } {
  const s = Math.abs(Math.floor(seed));
  return { species: LAB_SPECIES[s % LAB_SPECIES.length]!, hue: LAB_HUES[Math.floor(s / LAB_SPECIES.length) % LAB_HUES.length]! };
}

/** 단계 이름 (종류마다 다르다) */
export function stageName(stage: number, species: LabSpecies): string {
  const grown: Record<LabSpecies, [string, string, string, string]> = {
    tree: ["떡잎", "어린 나무", "꽃 핀 나무", "열매 맺은 나무"],
    cactus: ["아기 선인장", "어린 선인장", "꽃 핀 선인장", "별 달린 선인장"],
    mushroom: ["아기 버섯", "어린 버섯", "점박이 버섯", "버섯 가족"],
    slime: ["아기 슬라임", "말랑 슬라임", "잎사귀 슬라임", "왕관 슬라임"],
  };
  return ["빈 플라스크", "씨앗", "새싹", ...grown[species]][Math.max(0, Math.min(6, stage))]!;
}
