/**
 * The protection service's log line: one JSON object per line on stdout, kept
 * by Workers Logs (wrangler.toml `[observability]`). The caller chooses the
 * fields; this file only gives every line the same frame, so one query reads
 * every line the same way.
 */

export type Level = 'info' | 'warn' | 'error';

const SERVICE = 'protection-service';

export function writeLine(
  level: Level,
  correlationId: string,
  msg: string,
  fields: Readonly<Record<string, string | number>>,
): void {
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), level, correlation_id: correlationId, service: SERVICE, msg, ...fields }),
  );
}
