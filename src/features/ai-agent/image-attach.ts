// Browser-side preparation of photos for the chat. Pictures are shrunk before they are sent (a phone
// photo can be 8 MB; 1600 px on the long side is plenty to read text from), so uploads stay small.
// The server checks the bytes again and never trusts anything computed here.

/** Same limit as the server (src/lib/ai/core/vision.ts). */
export const MAX_ATTACHMENTS = 4;
export const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/webp,image/gif";
const MAX_SIDE = 1600;
const THUMB_SIDE = 96;
const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024;

export type Attachment = {
  id: number;
  name: string;
  mediaType: string;
  /** Base64 of the (shrunk) picture, without a data: prefix. */
  data: string;
  /** A tiny data URL for the thumbnail. */
  thumb: string;
};

const isPicture = (file: File) => /^image\/(png|jpe?g|webp|gif)$/.test(file.type);

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    image.src = url;
  });
}

function draw(image: HTMLImageElement, longSide: number): HTMLCanvasElement {
  const scale = Math.min(1, longSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas");
  context.fillStyle = "#ffffff"; // transparent areas become white, which reads better than black
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Turns a chosen file into something that can be sent, or explains why it cannot. */
export async function prepareImage(file: File, id: number): Promise<{ ok: true; attachment: Attachment } | { ok: false; message: string }> {
  const name = file.name || "photo";
  if (!isPicture(file)) return { ok: false, message: `${name} is not a PNG, JPEG, WebP or GIF picture.` };
  if (file.size > MAX_ORIGINAL_BYTES) return { ok: false, message: `${name} is too large. Choose a picture under 25 MB.` };
  try {
    const image = await loadImage(file);
    const data = draw(image, MAX_SIDE).toDataURL("image/jpeg", 0.85).split(",")[1];
    const thumb = draw(image, THUMB_SIDE).toDataURL("image/jpeg", 0.7);
    if (!data) throw new Error("encode");
    return { ok: true, attachment: { id, name: name.replace(/\.[^.]+$/, "") + ".jpg", mediaType: "image/jpeg", data, thumb } };
  } catch {
    return { ok: false, message: `${name} could not be opened. Try a different picture.` };
  }
}

/** The pictures among files that were pasted or dropped. */
export function picturesIn(files: FileList | File[] | null | undefined): File[] {
  return files ? [...files].filter(isPicture) : [];
}
