// Client transport for the AI tutor.
//
// Two jobs beyond "call fetch":
//  1. Streaming — the server may reply with SSE so answers appear word by
//     word instead of after a four-second stare at a spinner. Plain JSON is
//     still handled, so the endpoint can fall back without a client change.
//  2. A per-browser daily question cap. Cloudflare's Workers AI free
//     allocation is 10,000 Neurons/day; this keeps a stuck loop (or a bored
//     afternoon) from burning through it. Like the progress gate, this is a
//     guardrail and not a security boundary — the server enforces its own
//     limits too.

const DAILY_CAP = 40;

function todayKey() {
  return `lr-tutor-${new Date().toISOString().slice(0, 10)}`;
}

function usedToday() {
  try {
    return Number(localStorage.getItem(todayKey()) || 0);
  } catch {
    return 0;
  }
}

export function remainingToday() {
  return Math.max(0, DAILY_CAP - usedToday());
}

function bump() {
  try {
    localStorage.setItem(todayKey(), String(usedToday() + 1));
  } catch {}
}

/**
 * @param {object} payload  { question, history, lessonId, mode, context }
 * @param {(chunk: string) => void} onChunk  called as text arrives
 */
export async function askTutor(payload, onChunk) {
  if (!navigator.onLine) throw new Error('offline');
  if (remainingToday() <= 0) throw new Error('daily-cap');
  bump();

  let charged = true;
  // A question that never reached the model shouldn't cost the learner one
  // of their daily slots — notably when upstream rate limiting rejects it.
  const refund = () => {
    if (!charged) return;
    charged = false;
    try {
      localStorage.setItem(todayKey(), String(Math.max(0, usedToday() - 1)));
    } catch {}
  };

  let res;
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // astro dev has no /api route at all, so fetch itself rejects
    refund();
    throw new Error('local-dev');
  }

  if (!res.ok) {
    refund();
    let serverMessage = '';
    try {
      const body = await res.json();
      if (body.error) serverMessage = String(body.error);
    } catch {}

    const err = new Error(serverMessage || `status ${res.status}`);
    err.status = res.status;
    err.serverMessage = serverMessage;
    // worker/index.js rate-limits per IP, and the chat function returns 429
    // when the free daily AI allowance is gone. Both already phrase
    // themselves for a teenager, so the widget shows them verbatim.
    if (res.status === 503) err.code = 'no-backend';
    else if (res.status === 404) err.code = 'local-dev';
    else if (res.status === 429) err.code = 'rate-limit';
    throw err;
  }

  const type = res.headers.get('Content-Type') || '';

  // --- non-streaming JSON --------------------------------------------
  if (type.includes('application/json')) {
    const data = await res.json();
    const answer = data.answer || '';
    if (answer) onChunk(answer);
    return answer;
  }

  // --- SSE stream ------------------------------------------------------
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const piece = parsed.response ?? parsed.delta?.text ?? '';
        if (piece) {
          full += piece;
          onChunk(piece);
        }
      } catch {
        // partial JSON across chunk boundaries — the buffer will catch it
      }
    }
  }

  return full;
}
