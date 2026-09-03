/**
 * photo.js — turns a picked image into something a spreadsheet cell can hold.
 *
 * A cell tops out at 50,000 characters and the photo travels as a base64 data
 * URL, so the image is cropped square, scaled down, and re-encoded at falling
 * quality until it fits. The result is a thumbnail — good enough for a tile,
 * and deliberately not an archive of the original.
 */

const MAX_EDGE = 320;
const MAX_CHARS = 40000;
const QUALITY_STEPS = [0.72, 0.62, 0.52, 0.42, 0.34, 0.26];

async function loadImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      // from-image applies the EXIF rotation phones write into their photos.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (error) {
      // Older engines reject the option; fall through to the <img> route.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('That file could not be read as an image.'));
      image.src = url;
    });
  } finally {
    // Revoking immediately is safe: decoding has already finished.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export async function fileToThumbnail(file) {
  if (!file || !/^image\//.test(file.type)) {
    throw new Error('Choose an image file.');
  }

  const source = await loadImage(file);
  const width = source.width || source.naturalWidth;
  const height = source.height || source.naturalHeight;
  if (!width || !height) throw new Error('That image could not be read.');

  // Centre crop to a square, because the tile is one.
  const side = Math.min(width, height);
  const sx = (width - side) / 2;
  const sy = (height - side) / 2;
  const edge = Math.min(MAX_EDGE, side);

  const canvas = document.createElement('canvas');
  canvas.width = edge;
  canvas.height = edge;

  const context = canvas.getContext('2d');
  context.drawImage(source, sx, sy, side, side, 0, 0, edge, edge);
  if (source.close) source.close();

  for (const quality of QUALITY_STEPS) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_CHARS) return url;
  }

  throw new Error('That image could not be compressed small enough.');
}
