/**
 * 예약 게시 (요구사항 4).
 *
 * 인스타 Content Publishing API는 "컨테이너 만들기 → 처리 완료 확인 → 게시" 순서이고,
 * 컨테이너는 24시간 안에 게시하지 않으면 만료된다. 그래서 예약은 우리 DB에 저장해 두고,
 * 게시 시각 직전에 컨테이너를 만들고, 처리가 끝나면 정해진 시각에 게시한다.
 *
 * 실행: 서버의 주기 작업(Vercel Cron, Supabase pg_cron 등)이 5분마다 tick()을 부른다.
 *
 * 개발 모드: 앱에 역할(관리자·테스터)이 있는 본인 계정이면 앱 검수 없이 쓸 수 있다.
 * 다른 사용자 계정에 게시하려면 Meta 앱 검수(Advanced Access)가 필요하다.
 */

export type PublishMediaType = "REELS" | "IMAGE";

export type ScheduledStatus = "scheduled" | "container_created" | "ready" | "published" | "failed" | "canceled";

export interface ScheduledPost {
  id: string;
  userId: string;
  igUserId: string;
  planItemId?: string;
  mediaType: PublishMediaType;
  /** 인스타 서버가 가져갈 수 있는 공개 https 주소 (예: Supabase Storage 서명 URL) */
  mediaUrl: string;
  caption: string;
  /** 릴스를 피드에도 보여줄지 */
  shareToFeed?: boolean;
  publishAt: string;
  status: ScheduledStatus;
  containerId?: string;
  mediaId?: string;
  attempts: number;
  lastError?: string;
  log: { at: string; message: string }[];
}

export const CAPTION_MAX = 2200;
export const HASHTAG_MAX = 30;
export const MENTION_MAX = 20;
/** 게시 시각보다 몇 분 먼저 컨테이너를 만들지 (영상 처리 시간 확보) */
export const CONTAINER_LEAD_MIN = 30;
export const MAX_ATTEMPTS = 3;

export function validatePost(p: Pick<ScheduledPost, "caption" | "mediaUrl" | "publishAt">, now: Date): string[] {
  const errors: string[] = [];
  if ([...p.caption].length > CAPTION_MAX) errors.push(`캡션은 ${CAPTION_MAX}자 이하여야 해요`);
  const tags = p.caption.match(/#[^\s#]+/g) ?? [];
  if (tags.length > HASHTAG_MAX) errors.push(`해시태그는 ${HASHTAG_MAX}개 이하여야 해요 (지금 ${tags.length}개)`);
  const mentions = p.caption.match(/@[\w.]+/g) ?? [];
  if (mentions.length > MENTION_MAX) errors.push(`@언급은 ${MENTION_MAX}개 이하여야 해요`);
  if (!/^https:\/\//.test(p.mediaUrl)) errors.push("영상·이미지는 공개 https 주소여야 해요");
  if (new Date(p.publishAt).getTime() <= now.getTime()) errors.push("게시 시각은 지금 이후여야 해요");
  if (p.caption.includes("[여기에 내 경험 한 줄을 직접 써 주세요]")) errors.push("캡션의 빈칸을 직접 채워 주세요");
  return errors;
}

export function schedulePost(
  input: Omit<ScheduledPost, "status" | "attempts" | "log" | "containerId" | "mediaId" | "lastError">,
  now: Date,
): ScheduledPost {
  const errors = validatePost(input, now);
  if (errors.length) throw new Error(errors.join("\n"));
  return { ...input, status: "scheduled", attempts: 0, log: [{ at: now.toISOString(), message: "예약됨" }] };
}

export function cancelPost(p: ScheduledPost, now: Date): ScheduledPost {
  if (p.status === "published") throw new Error("이미 게시된 콘텐츠는 취소할 수 없어요");
  return { ...p, status: "canceled", log: [...p.log, { at: now.toISOString(), message: "취소됨" }] };
}

/* ------------------------------------------------------------------ */
/* 인스타 게시 클라이언트                                               */
/* ------------------------------------------------------------------ */

export type ContainerStatus = "IN_PROGRESS" | "FINISHED" | "PUBLISHED" | "ERROR" | "EXPIRED";

export interface InstagramPublisher {
  createContainer(p: ScheduledPost, accessToken: string): Promise<string>;
  containerStatus(containerId: string, accessToken: string): Promise<ContainerStatus>;
  publish(igUserId: string, containerId: string, accessToken: string): Promise<string>;
  /** 최근 24시간 게시 사용량 */
  publishingLimit(igUserId: string, accessToken: string): Promise<{ used: number; total: number }>;
}

/**
 * Instagram API with Instagram Login (graph.instagram.com) 구현.
 * 필요한 권한: instagram_business_basic, instagram_business_content_publish
 * (Facebook 로그인 방식을 쓰면 host를 graph.facebook.com 으로, 권한을 instagram_content_publish 로 바꾼다.)
 */
export class GraphApiPublisher implements InstagramPublisher {
  constructor(private readonly host = "https://graph.instagram.com", private readonly version = "v26.0") {}

  private async call<T>(method: "GET" | "POST", path: string, token: string, body?: Record<string, unknown>, query?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.host}/${this.version}/${path}`);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Instagram API ${res.status}: ${text.slice(0, 400)}`);
    return JSON.parse(text) as T;
  }

  async createContainer(p: ScheduledPost, token: string) {
    const body: Record<string, unknown> =
      p.mediaType === "REELS"
        ? { media_type: "REELS", video_url: p.mediaUrl, caption: p.caption, share_to_feed: p.shareToFeed ?? true }
        : { image_url: p.mediaUrl, caption: p.caption };
    const r = await this.call<{ id: string }>("POST", `${p.igUserId}/media`, token, body);
    return r.id;
  }

  async containerStatus(id: string, token: string) {
    const r = await this.call<{ status_code: ContainerStatus }>("GET", id, token, undefined, { fields: "status_code" });
    return r.status_code;
  }

  async publish(igUserId: string, containerId: string, token: string) {
    const r = await this.call<{ id: string }>("POST", `${igUserId}/media_publish`, token, { creation_id: containerId });
    return r.id;
  }

  async publishingLimit(igUserId: string, token: string) {
    const r = await this.call<{ data: { quota_usage: number; config?: { quota_total?: number } }[] }>(
      "GET",
      `${igUserId}/content_publishing_limit`,
      token,
      undefined,
      { fields: "quota_usage,config" },
    );
    const d = r.data[0];
    return { used: d?.quota_usage ?? 0, total: d?.config?.quota_total ?? 50 };
  }
}

