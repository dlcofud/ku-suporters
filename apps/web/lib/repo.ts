/**
 * 저장소 계층.
 *  - SUPABASE_URL + SUPABASE_SECRET_KEY 가 있으면 Supabase (DB + Storage)
 *  - 없으면 서버 메모리 + 로컬 디스크 (개발·데모용, 서버를 다시 켜면 초기화)
 * 화면과 액션은 이 파일의 repo / files 만 쓰고, 어느 쪽인지 신경 쓰지 않는다.
 * Supabase는 서버에서 secret 키로만 접근한다(브라우저에 키를 내려보내지 않는다).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { credits, type contribution as C, type notice as N, type planner as P, type skeleton as S, type publish as PB, type feedback as F, type content as CT, type account as A, type trends as T, type apply as AP } from "@supportlab/core";

/* ------------------------------------------------------------------ */
/* 타입                                                                 */
/* ------------------------------------------------------------------ */

export interface User {
  id: string;
  nickname: string;
  /** 로그인 아이디. 예전에 닉네임만으로 가입한 계정은 없을 수 있다 (계정 설정에서 정함) */
  loginId?: string;
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
  /** 지원서 코치와의 대화 + 문항별 글 */
  application?: AP.Application;
  createdAt: string;
}

export interface Clip {
  id: string;
  userId: string;
  planItemId: string;
  sceneIndex: number;
  storageKey: string;
  durationSec: number;
  hasAudio: boolean;
}

export interface Render {
  id: string;
  userId: string;
  planItemId: string;
  storageKey: string;
  totalSec: number;
  createdAt: string;
}

export class LoginIdTakenError extends Error {
  constructor() {
    super("이미 쓰고 있는 아이디예요");
  }
}

export interface Repo {
  readonly kind: "memory" | "supabase";
  ledger: credits.CreditLedger;
  /** creds를 주면 아이디·비밀번호 해시도 함께 저장한다. 아이디가 이미 있으면 LoginIdTakenError */
  createUser(nickname: string, creds?: { loginId: string; passwordHash: string }): Promise<User>;
  getUser(id: string): Promise<User | undefined>;
  /** 로그인할 때 쓴다: 아이디로 사용자와 비밀번호 해시를 찾는다 */
  findLogin(loginId: string): Promise<{ user: User; passwordHash?: string } | undefined>;
  getPasswordHash(userId: string): Promise<string | undefined>;
  /** 아이디(처음 정할 때만)와 비밀번호 해시를 저장한다 */
  setCredentials(userId: string, c: { loginId?: string; passwordHash: string }): Promise<void>;
  setNickname(userId: string, nickname: string): Promise<void>;
  setUserIg(id: string, ig: NonNullable<User["ig"]>): Promise<void>;
  latestActivity(userId: string): Promise<Activity | undefined>;
  /** 최신순 */
  listActivities(userId: string): Promise<Activity[]>;
  saveActivity(a: Activity): Promise<void>;
  getScenes(userId: string, planItemId: string): Promise<CT.Scene[] | undefined>;
  setScenes(userId: string, planItemId: string, scenes: CT.Scene[]): Promise<void>;
  listClips(userId: string, planItemId: string): Promise<Clip[]>;
  putClip(c: Clip): Promise<void>;
  listRenders(userId: string, planItemId: string): Promise<Render[]>;
  getRender(id: string): Promise<Render | undefined>;
  addRender(r: Render): Promise<void>;
  listPosts(userId: string): Promise<PB.ScheduledPost[]>;
  listActivePosts(): Promise<PB.ScheduledPost[]>;
  savePosts(posts: PB.ScheduledPost[]): Promise<void>;
  listContributions(filter: { userId?: string; statuses?: C.ContributionStatus[] }): Promise<C.Contribution[]>;
  getContribution(id: string): Promise<C.Contribution | undefined>;
  saveContribution(c: C.Contribution): Promise<void>;
  getDemoMedia(userId: string): Promise<F.MediaMetrics[] | undefined>;
  setDemoMedia(userId: string, media: F.MediaMetrics[]): Promise<void>;
  /** 팀이 코딩한 합격 후기 (최신순) */
  listCodedReviews(): Promise<T.CodedReview[]>;
  getCodedReview(id: string): Promise<T.CodedReview | undefined>;
  saveCodedReview(r: T.CodedReview): Promise<void>;
}

