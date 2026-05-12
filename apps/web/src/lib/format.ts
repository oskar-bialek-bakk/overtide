export const hours = (n: number, frac = 1) => `${n.toFixed(frac)}h`;
export const dateShort = (iso: string) => new Date(iso).toLocaleDateString();
