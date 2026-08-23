// Client-side EXIF/metadata stripper (PRD §9.3, §15.3). A minor is publishing to
// the open internet, and phone photos carry GPS location in their EXIF. This runs
// ENTIRELY in the browser — the image is decoded and re-drawn to a canvas, then
// re-encoded, which discards every metadata block (GPS, camera, timestamps).
// Nothing is ever uploaded to us.

/** Load a File/Blob into an HTMLImageElement. */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not an image the browser can read.')); };
    img.src = url;
  });
}

/**
 * Return a new image Blob with all metadata removed by re-encoding.
 * @param {File|Blob} file
 * @param {object} [opts] { type='image/jpeg', quality=0.92, maxSize }
 * @returns {Promise<Blob>}
 */
export async function stripMetadata(file, opts = {}) {
  const { type = 'image/jpeg', quality = 0.92, maxSize = 0 } = opts;
  const img = await loadImage(file);
  let { naturalWidth: w, naturalHeight: h } = img;
  if (maxSize && Math.max(w, h) > maxSize) {
    const scale = maxSize / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not re-encode the image.'))), type, quality)
  );
}
