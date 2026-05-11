type ClassValue = string | undefined | null | false | Record<string, boolean>;

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const i of inputs) {
    if (!i) continue;
    if (typeof i === "string") { out.push(i); continue; }
    for (const [k, v] of Object.entries(i)) if (v) out.push(k);
  }
  return out.join(" ");
}
