import { checkKeyFormat, maskKey, normalizeKey } from '../src/ai/key';
import {
  BAD_KEY_MESSAGE,
  buildBody,
  classifyError,
  FREE_LIMIT_MESSAGE,
  generate,
  GeminiError,
  modelOrder,
  MODELS,
  parseSse,
  testKey,
  textOf,
  type FetchLike,
  type FetchResponseLike,
} from '../src/ai/gemini';
import { buildSummary, type SummaryInput } from '../src/ai/summary';
import { computeCycleStatus } from '../src/health/cyclePrediction';

const AQ_KEY = 'AQ.Ab8RN6Jabcdefghijklmnopqrstuvwxyz0123';
const AIZA_KEY = 'AIzaSyD-abcdefghijklmnopqrstuvwxyz01234';

describe('API key format', () => {
  it('accepts AI Studio "AQ." keys and older "AIza" keys', () => {
    expect(checkKeyFormat(AQ_KEY)).toEqual({ ok: true, key: AQ_KEY });
    expect(checkKeyFormat(AIZA_KEY)).toEqual({ ok: true, key: AIZA_KEY });
  });

  it('only trims surrounding whitespace — never alters the key', () => {
    expect(normalizeKey(`  ${AQ_KEY}\n`)).toBe(AQ_KEY);
    expect(checkKeyFormat(`\t${AIZA_KEY} \n`)).toEqual({ ok: true, key: AIZA_KEY });
    // case and punctuation preserved
    const odd = 'AQ.aB-_.9xYzQwErTyUiOpAsDfGh';
    expect(checkKeyFormat(odd)).toEqual({ ok: true, key: odd });
  });

  it('rejects empty, wrong prefix, inner whitespace and too-short keys', () => {
    expect(checkKeyFormat('   ').ok).toBe(false);
    expect(checkKeyFormat('sk-abcdefghijklmnopqrstuvwxyz').ok).toBe(false);
    expect(checkKeyFormat('aq.lowercaseprefix1234567890').ok).toBe(false);
    expect(checkKeyFormat('AQ.abc def ghi jkl mno pqr').ok).toBe(false);
    expect(checkKeyFormat('AIza123').ok).toBe(false);
  });

  it('masks all but the last 4 characters', () => {
    expect(maskKey(AQ_KEY)).toBe('…0123');
  });
});

/* ------------------------------ Fake transport ------------------------------ */

