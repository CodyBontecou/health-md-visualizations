const billion = BigInt(1000000000);

function offsetSeconds(value: unknown): number | null {
 if (value === 'Z') return 0;
 if (typeof value !== 'string') return null;
 const match = /^([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
 if (!match) return null;
 const hour=Number(match[2]), minute=Number(match[3]), second=Number(match[4] ?? 0);
 if (hour>18 || minute>59 || second>59 || (hour===18 && (minute!==0 || second!==0))) return null;
 return (match[1]==='-' ? -1 : 1) * (hour*3600+minute*60+second);
}
function isoInstant(value: unknown): {instant: bigint; offset: string} | null {
 if (typeof value !== 'string') return null;
 // OffsetDateTime omits zero seconds, whereas canonical UTC public clocks retain them.
 const match=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2}(?::\d{2})?)$/.exec(value);
 if (!match) return null;
 const whole=`${match[1]}:${match[2] ?? '00'}`, offset=offsetSeconds(match[4]);
 const milliseconds=Date.parse(`${whole}Z`);
 if (offset===null || !Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0,19)!==whole) return null;
 return {instant:BigInt(milliseconds)*BigInt(1000000)+BigInt((match[3] ?? '').padEnd(9,'0'))-BigInt(offset)*billion,offset:match[4]};
}
/** Canonical public UTC instants, without truncating fractional source seconds. */
export function canonicalSourceInstant(value: unknown): bigint | null {
 if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)) return null;
 return isoInstant(value)?.instant ?? null;
}
/** An optional native exact clock must agree in epoch, ISO instant and supplied/absent offset. */
export function exactSourceClockAgrees(timestamp: unknown, exact: unknown): boolean {
 const instant=canonicalSourceInstant(timestamp);
 if (instant===null) return false;
 if (exact===undefined) return true;
 if (exact===null || typeof exact!=='object' || Array.isArray(exact)) return false;
 const source=exact as Record<string, unknown>, {epochSecond,nano,offset}=source;
 if (typeof epochSecond!=='number' || !Number.isSafeInteger(epochSecond) || typeof nano!=='number' || !Number.isInteger(nano) || nano<0 || nano>=1e9) return false;
 const iso=isoInstant(source.iso8601);
 if (!iso || iso.instant!==instant || BigInt(epochSecond)*billion+BigInt(nano)!==instant) return false;
 if (offset===null) return iso.offset==='Z';
 const supplied=offsetSeconds(offset);
 return supplied!==null && supplied===offsetSeconds(iso.offset);
}
