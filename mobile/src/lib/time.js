// Kampala is UTC+3 all year, so plain arithmetic is enough (no Intl needed on the phone).
const H3 = 3 * 3600e3;
export const kampalaDate = (iso) => new Date(new Date(iso).getTime() + H3).toISOString().slice(0, 10);
export const kampalaTime = (iso) => (iso ? new Date(new Date(iso).getTime() + H3).toISOString().slice(11, 16) : '-');
export const kampalaDay = (iso) => {
  const d = new Date(new Date(iso).getTime() + H3);
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`;
};