type Reply = { status: number; body: unknown } | 'network';
function fakeFetch(script: (model: string, body: Record<string, unknown>, url: string) => Reply) {
  const calls: { model: string; url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const f: FetchLike = async (url, init) => {
    const model = url.split('/models/')[1].split(':')[0];
    const body = JSON.parse(init.body) as Record<string, unknown>;
    calls.push({ model, url, body, headers: init.headers });
    const r = script(model, body, url);
    if (r === 'network') throw new TypeError('Network request failed');
    const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    const res: FetchResponseLike = { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => text };
    return res;
  };
  return { f, calls };
}

const okReply = (text: string): Reply => ({ status: 200, body: { candidates: [{ content: { parts: [{ text }] } }] } });
const quota: Reply = { status: 429, body: { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } } };
const badKey: Reply = {
  status: 400,
  body: { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.', details: [{ reason: 'API_KEY_INVALID' }] } },
};
const thinkingRejected: Reply = {
  status: 400,
  body: { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Thinking level MINIMAL is not supported for this model.' } },
};

const base = { key: AQ_KEY, system: 'sys', turns: [{ role: 'user' as const, text: 'hi' }] };

describe('Gemini request shape', () => {
  it('uses generateContent, the x-goog-api-key header and minimal thinking', async () => {
    const { f, calls } = fakeFetch(() => okReply('hello'));
    const r = await generate({ ...base, fetchImpl: f });
    expect(r.text).toBe('hello');
    expect(calls[0].url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${MODELS[0].id}:generateContent`);
    expect(calls[0].headers['x-goog-api-key']).toBe(AQ_KEY);
    expect(calls[0].url).not.toContain(AQ_KEY);
    expect(calls[0].body).toMatchObject({
      systemInstruction: { parts: [{ text: 'sys' }] },
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      generationConfig: { thinkingConfig: { thinkingLevel: MODELS[0].thinking } },
    });
  });

  it('streams via streamGenerateContent?alt=sse when supported', async () => {
    const sse =
      'data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}\r\n\r\n' +
      'data: {"candidates":[{"content":{"parts":[{"text":"lo"}]}}]}\r\n\r\n';
    const urls: string[] = [];
    const enc = new TextEncoder();
    const chunks = [enc.encode(sse.slice(0, 30)), enc.encode(sse.slice(30))];
    const f: FetchLike = async (url) => {
      urls.push(url);
      let i = 0;
      return {
        ok: true,
        status: 200,
        text: async () => sse,
        body: { getReader: () => ({ read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true }) }) },
      };
    };
    const seen: string[] = [];
    const r = await generate({ ...base, fetchImpl: f, canStream: true, onText: (t) => seen.push(t) });
    expect(urls[0]).toContain(':streamGenerateContent?alt=sse');
    expect(r.text).toBe('Hello');
    expect(seen[seen.length - 1]).toBe('Hello');
  });

  it('skips thought parts', () => {
    expect(textOf({ candidates: [{ content: { parts: [{ text: 'x', thought: true }, { text: 'y' }] } }] })).toBe('y');
  });

  it('parses SSE across partial buffers', () => {
    const a = parseSse('data: {"a":1}\n\ndata: {"b"');
    expect(a.events).toEqual([{ a: 1 }]);
    expect(parseSse(a.rest + ':2}\n\n').events).toEqual([{ b: 2 }]);
  });

  it('buildBody omits thinkingConfig when null', () => {
    expect(buildBody({ system: 's', turns: [], thinking: null }).generationConfig).toEqual({});
  });
});

describe('error classification', () => {
  it('maps Google errors to kinds', () => {
    expect(classifyError(429, JSON.stringify((quota as { body: unknown }).body))).toBe('quota');
    expect(classifyError(400, JSON.stringify((badKey as { body: unknown }).body))).toBe('auth');
    expect(classifyError(401, '{"error":{"status":"UNAUTHENTICATED","message":"ACCESS_TOKEN_TYPE_UNSUPPORTED"}}')).toBe('auth');
    expect(classifyError(403, '{"error":{"status":"PERMISSION_DENIED"}}')).toBe('auth');
    expect(classifyError(400, JSON.stringify((thinkingRejected as { body: unknown }).body))).toBe('thinking');
    expect(classifyError(404, '{"error":{"status":"NOT_FOUND"}}')).toBe('model-gone');
    expect(classifyError(503, 'overloaded')).toBe('overloaded');
  });
});

describe('model fallback', () => {
  it('starts from the persisted last-working model', () => {
    expect(modelOrder('gemini-3.5-flash-lite').map((m) => m.id)[0]).toBe('gemini-3.5-flash-lite');
    expect(modelOrder('unknown-model').map((m) => m.id)).toEqual(MODELS.map((m) => m.id));
    expect(modelOrder(null)).toHaveLength(MODELS.length);
  });

  it('falls through Flash → next Flash → Flash-Lite on quota', async () => {
    const { f, calls } = fakeFetch((m) => (m === 'gemini-3.5-flash-lite' ? okReply('lite ok') : quota));
    const r = await generate({ ...base, fetchImpl: f });
    expect(r.model).toBe('gemini-3.5-flash-lite');
    expect(calls.map((c) => c.model)).toEqual(['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite']);
  });

  it('reports the free-limit message when every model is exhausted', async () => {
    const { f, calls } = fakeFetch(() => quota);
    await expect(generate({ ...base, fetchImpl: f })).rejects.toMatchObject({ kind: 'quota', message: FREE_LIMIT_MESSAGE });
    expect(calls).toHaveLength(MODELS.length);
    expect(FREE_LIMIT_MESSAGE).toMatch(/12:30–1:30 pm IST/);
  });

  it('retries once without thinkingConfig when a model rejects it', async () => {
    const { f, calls } = fakeFetch((_m, body) =>
      (body.generationConfig as { thinkingConfig?: unknown }).thinkingConfig ? thinkingRejected : okReply('ok')
    );
    const r = await generate({ ...base, fetchImpl: f });
    expect(r.model).toBe(MODELS[0].id);
    expect(calls).toHaveLength(2);
    expect(calls[1].body.generationConfig).toEqual({});
  });

  it('on a bad key retries once with ?key= then stops (no model fallback)', async () => {
    const { f, calls } = fakeFetch(() => badKey);
    await expect(generate({ ...base, fetchImpl: f })).rejects.toMatchObject({ kind: 'auth', message: BAD_KEY_MESSAGE });
    expect(calls).toHaveLength(2);
    expect(calls[0].headers['x-goog-api-key']).toBe(AQ_KEY);
    expect(calls[0].url).not.toContain('key=');
    expect(calls[1].headers['x-goog-api-key']).toBeUndefined();
    expect(calls[1].url).toContain(`?key=${encodeURIComponent(AQ_KEY)}`);
    expect(calls[1].model).toBe(calls[0].model);
  });

  it('switches to the query-param key when the header is rejected, and reports the mode', async () => {
    const { f, calls } = fakeFetch((_m, _b, url) => (url.includes('key=') ? okReply('ok') : { status: 401, body: { error: { status: 'UNAUTHENTICATED', message: 'API key not valid' } } }));
    const r = await generate({ ...base, fetchImpl: f });
    expect(r.authMode).toBe('query');
    expect(calls).toHaveLength(2);
    // Remembered mode is used first next time.
    const again = fakeFetch((_m, _b, url) => (url.includes('key=') ? okReply('ok') : badKey));
    expect((await generate({ ...base, fetchImpl: again.f, authMode: 'query' })).authMode).toBe('query');
    expect(again.calls).toHaveLength(1);
  });

  it('never switches auth mode on quota errors', async () => {
    const { f, calls } = fakeFetch(() => quota);
    await expect(generate({ ...base, fetchImpl: f })).rejects.toMatchObject({ kind: 'quota', authMode: 'header' });
    expect(calls.every((c) => !c.url.includes('key='))).toBe(true);
  });

  it('puts ?key= after alt=sse with & when streaming', async () => {
    const { f, calls } = fakeFetch((_m, _b, url) => (url.includes('key=') ? { status: 200, body: 'data: {"candidates":[{"content":{"parts":[{"text":"hi"}]}}]}\n\n' } : badKey));
    const r = await generate({ ...base, fetchImpl: f, canStream: true, onText: () => {} });
    expect(r.text).toBe('hi');
    expect(calls[1].url).toMatch(/streamGenerateContent\?alt=sse&key=/);
  });

  it('falls back to one non-streaming request when the stream breaks before any text', async () => {
    const calls: string[] = [];
    const f: FetchLike = async (url) => {
      calls.push(url);
      if (url.includes('streamGenerateContent')) {
        return {
          ok: true,
          status: 200,
          text: async () => '',
          body: { getReader: () => ({ read: async () => { throw new TypeError('stream reset'); } }) },
        };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: 'whole' }] } }] }) };
    };
    const seen: string[] = [];
    const r = await generate({ ...base, fetchImpl: f, canStream: true, onText: (t) => seen.push(t) });
    expect(r.text).toBe('whole');
    expect(seen).toEqual(['whole']);
    expect(calls[0]).toContain('streamGenerateContent');
    expect(calls[1]).toContain(':generateContent');
  });

  it('skips retired models (404)', async () => {
    const { f } = fakeFetch((m) => (m === 'gemini-3.8-flash' ? { status: 404, body: { error: { status: 'NOT_FOUND' } } } : okReply('ok')));
    expect((await generate({ ...base, fetchImpl: f })).model).toBe('gemini-3.6-flash');
  });

  it('surfaces network errors without trying other models', async () => {
    const { f, calls } = fakeFetch(() => 'network');
    await expect(generate({ ...base, fetchImpl: f })).rejects.toBeInstanceOf(GeminiError);
    expect(calls).toHaveLength(1);
  });
});

describe('testKey', () => {
  it('ok / bad-key / network, and treats "valid but out of quota" as ok', async () => {
    expect((await testKey(AQ_KEY, { fetchImpl: fakeFetch(() => okReply('OK')).f })).result).toBe('ok');
    expect((await testKey(AQ_KEY, { fetchImpl: fakeFetch(() => badKey).f })).result).toBe('bad-key');
    expect((await testKey(AQ_KEY, { fetchImpl: fakeFetch(() => 'network').f })).result).toBe('network');
    expect((await testKey(AQ_KEY, { fetchImpl: fakeFetch(() => quota).f })).result).toBe('ok');
  });
});

/* -------------------------------- Summary -------------------------------- */

describe('buildSummary', () => {
  const today = '2026-03-20';
  const empty: SummaryInput = {
    today,
    stepGoal: 8000,
    demo: false,
    cycle: null,
    trends: null,
    activity: null,
    sleep: null,
    heart: null,
    spo2: null,
    dayLogs: [],
  };

  it('says plainly when data is missing', () => {
    const s = buildSummary(empty);
    expect(s).toContain('Today: 2026-03-20.');
    expect(s).toContain('Cycle: no period data logged.');
    expect(s).toContain('Steps today: no data.');
    expect(s).toContain('SpO2: no reading');
    expect(s).not.toContain('DEMO');
  });

  it('summarises cycle, steps, sleep, heart and logs compactly, without notes', () => {
    const days = (start: string, n: number) =>
      Array.from({ length: n }, (_, i) => {
        const d = new Date(`${start}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + i);
        return d.toISOString().slice(0, 10);
      });
    const status = computeCycleStatus({ bleedingDays: [...days('2026-01-20', 5), ...days('2026-02-18', 5), ...days('2026-03-18', 3)], today });
    const trendDays = days('2026-02-19', 30);
    const s = buildSummary({
      ...empty,
      demo: true,
      cycle: {
        status: 'ok',
        data: { ...status, partialHistory: false, sourcedPeriods: [], loggedDays: [] },
        sources: ['bloom:log', 'org.iggymedia.periodtracker'],
      },
      trends: {
        status: 'ok',
        sources: [],
        data: {
          steps: trendDays.map((day, i) => ({ day, value: i % 2 ? 9000 : null })),
          sleepMin: trendDays.map((day) => ({ day, value: 420 })),
          restingHr: trendDays.map((day) => ({ day, value: null })),
          hrKind: 'readings',
        },
      },
      activity: {
        status: 'ok',
        sources: ['bloom:sensor'],
        data: { steps: 4000, stepSource: 'sensor', distanceKm: 2.88, distanceEstimated: true, activeKcal: null, totalKcal: null, exerciseMinutes: 0, exerciseSessions: 0 },
      },
      dayLogs: [
        { day: today, flow: 'medium', symptoms: ['cramps', 'back_pain'], moods: ['low'], note: 'PRIVATE NOTE' },
        { day: '2026-03-19', flow: null, symptoms: ['cramps'], moods: [], note: null },
      ],
    });
    expect(s).toContain('DEMO MODE');
    expect(s).toMatch(/Cycle \(estimates\): cycle day 3; phase Menstrual/);
    expect(s).toContain('Cycle source: Logged in Bloom + Flo.');
    expect(s).toContain('Steps today so far: 4000 (50% of goal), source Phone (while Bloom is open)');
    expect(s).toContain('(estimated from stride)');
    expect(s).not.toContain('kcal');
    expect(s).toContain('Steps 30 days: 15 days with data, average 9000');
    expect(s).toContain('goal met on 15 of 15 days');
    expect(s).toContain('average 7h00m asleep');
    expect(s).toContain('Heart rate 30 days: no data.');
    expect(s).toContain('Symptoms logged in 30 days (days): cramps 2, back pain 1.');
    expect(s).toContain("Today’s log: cramps, back pain, low.");
    expect(s).not.toContain('PRIVATE NOTE');
    expect(s.length).toBeLessThan(2500);
  });
});