export interface FileStore {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** ffmpeg 처리용 로컬 경로 (Supabase면 임시 폴더로 내려받는다) */
  toLocal(key: string): Promise<string>;
  /** 외부(인스타 서버 포함)에서 받을 수 있는 https 주소. 메모리 모드에서는 undefined */
  signedUrl(key: string, seconds: number): Promise<string | undefined>;
  /** 메모리 모드의 파일 경로 */
  localPath(key: string): string;
  remove(key: string): Promise<void>;
  /** 브라우저가 직접 올릴 수 있는 서명 업로드 주소. 메모리 모드에서는 undefined */
  createUploadUrl(key: string): Promise<string | undefined>;
}

const DATA_DIR = process.env.SUPPORTLAB_DATA_DIR || "/tmp/supportlab";

/* ------------------------------------------------------------------ */
/* 메모리 구현                                                          */
/* ------------------------------------------------------------------ */

class MemoryRepo implements Repo {
  readonly kind = "memory" as const;
  private users = new Map<string, User>();
  private activities = new Map<string, Activity>();
  private scenes = new Map<string, CT.Scene[]>();
  private clips: Clip[] = [];
  private renders: Render[] = [];
  private posts: PB.ScheduledPost[] = [];
  private contributions = new Map<string, C.Contribution>();
  private demo = new Map<string, F.MediaMetrics[]>();
  private coded = new Map<string, T.CodedReview>();
  ledger = new credits.CreditLedger(new credits.MemoryCreditStore());

