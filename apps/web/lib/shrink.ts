/** 브라우저에서 사진을 줄인다 (긴 변 max px JPEG). 서버 요청 크기(4.5MB) 안에 여러 장을 넣으려고 */
export async function shrinkImage(f: File, max = 1024, quality = 0.8): Promise<File> {
  if (!f.type.startsWith("image/") || f.type === "image/gif") return f;
  try {
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && f.size < 400 * 1024) return f;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", quality));
    return blob ? new File([blob], f.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : f;
  } catch {
    return f;
  }
}
