/**
 * Minimal Gemini REST client (no SDK) with model fallback.
 *
 * Verified against ai.google.dev (Oct 2026):
 *  - POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *  - Streaming: …:streamGenerateContent?alt=sse  (server-sent events, one JSON chunk per `data:` line)
 *  - Header: x-goog-api-key: <key>  (fallback: ?key=<key> after an auth error; see AuthMode)
 *  - Body: { contents: [{ role, parts: [{ text }] }], systemInstruction: { parts: [{ text }] },
 *            generationConfig: { maxOutputTokens, thinkingConfig: { thinkingLevel } } }
 *  - Gemini 3.x uses thinkingLevel ("minimal" | "low" | "medium" | "high"). 3.8 Flash rejects
 *    "minimal" (lowest is "low"); 3.6 Flash and 3.5/3.1 Flash-Lite accept "minimal".
 *  - The last turn must be a user turn (a trailing model turn is a 400).
 *
 * Fallback: last-working model (persisted) → the other Flash model(s) → Flash-Lite, moving on
 * only for quota (429 / RESOURCE_EXHAUSTED), retired models (404) and overload (5xx).
 * If a model rejects the thinking config, it is retried once without it.
 * No list-models call is made.
 *
 * Streaming: React Native's built-in fetch has no response.body, so streaming uses expo/fetch
 * (ReadableStream body). If streaming isn't available the reply arrives in one piece.
 */

export const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

export interface ModelSpec {
  id: string;
  tier: 'flash' | 'flash-lite';
  /** Lowest thinking level the model accepts (fastest). */
  thinking: ThinkingLevel;
}

/** Default chain, best first. Order within a tier is the fallback order. */
export const MODELS: ModelSpec[] = [
  { id: 'gemini-3.8-flash', tier: 'flash', thinking: 'low' },
  { id: 'gemini-3.6-flash', tier: 'flash', thinking: 'minimal' },
  { id: 'gemini-3.5-flash-lite', tier: 'flash-lite', thinking: 'minimal' },
  { id: 'gemini-3.1-flash-lite', tier: 'flash-lite', thinking: 'minimal' },
];

export const FREE_LIMIT_MESSAGE =
  'You’ve hit Gemini’s free limit for now — it resets around 12:30–1:30 pm IST.';
export const BAD_KEY_MESSAGE = 'Google didn’t accept that key.';
export const NETWORK_MESSAGE = 'Couldn’t reach Google. Check your internet connection and try again.';

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

export type ErrorKind = 'quota' | 'auth' | 'thinking' | 'model-gone' | 'overloaded' | 'bad-request' | 'network';

export class GeminiError extends Error {
  constructor(
    public kind: ErrorKind,
    message: string,
    public status?: number,
    /** Key transport in use when this was thrown (lets callers remember it on quota). */
    public authMode?: AuthMode
  ) {
    super(message);
  }
}

/** Fallback order: last-working model first, then the rest in default order. */
export function modelOrder(lastWorking: string | null, models: ModelSpec[] = MODELS): ModelSpec[] {
  const first = models.find((m) => m.id === lastWorking);
  return first ? [first, ...models.filter((m) => m !== first)] : [...models];
}

/** Map an HTTP error response to a kind. Body is Google's JSON error (or text). */
export function classifyError(status: number, body: string): ErrorKind {
  let reason = '';
  let message = '';
  let st = '';
  try {
    const j = JSON.parse(body) as {
      error?: { status?: string; message?: string; details?: { reason?: string }[] };
    };
    st = j.error?.status ?? '';
    message = j.error?.message ?? '';
    reason = (j.error?.details ?? []).map((d) => d.reason ?? '').join(' ');
  } catch {
    message = body;
  }
  const all = `${st} ${reason} ${message}`;
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(st + ' ' + reason)) return 'quota';
  if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid|PERMISSION_DENIED|UNAUTHENTICATED|ACCESS_TOKEN_TYPE_UNSUPPORTED/i.test(all))
    return 'auth';
  if (status === 400 && /thinking/i.test(message)) return 'thinking';
  if (status === 404 || /NOT_FOUND/.test(st)) return 'model-gone';
  if (status >= 500) return 'overloaded';
  return 'bad-request';
}

export function buildBody(opts: {
  system: string;
  turns: ChatTurn[];
  thinking: ThinkingLevel | null;
  maxOutputTokens?: number;
}) {
  const generationConfig: Record<string, unknown> = {};
  if (opts.maxOutputTokens) generationConfig.maxOutputTokens = opts.maxOutputTokens;
  if (opts.thinking) generationConfig.thinkingConfig = { thinkingLevel: opts.thinking };
  return {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    generationConfig,
  };
}

