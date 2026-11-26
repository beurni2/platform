/**
 * TEST-ONLY: a recording window onto the REAL workerd storage, for counting
 * what one request reads. The fund book's own class runs untouched; only the
 * `storage` it is handed is a pass-through Proxy that tallies each call and
 * how many values came back. `/__ops` reads the tally, `/__ops/reset` clears
 * it, and `/__raw` lets a test plant a row as an older or interrupted write
 * would have left it. Never bundled into the deployed Worker.
 */

export interface OpsTally {
  calls: Record<string, number>;
  valuesRead: number;
  lists: Array<{ prefix: string | null; returned: number }>;
}

function freshTally(): OpsTally {
  return { calls: {}, valuesRead: 0, lists: [] };
}

function recording(target: Record<string, unknown>, tally: OpsTally, label: string): unknown {
  return new Proxy(target, {
    get(t, prop) {
      const v = Reflect.get(t, prop, t);
      if (typeof v !== 'function') return v;
      const name = String(prop);
      return async (...args: unknown[]) => {
        tally.calls[`${label}${name}`] = (tally.calls[`${label}${name}`] ?? 0) + 1;
        if (name === 'transaction') {
          const fn = args[0] as (txn: unknown) => Promise<unknown>;
          return (v as (f: (txn: unknown) => Promise<unknown>) => Promise<unknown>).call(t, (txn: unknown) =>
            fn(recording(txn as Record<string, unknown>, tally, 'txn.')),
          );
        }
        const out = await (v as (...a: unknown[]) => Promise<unknown>).apply(t, args);
        if (name === 'get') {
          if (out instanceof Map) tally.valuesRead += out.size;
          else if (out !== undefined) tally.valuesRead += 1;
        }
        if (name === 'list' && out instanceof Map) {
          tally.valuesRead += out.size;
          const opts = (args[0] ?? {}) as { prefix?: string };
          tally.lists.push({ prefix: opts.prefix ?? null, returned: out.size });
        }
        return out;
      };
    },
  });
}

type BookClass = new (state: DurableObjectState, ...rest: unknown[]) => { fetch(r: Request): Promise<Response> };

export function countingClass<T extends BookClass>(Base: T): T {
  return class FondsDO extends (Base as BookClass) {
    private readonly raw: DurableObjectStorage;
    private tally: OpsTally;
    constructor(state: DurableObjectState, ...rest: unknown[]) {
      const tally = freshTally();
      const storage = recording(state.storage as unknown as Record<string, unknown>, tally, '');
      super(new Proxy(state, { get: (t, p) => (p === 'storage' ? storage : Reflect.get(t, p, t)) }), ...rest);
      this.raw = state.storage;
      this.tally = tally;
    }

    override async fetch(request: Request): Promise<Response> {
      const path = new URL(request.url).pathname;
      if (path === '/__ops') return Response.json(this.tally);
      if (path === '/__ops/reset') {
        const fresh = freshTally();
        this.tally.calls = fresh.calls;
        this.tally.valuesRead = 0;
        this.tally.lists = fresh.lists;
        return Response.json({ ok: true });
      }
      if (path === '/__raw') {
        const { op, key, value, prefix } = (await request.json()) as {
          op: 'get' | 'put' | 'list';
          key?: string;
          value?: unknown;
          prefix?: string;
        };
        if (op === 'put') await this.raw.put(key as string, value);
        if (op === 'get') return Response.json({ value: (await this.raw.get(key as string)) ?? null });
        if (op === 'list') return Response.json({ rows: Object.fromEntries(await this.raw.list({ prefix: prefix ?? '' })) });
        return Response.json({ ok: true });
      }
      return super.fetch(request);
    }
  } as unknown as T;
}
