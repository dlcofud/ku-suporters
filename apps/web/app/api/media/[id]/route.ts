import { createReadStream, statSync, existsSync } from "node:fs";
import { Readable } from "node:stream";
import { repo, files } from "@/lib/repo";

/**
 * 편집된 릴스 파일 제공. 미리보기와, 예약 게시 때 인스타 서버가 영상을 가져가는 주소로 쓴다.
 * - Supabase 모드: 1시간짜리 서명 URL로 넘겨준다 (비공개 버킷)
 * - 메모리 모드: 로컬 파일을 직접 보낸다
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await repo.getRender(id);
  if (!r) return new Response("없음", { status: 404 });
  const signed = await files.signedUrl(r.storageKey, 3600);
  if (signed) return Response.redirect(signed, 302);
  const path = files.localPath(r.storageKey);
  if (!existsSync(path)) return new Response("파일 없음", { status: 404 });
  const size = statSync(path).size;
  const range = req.headers.get("range");
  if (range) {
    const [s, e] = range.replace("bytes=", "").split("-");
    const start = Number(s);
    const end = e ? Number(e) : size - 1;
    const stream = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers: { "Content-Type": "video/mp4", "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1) } });
  }
  const stream = Readable.toWeb(createReadStream(path)) as ReadableStream;
  return new Response(stream, { headers: { "Content-Type": "video/mp4", "Content-Length": String(size), "Accept-Ranges": "bytes" } });
}