/** 테스트·데모용 가짜 게시 클라이언트 */
export class MockPublisher implements InstagramPublisher {
  created: string[] = [];
  published: string[] = [];
  statuses = new Map<string, ContainerStatus>();
  used = 0;
  total = 50;
  async createContainer(p: ScheduledPost) {
    const id = `ctr_${p.id}_${this.created.length}`;
    this.created.push(id);
    this.statuses.set(id, "IN_PROGRESS");
    return id;
  }
  async containerStatus(id: string) {
    return this.statuses.get(id) ?? "ERROR";
  }
  async publish(_ig: string, containerId: string) {
    this.published.push(containerId);
    this.statuses.set(containerId, "PUBLISHED");
    this.used++;
    return `media_${containerId}`;
  }
  async publishingLimit() {
    return { used: this.used, total: this.total };
  }
}

/* ------------------------------------------------------------------ */
/* 스케줄러                                                             */
/* ------------------------------------------------------------------ */

function withLog(p: ScheduledPost, now: Date, message: string, patch: Partial<ScheduledPost> = {}): ScheduledPost {
  return { ...p, ...patch, log: [...p.log, { at: now.toISOString(), message }] };
}

/**
 * 한 번의 주기 작업. 각 예약을 한 단계씩 앞으로 진행시킨 결과를 돌려준다(저장은 호출한 쪽에서).
 * 실패해도 다른 예약은 계속 처리한다.
 */
export async function tick(
  posts: ScheduledPost[],
  now: Date,
  client: InstagramPublisher,
  tokenFor: (p: ScheduledPost) => Promise<string>,
): Promise<ScheduledPost[]> {
  const out: ScheduledPost[] = [];
  for (const p of posts) {
    try {
      out.push(await step(p, now, client, await tokenFor(p)));
    } catch (e) {
      const attempts = p.attempts + 1;
      const msg = e instanceof Error ? e.message : String(e);
      out.push(
        withLog(p, now, `오류: ${msg}`, {
          attempts,
          lastError: msg,
          // 컨테이너 처리에 실패했으면 다음 주기에 컨테이너를 새로 만든다
          status: attempts >= MAX_ATTEMPTS ? "failed" : p.status === "container_created" ? "scheduled" : p.status,
          containerId: p.status === "container_created" ? undefined : p.containerId,
        }),
      );
    }
  }
  return out;
}

async function step(p: ScheduledPost, now: Date, client: InstagramPublisher, token: string): Promise<ScheduledPost> {
  const publishAt = new Date(p.publishAt).getTime();
  const t = now.getTime();
  switch (p.status) {
    case "scheduled": {
      if (t < publishAt - CONTAINER_LEAD_MIN * 60_000) return p;
      const containerId = await client.createContainer(p, token);
      return withLog(p, now, "컨테이너 생성", { status: "container_created", containerId });
    }
    case "container_created": {
      const s = await client.containerStatus(p.containerId!, token);
      if (s === "FINISHED") return withLog(p, now, "영상 처리 완료", { status: "ready" });
      if (s === "IN_PROGRESS") return p;
      if (s === "EXPIRED") return withLog(p, now, "컨테이너 만료, 다시 만듦", { status: "scheduled", containerId: undefined });
      if (s === "PUBLISHED") return withLog(p, now, "이미 게시됨", { status: "published" });
      throw new Error("인스타 쪽 영상 처리 실패 (영상 규격을 확인하세요: 9:16, H.264/AAC, 90초 이하)");
    }
    case "ready": {
      if (t < publishAt) return p;
      const limit = await client.publishingLimit(p.igUserId, token);
      if (limit.used >= limit.total) return withLog(p, now, `24시간 게시 한도 도달 (${limit.used}/${limit.total}), 다음 주기에 다시 시도`);
      const mediaId = await client.publish(p.igUserId, p.containerId!, token);
      return withLog(p, now, "게시 완료", { status: "published", mediaId });
    }
    default:
      return p;
  }
}
