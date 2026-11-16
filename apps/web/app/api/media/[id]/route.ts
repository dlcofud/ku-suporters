import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { db } from "@/lib/store";

/** 편집된 릴스 파일 제공. 미리보기와, 예약 게시 때 인스타 서버가 영상을 가져가는 주소로 쓴다. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = db.renders.find((x) => x.id === id);
  if (!r) return new Response("없음", { status: 404 });
  const size = statSync(r.path).size;
  const range = req.headers.get("range");
  if (range) {
    const [s, e] = range.replace("bytes=", "").split("-");
    const start = Number(s);
    const end = e ? Number(e) : size - 1;
    const stream = Readable.toWeb(createReadStream(r.path, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers: { "Content-Type": "video/mp4", "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1) } });
  }
  const stream = Readable.toWeb(createReadStream(r.path)) as ReadableStream;
  return new Response(stream, { headers: { "Content-Type": "video/mp4", "Content-Length": String(size), "Accept-Ranges": "bytes" } });
}
