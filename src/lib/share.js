// Share-a-program links. MakeCode has a Share button; the free version of
// that is to put the program in the URL itself — no backend, no database,
// no account, and therefore no running cost.
//
// Workspace JSON -> gzip (native CompressionStream, no dependency) ->
// base64url -> location.hash. Falls back to plain base64 on browsers
// without CompressionStream.

const PREFIX = '#p=';

function toBase64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function gzip(text) {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes) {
  if (typeof DecompressionStream === 'undefined') return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

/** @returns {Promise<string>} a location.hash value, e.g. "#p=H4sI..." */
export async function encodeProgram(workspaceJson) {
  const text = JSON.stringify(workspaceJson);
  const raw = PREFIX + 'r' + toBase64url(new TextEncoder().encode(text));

  // gzip carries ~20 bytes of header, which base64 then inflates by a third,
  // so for a five-block beginner program compressing makes the link LONGER.
  // Try both and keep the shorter one; the tag byte says which we used.
  const packed = await gzip(text);
  if (!packed) return raw;
  const zipped = PREFIX + 'g' + toBase64url(packed);
  return zipped.length < raw.length ? zipped : raw;
}

/** @returns {Promise<object|null>} workspace JSON, or null if the hash has none */
export async function decodeProgram(hash) {
  if (!hash || !hash.startsWith(PREFIX)) return null;
  const payload = hash.slice(PREFIX.length);
  const kind = payload[0];
  const data = payload.slice(1);
  try {
    const bytes = fromBase64url(data);
    const text = kind === 'g' ? await gunzip(bytes) : new TextDecoder().decode(bytes);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}