/** Pull the visible text out of one response chunk (skips "thought" parts). */
export function textOf(chunk: unknown): string {
  const c = chunk as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  const parts = c?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
}

/** Parse complete SSE events out of a buffer; returns parsed JSON payloads and the remainder. */
export function parseSse(buffer: string): { events: unknown[]; rest: string } {
  const events: unknown[] = [];
  const normalized = buffer.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');
  const rest = blocks.pop() ?? '';
  for (const block of blocks) {
    const data = block
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart())
      .join('\n');
    if (!data || data === '[DONE]') continue;
    try {
      events.push(JSON.parse(data));
    } catch {
      // ignore a malformed chunk
    }
  }
  return { events, rest };
}

/* ------------------------------- Transport ------------------------------- */

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  body?: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> } } | null;
}
/**
 * How the key is sent. 'header' = x-goog-api-key (documented default). 'query' = ?key=… — some
 * AI Studio "AQ." keys have been reported to fail with the header on REST, so on an auth error
 * we retry once with the other mode and remember whichever one worked.
 */
export type AuthMode = 'header' | 'query';

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }
) => Promise<FetchResponseLike>;

function defaultFetch(): { fetch: FetchLike; canStream: boolean } {
  try {
    // expo/fetch supports streaming response bodies on Android/iOS.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ef = (require('expo/fetch') as { fetch: unknown }).fetch as FetchLike;
    if (typeof ef === 'function') return { fetch: ef, canStream: typeof TextDecoder !== 'undefined' };
  } catch {
    // fall through
  }
  return { fetch: globalThis.fetch as unknown as FetchLike, canStream: false };
}

