export const ugx = (n) => (n === null || n === undefined ? '-' : `${Number(n).toLocaleString('en-US')} UGX`);
export const pctText = (p) => (p === null || p === undefined ? '-' : `${p}%`);
export const mondayOf = (date) => {
  const d = new Date(`${date}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
};
