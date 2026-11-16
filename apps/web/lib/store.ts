/**
 * 데모용 서버 메모리 저장소.
 * 통합 단계에서 Supabase 구현체로 바꾼다 (CreditStore 등 core 인터페이스 그대로).
 * 개발 서버가 다시 시작되면 초기화된다.
 */
import { credits, type contribution as C, type notice as N, type planner as P, type skeleton as S, type publish as PB, type feedback as F, type content as CT, type account as A } from "@supportlab/core";

export interface User {
  id: string;
  nickname: string;
  createdAt: string;
  ig?: { userId: string; username?: string; accessToken: string };
}

export interface Activity {
  id: string;
  userId: string;
  name: string;
  sourceUrl?: string;
  analysis: N.NoticeAnalysis;
  guides: N.ActionGuide[];
  plan?: P.Plan;
  skeleton?: S.Skeleton;
  accountKit?: A.AccountKit;
  createdAt: string;
}

export interface Clip extends CT.UploadedClip {
  userId: string;
  planItemId: string;
}

export interface Render {
  id: string;
  userId: string;
  planItemId: string;
  path: string;
  totalSec: number;
  createdAt: string;
}

interface Db {
  users: Map<string, User>;
  activities: Map<string, Activity>;
  contributions: Map<string, C.Contribution>;
  posts: PB.ScheduledPost[];
  clips: Clip[];
  renders: Render[];
  scenes: Map<string, CT.Scene[]>;
  demoMedia: Map<string, F.MediaMetrics[]>;
  creditStore: credits.MemoryCreditStore;
  ledger: credits.CreditLedger;
}

const g = globalThis as unknown as { __sl?: Db };
if (!g.__sl) {
  const creditStore = new credits.MemoryCreditStore();
  g.__sl = {
    users: new Map(),
    activities: new Map(),
    contributions: new Map(),
    posts: [],
    clips: [],
    renders: [],
    scenes: new Map(),
    demoMedia: new Map(),
    creditStore,
    ledger: new credits.CreditLedger(creditStore),
  };
}
export const db = g.__sl!;

export const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function latestActivity(userId: string): Activity | undefined {
  return [...db.activities.values()].filter((a) => a.userId === userId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
}

export function todayISO(): string {
  // 한국 시간 기준 날짜
  const d = new Date(Date.now() + 9 * 3600_000);
  return d.toISOString().slice(0, 10);
}