function requestUrl(model: string, stream: boolean, key: string, auth: AuthMode): string {
  const base = `${API_BASE}/${model}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
  if (auth === 'header') return base;
  return `${base}${stream ? '&' : '?'}key=${encodeURIComponent(key)}`;
}

async function readStream(
  body: NonNullable<FetchResponseLike['body']>,
  onText?: (full: string) => void
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: true });
    const { events, rest } = parseSse(done ? buf + '\n\n' : buf);
    buf = rest;
    for (const ev of events) {
      const t = textOf(ev);
      if (t) {
        full += t;
        onText?.(full);
      }
    }
    if (done) break;
  }
  return full;
}

const isAbort = (e: unknown) => (e as { name?: string })?.name === 'AbortError';

async function callOnce(opts: {
  fetchImpl: FetchLike;
  canStream: boolean;
  key: string;
  auth: AuthMode;
  model: string;
  body: unknown;
  onText?: (full: string) => void;
  signal?: AbortSignal;
  /** Internal: force a one-shot request (used after a broken stream). */
  noStream?: boolean;
}): Promise<string> {
  const stream = !!opts.onText && opts.canStream && !opts.noStream;
  const url = requestUrl(opts.model, stream, opts.key, opts.auth);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth === 'header') headers['x-goog-api-key'] = opts.key;
  let res: FetchResponseLike;
  try {
    res = await opts.fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new GeminiError('network', NETWORK_MESSAGE);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const kind = classifyError(res.status, body);
    // Never include the URL (it may carry ?key=) or the body in the message.
    throw new GeminiError(kind, `Gemini error ${res.status}`, res.status);
  }

  if (stream && res.body && typeof res.body.getReader === 'function') {
    let streamed = '';
    try {
      return await readStream(res.body, (full) => {
        streamed = full;
        opts.onText?.(full);
      });
    } catch (e) {
      if (isAbort(e)) throw e;
      // The stream broke. If nothing arrived yet, fall back to one non-streaming request.
      if (!streamed) return callOnce({ ...opts, noStream: true });
      throw new GeminiError('network', NETWORK_MESSAGE);
    }
  }

  let raw: string;
  try {
    raw = await res.text();
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new GeminiError('network', NETWORK_MESSAGE);
  }
  let full = '';
  if (stream) {
    // Body wasn't streamable after all: parse the whole SSE payload at once.
    for (const ev of parseSse(raw + '\n\n').events) full += textOf(ev);
  } else {
    try {
      full = textOf(JSON.parse(raw));
    } catch {
      full = '';
    }
  }
  opts.onText?.(full);
  return full;
}

export interface GenerateOptions {
  key: string;
  system: string;
  turns: ChatTurn[];
  /** Called with the full text so far (streaming) or once at the end. */
  onText?: (full: string) => void;
  lastWorkingModel?: string | null;
  maxOutputTokens?: number;
  models?: ModelSpec[];
  fetchImpl?: FetchLike;
  canStream?: boolean;
  signal?: AbortSignal;
  /** Key transport that worked last time (persisted by the caller). Default 'header'. */
  authMode?: AuthMode | null;
}

export interface GenerateResult {
  text: string;
  model: string;
  /** Key transport that worked; the caller should remember it. */
  authMode: AuthMode;
  /** Every model tried, in order (for tests/diagnostics; never includes the key). */
  attempts: string[];
}

/**
 * Generate a reply with fallback. Throws GeminiError:
 *  - 'auth'  → BAD_KEY_MESSAGE
 *  - 'quota' → FREE_LIMIT_MESSAGE (every model exhausted)
 *  - 'network' / others → a friendly message
 */
export async function generate(o: GenerateOptions): Promise<GenerateResult> {
  const d = o.fetchImpl ? { fetch: o.fetchImpl, canStream: o.canStream ?? false } : defaultFetch();
  const order = modelOrder(o.lastWorkingModel ?? null, o.models ?? MODELS);
  const attempts: string[] = [];
  let sawQuota = false;
  let lastErr: GeminiError | null = null;
  let auth: AuthMode = o.authMode ?? 'header';
  let triedOtherAuth = false;

  for (const m of order) {
    let thinking: ThinkingLevel | null = m.thinking;
    // Up to: 1 thinking retry + 1 auth-mode retry.
    for (let attempt = 0; attempt < 3; attempt++) {
      attempts.push(`${m.id}${thinking ? '' : ' (no thinking config)'}${auth === 'query' ? ' [query key]' : ''}`);
      try {
        const text = await callOnce({
          fetchImpl: d.fetch,
          canStream: d.canStream,
          key: o.key,
          auth,
          model: m.id,
          body: buildBody({ system: o.system, turns: o.turns, thinking, maxOutputTokens: o.maxOutputTokens }),
          onText: o.onText,
          signal: o.signal,
        });
        return { text, model: m.id, attempts, authMode: auth };
      } catch (e) {
        if (!(e instanceof GeminiError)) throw e;
        lastErr = e;
        if (e.kind === 'thinking' && thinking) {
          thinking = null; // retry this model once without thinkingConfig
          continue;
        }
        if (e.kind === 'auth') {
          // Only auth errors (never quota) switch transport: retry once with the other mode.
          if (!triedOtherAuth) {
            triedOtherAuth = true;
            auth = auth === 'header' ? 'query' : 'header';
            continue;
          }
          throw new GeminiError('auth', BAD_KEY_MESSAGE, e.status);
        }
        if (e.kind === 'network') throw e;
        if (e.kind === 'quota') sawQuota = true;
        if (e.kind === 'quota' || e.kind === 'model-gone' || e.kind === 'overloaded' || e.kind === 'thinking') break; // next model
        // bad-request: also try the next model once — a newer/older model may accept it.
        break;
      }
    }
  }
  if (sawQuota) throw new GeminiError('quota', FREE_LIMIT_MESSAGE, 429, auth);
  if (lastErr?.kind === 'overloaded')
    throw new GeminiError('overloaded', 'Gemini is busy right now. Please try again in a minute.', lastErr.status);
  throw new GeminiError(lastErr?.kind ?? 'bad-request', 'Gemini couldn’t answer that. Please try again.', lastErr?.status);
}

/**
 * One tiny request to check a key. Resolves 'ok' (Google accepted the key — including when the
 * key is valid but out of quota), 'bad-key', or 'network'.
 */
export async function testKey(
  key: string,
  opts: {
    fetchImpl?: FetchLike;
    lastWorkingModel?: string | null;
    models?: ModelSpec[];
    authMode?: AuthMode | null;
  } = {}
): Promise<{
  result: 'ok' | 'bad-key' | 'network' | 'error';
  model?: string;
  authMode?: AuthMode;
  /** true when Google accepted the key but every model is out of free quota right now. */
  quota?: boolean;
  /** For result 'error': what went wrong (e.g. 'overloaded'), so the UI can say something specific. */
  errorKind?: ErrorKind;
}> {
  try {
    const r = await generate({
      key,
      system: 'Reply with the single word OK.',
      turns: [{ role: 'user', text: 'Say OK.' }],
      maxOutputTokens: 256,
      fetchImpl: opts.fetchImpl,
      lastWorkingModel: opts.lastWorkingModel,
      models: opts.models,
      authMode: opts.authMode,
    });
    return { result: 'ok', model: r.model, authMode: r.authMode };
  } catch (e) {
    if (e instanceof GeminiError) {
      if (e.kind === 'auth') return { result: 'bad-key' };
      if (e.kind === 'quota') return { result: 'ok', authMode: e.authMode, quota: true };
      if (e.kind === 'network') return { result: 'network' };
      return { result: 'error', errorKind: e.kind };
    }
    return { result: 'error' };
  }
}