  private hashes = new Map<string, string>();
  async createUser(nickname: string, creds?: { loginId: string; passwordHash: string }) {
    if (creds && [...this.users.values()].some((x) => x.loginId === creds.loginId)) throw new LoginIdTakenError();
    const u: User = { id: randomUUID(), nickname, loginId: creds?.loginId, createdAt: new Date().toISOString() };
    this.users.set(u.id, u);
    if (creds) this.hashes.set(u.id, creds.passwordHash);
    return u;
  }
  async findLogin(loginId: string) {
    const user = [...this.users.values()].find((x) => x.loginId === loginId);
    return user ? { user, passwordHash: this.hashes.get(user.id) } : undefined;
  }
  async getPasswordHash(userId: string) {
    return this.hashes.get(userId);
  }
  async setCredentials(userId: string, c: { loginId?: string; passwordHash: string }) {
    const u = this.users.get(userId);
    if (!u) return;
    if (c.loginId && !u.loginId) {
      if ([...this.users.values()].some((x) => x.loginId === c.loginId)) throw new LoginIdTakenError();
      u.loginId = c.loginId;
    }
    this.hashes.set(userId, c.passwordHash);
  }
  async setNickname(userId: string, nickname: string) {
    const u = this.users.get(userId);
    if (u) u.nickname = nickname;
  }
  async getUser(id: string) {
    return this.users.get(id);
  }
  async setUserIg(id: string, ig: NonNullable<User["ig"]>) {
    const u = this.users.get(id);
    if (u) u.ig = ig;
  }
  async latestActivity(userId: string) {
    return (await this.listActivities(userId))[0];
  }
  async listActivities(userId: string) {
    return [...this.activities.values()].filter((a) => a.userId === userId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((a) => structuredClone(a));
  }
  async saveActivity(a: Activity) {
    this.activities.set(a.id, structuredClone(a));
  }
  async getScenes(u: string, i: string) {
    return this.scenes.get(`${u}:${i}`);
  }
  async setScenes(u: string, i: string, s: CT.Scene[]) {
    this.scenes.set(`${u}:${i}`, s);
  }
  async listClips(u: string, i: string) {
    return this.clips.filter((c) => c.userId === u && c.planItemId === i);
  }
  async putClip(c: Clip) {
    this.clips = this.clips.filter((x) => !(x.userId === c.userId && x.planItemId === c.planItemId && x.sceneIndex === c.sceneIndex));
    this.clips.push(c);
  }
  async listRenders(u: string, i: string) {
    return this.renders.filter((r) => r.userId === u && r.planItemId === i);
  }
  async getRender(id: string) {
    return this.renders.find((r) => r.id === id);
  }
  async addRender(r: Render) {
    this.renders.push(r);
  }
  async listPosts(u: string) {
    return this.posts.filter((p) => p.userId === u);
  }
  async listActivePosts() {
    return this.posts.filter((p) => !["published", "failed", "canceled"].includes(p.status));
  }
  async savePosts(posts: PB.ScheduledPost[]) {
    for (const p of posts) {
      const i = this.posts.findIndex((x) => x.id === p.id);
      if (i >= 0) this.posts[i] = p;
      else this.posts.push(p);
    }
  }
  async listContributions(f: { userId?: string; statuses?: C.ContributionStatus[] }) {
    return [...this.contributions.values()].filter((c) => (!f.userId || c.userId === f.userId) && (!f.statuses || f.statuses.includes(c.status)));
  }
  async getContribution(id: string) {
    return this.contributions.get(id);
  }
  async saveContribution(c: C.Contribution) {
    this.contributions.set(c.id, c);
  }
  async getDemoMedia(u: string) {
    return this.demo.get(u);
  }
  async setDemoMedia(u: string, m: F.MediaMetrics[]) {
    this.demo.set(u, m);
  }
  async listCodedReviews() {
    return [...this.coded.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  async getCodedReview(id: string) {
    return this.coded.get(id);
  }
  async saveCodedReview(r: T.CodedReview) {
    this.coded.set(r.id, r);
  }
}

class LocalFiles implements FileStore {
  localPath(key: string) {
    return join(DATA_DIR, "files", key);
  }
  async put(key: string, data: Buffer) {
    const p = this.localPath(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  }
  async toLocal(key: string) {
    return this.localPath(key);
  }
  async signedUrl() {
    return undefined;
  }
  async remove() {
    /* 데모에서는 그대로 둔다 */
  }
  async createUploadUrl() {
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/* Supabase 구현                                                        */
/* ------------------------------------------------------------------ */

function must<T>(r: { data: T; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`Supabase ${what}: ${r.error.message}`);
  return r.data;
}

class SupabaseCreditStore implements credits.CreditStore {
  constructor(private sb: SupabaseClient) {}
  private toEntry(r: Record<string, unknown>): credits.LedgerEntry {
    return {
      id: r.id as string,
      userId: r.user_id as string,
      amount: r.amount as number,
      reason: r.reason as credits.CreditReason,
      status: r.status as credits.EntryStatus,
      idempotencyKey: (r.idempotency_key as string) ?? undefined,
      refId: (r.ref_id as string) ?? undefined,
      memo: (r.memo as string) ?? undefined,
      createdAt: r.created_at as string,
    };
  }
  async list(userId: string) {
    const rows = must(await this.sb.from("credit_ledger").select("*").eq("user_id", userId), "ledger.list");
    return (rows ?? []).map((r) => this.toEntry(r));
  }
  async findByKey(userId: string, key: string) {
    const rows = must(await this.sb.from("credit_ledger").select("*").eq("user_id", userId).eq("idempotency_key", key).limit(1), "ledger.find");
    return rows?.[0] ? this.toEntry(rows[0]) : undefined;
  }
  async insert(e: credits.LedgerEntry) {
    must(
      await this.sb.from("credit_ledger").insert({
        id: e.id, user_id: e.userId, amount: e.amount, reason: e.reason, status: e.status,
        idempotency_key: e.idempotencyKey ?? null, ref_id: e.refId ?? null, memo: e.memo ?? null, created_at: e.createdAt,
      }),
      "ledger.insert",
    );
  }
  async update(id: string, patch: Partial<Pick<credits.LedgerEntry, "status" | "amount" | "memo">>) {
    must(await this.sb.from("credit_ledger").update(patch).eq("id", id), "ledger.update");
  }
}

class SupabaseRepo implements Repo {
  readonly kind = "supabase" as const;
  ledger: credits.CreditLedger;
  constructor(private sb: SupabaseClient) {
    this.ledger = new credits.CreditLedger(new SupabaseCreditStore(sb));
  }
  private toUser(r: Record<string, unknown>): User {
    return {
      id: r.id as string,
      nickname: r.nickname as string,
      loginId: (r.login_id as string) ?? undefined,
      createdAt: r.created_at as string,
      ig: r.ig_user_id && r.ig_access_token ? { userId: r.ig_user_id as string, username: (r.ig_username as string) ?? undefined, accessToken: r.ig_access_token as string } : undefined,
    };
  }
  async createUser(nickname: string, creds?: { loginId: string; passwordHash: string }) {
    const res = await this.sb.from("app_users").insert({ nickname, login_id: creds?.loginId ?? null, password_hash: creds?.passwordHash ?? null }).select("*").single();
    if (res.error?.code === "23505") throw new LoginIdTakenError();
    return this.toUser(must(res, "users.create"));
  }
  async findLogin(loginId: string) {
    const r = must(await this.sb.from("app_users").select("*").eq("login_id", loginId).maybeSingle(), "users.login");
    return r ? { user: this.toUser(r), passwordHash: (r.password_hash as string) ?? undefined } : undefined;
  }
  async getPasswordHash(userId: string) {
    const r = must(await this.sb.from("app_users").select("password_hash").eq("id", userId).maybeSingle(), "users.hash");
    return (r?.password_hash as string) ?? undefined;
  }
  async setCredentials(userId: string, c: { loginId?: string; passwordHash: string }) {
    const patch: Record<string, string> = { password_hash: c.passwordHash };
    if (c.loginId) patch.login_id = c.loginId;
    // 아이디는 처음 정할 때만 (이미 있으면 바꾸지 않는다)
    let q = this.sb.from("app_users").update(patch).eq("id", userId);
    if (c.loginId) q = q.is("login_id", null);
    const res = await q;
    if (res.error?.code === "23505") throw new LoginIdTakenError();
    must(res, "users.creds");
  }
  async setNickname(userId: string, nickname: string) {
    must(await this.sb.from("app_users").update({ nickname }).eq("id", userId), "users.nickname");
  }
  async getUser(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
    const r = must(await this.sb.from("app_users").select("*").eq("id", id).maybeSingle(), "users.get");
    return r ? this.toUser(r) : undefined;
  }
  async setUserIg(id: string, ig: NonNullable<User["ig"]>) {
    must(await this.sb.from("app_users").update({ ig_user_id: ig.userId, ig_username: ig.username ?? null, ig_access_token: ig.accessToken }).eq("id", id), "users.ig");
  }
  private toActivity(a: Record<string, any>): Activity {
    return {
      id: a.id, userId: a.user_id, name: a.name, sourceUrl: a.source_url ?? undefined, analysis: a.analysis, guides: a.guides ?? [],
      plan: a.plan ?? undefined, skeleton: a.skeleton ?? undefined, accountKit: a.account_kit ?? undefined, application: a.application ?? undefined, createdAt: a.created_at,
    } as Activity;
  }
  async latestActivity(userId: string) {
    return (await this.listActivities(userId, 1))[0];
  }
  async listActivities(userId: string, limit = 30) {
    const r = must(await this.sb.from("activities").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit), "activities.list");
    return (r ?? []).map((a: Record<string, any>) => this.toActivity(a));
  }
  async saveActivity(a: Activity) {
    must(
      await this.sb.from("activities").upsert({
        id: a.id, user_id: a.userId, name: a.name, source_url: a.sourceUrl ?? null, analysis: a.analysis, guides: a.guides,
        plan: a.plan ?? null, skeleton: a.skeleton ?? null, account_kit: a.accountKit ?? null, application: a.application ?? null, created_at: a.createdAt,
      }),
      "activities.save",
    );
  }
  async getScenes(u: string, i: string) {
    const r = must(await this.sb.from("scene_plans").select("scenes").eq("user_id", u).eq("plan_item_id", i).maybeSingle(), "scenes.get");
    return (r?.scenes as CT.Scene[] | undefined) ?? undefined;
  }
  async setScenes(u: string, i: string, s: CT.Scene[]) {
    must(await this.sb.from("scene_plans").upsert({ user_id: u, plan_item_id: i, scenes: s, updated_at: new Date().toISOString() }), "scenes.set");
  }
  async listClips(u: string, i: string) {
    const r = must(await this.sb.from("content_clips").select("*").eq("user_id", u).eq("plan_item_id", i), "clips.list");
    return (r ?? []).map((c) => ({ id: c.id, userId: c.user_id, planItemId: c.plan_item_id, sceneIndex: c.scene_index, storageKey: c.storage_key, durationSec: Number(c.duration_sec), hasAudio: c.has_audio }));
  }
  async putClip(c: Clip) {
    must(await this.sb.from("content_clips").delete().eq("user_id", c.userId).eq("plan_item_id", c.planItemId).eq("scene_index", c.sceneIndex), "clips.replace");
    must(
      await this.sb.from("content_clips").insert({ id: c.id, user_id: c.userId, plan_item_id: c.planItemId, scene_index: c.sceneIndex, storage_key: c.storageKey, duration_sec: c.durationSec, has_audio: c.hasAudio }),
      "clips.insert",
    );
  }
  private toRender(r: Record<string, unknown>): Render {
    return { id: r.id as string, userId: r.user_id as string, planItemId: r.plan_item_id as string, storageKey: r.storage_key as string, totalSec: Number(r.total_sec), createdAt: r.created_at as string };
  }
  async listRenders(u: string, i: string) {
    const r = must(await this.sb.from("renders").select("*").eq("user_id", u).eq("plan_item_id", i).order("created_at"), "renders.list");
    return (r ?? []).map((x) => this.toRender(x));
  }
  async getRender(id: string) {
    const r = must(await this.sb.from("renders").select("*").eq("id", id).maybeSingle(), "renders.get");
    return r ? this.toRender(r) : undefined;
  }
  async addRender(r: Render) {
    must(await this.sb.from("renders").insert({ id: r.id, user_id: r.userId, plan_item_id: r.planItemId, storage_key: r.storageKey, total_sec: r.totalSec, created_at: r.createdAt }), "renders.add");
  }
  async listPosts(u: string) {
    const r = must(await this.sb.from("scheduled_posts").select("data").eq("user_id", u).order("publish_at"), "posts.list");
    return (r ?? []).map((x) => x.data as PB.ScheduledPost);
  }
  async listActivePosts() {
    const r = must(await this.sb.from("scheduled_posts").select("data").not("status", "in", "(published,failed,canceled)"), "posts.active");
    return (r ?? []).map((x) => x.data as PB.ScheduledPost);
  }
  async savePosts(posts: PB.ScheduledPost[]) {
    if (!posts.length) return;
    must(
      await this.sb.from("scheduled_posts").upsert(
        posts.map((p) => ({ id: p.id, user_id: p.userId, plan_item_id: p.planItemId ?? null, status: p.status, publish_at: p.publishAt, data: p, updated_at: new Date().toISOString() })),
      ),
      "posts.save",
    );
  }
  async listContributions(f: { userId?: string; statuses?: C.ContributionStatus[] }) {
    let q = this.sb.from("contributions").select("data").order("created_at");
    if (f.userId) q = q.eq("user_id", f.userId);
    if (f.statuses) q = q.in("status", f.statuses);
    const r = must(await q, "contributions.list");
    return (r ?? []).map((x) => x.data as C.Contribution);
  }
  async getContribution(id: string) {
    const r = must(await this.sb.from("contributions").select("data").eq("id", id).maybeSingle(), "contributions.get");
    return (r?.data as C.Contribution | undefined) ?? undefined;
  }
  async saveContribution(c: C.Contribution) {
    must(
      await this.sb.from("contributions").upsert({ id: c.id, user_id: c.userId, activity_key: c.activityId, activity_name: c.activityName, status: c.status, data: c, updated_at: new Date().toISOString() }),
      "contributions.save",
    );
  }
  async getDemoMedia(u: string) {
    const r = must(await this.sb.from("demo_media").select("media").eq("user_id", u).maybeSingle(), "demo.get");
    return (r?.media as F.MediaMetrics[] | undefined) ?? undefined;
  }
  async setDemoMedia(u: string, m: F.MediaMetrics[]) {
    must(await this.sb.from("demo_media").upsert({ user_id: u, media: m }), "demo.set");
  }
  async listCodedReviews() {
    const r = must(await this.sb.from("coded_reviews").select("data").order("created_at", { ascending: false }).limit(500), "coded.list");
    return (r ?? []).map((x) => x.data as T.CodedReview);
  }
  async getCodedReview(id: string) {
    const r = must(await this.sb.from("coded_reviews").select("data").eq("id", id).maybeSingle(), "coded.get");
    return (r?.data as T.CodedReview | undefined) ?? undefined;
  }
  async saveCodedReview(c: T.CodedReview) {
    must(
      await this.sb.from("coded_reviews").upsert({ id: c.id, url: c.meta.url, status: c.status, created_by: c.createdBy, data: c, created_at: c.createdAt, updated_at: new Date().toISOString() }),
      "coded.save",
    );
  }
}

class SupabaseFiles implements FileStore {
  constructor(private sb: SupabaseClient, private bucket = "media") {}
  localPath(key: string) {
    return join(DATA_DIR, "cache", key);
  }
  async put(key: string, data: Buffer, contentType: string) {
    const { error } = await this.sb.storage.from(this.bucket).upload(key, data, { contentType, upsert: true });
    if (error) throw new Error(`Storage 업로드 실패: ${error.message}`);
  }
  async toLocal(key: string) {
    const p = this.localPath(key);
    if (existsSync(p)) return p;
    const { data, error } = await this.sb.storage.from(this.bucket).download(key);
    if (error || !data) throw new Error(`Storage 다운로드 실패: ${error?.message}`);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, Buffer.from(await data.arrayBuffer()));
    return p;
  }
  async signedUrl(key: string, seconds: number) {
    const { data, error } = await this.sb.storage.from(this.bucket).createSignedUrl(key, seconds);
    if (error) throw new Error(`서명 URL 실패: ${error.message}`);
    return data.signedUrl;
  }
  async remove(key: string) {
    await this.sb.storage.from(this.bucket).remove([key]);
  }
  async createUploadUrl(key: string) {
    const { data, error } = await this.sb.storage.from(this.bucket).createSignedUploadUrl(key);
    if (error) throw new Error(`업로드 주소 실패: ${error.message}`);
    return data.signedUrl;
  }
}

/* ------------------------------------------------------------------ */
/* 선택                                                                 */
/* ------------------------------------------------------------------ */

const g = globalThis as unknown as { __slRepo?: { repo: Repo; files: FileStore } };
if (!g.__slRepo) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    g.__slRepo = { repo: new SupabaseRepo(sb), files: new SupabaseFiles(sb) };
  } else {
    g.__slRepo = { repo: new MemoryRepo(), files: new LocalFiles() };
  }
}
export const repo = g.__slRepo!.repo;
export const files = g.__slRepo!.files;

export const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function todayISO(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

