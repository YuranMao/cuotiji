export const SUBJECTS = ['数学', '专业课', '英语', '政治'];
export const GOAL_SUBJECTS = ['数学', '英语', '专业课', '政治'];
export const COLORS = { 数学: '#4a90d9', 专业课: '#27ae60', 英语: '#e67e22', 政治: '#9b59b6' };
export const GRADIENTS = {
  数学: 'linear-gradient(90deg, #7bb3f0, #3a7bc8)',
  专业课: 'linear-gradient(90deg, #5dd39e, #219a52)',
  英语: 'linear-gradient(90deg, #f0a04b, #d35400)',
  政治: 'linear-gradient(90deg, #c39bd3, #8e44ad)',
};
export const MATH_TAGS = {
  '36讲': '#60a5fa', 没咋了强化: '#60a5fa', 线代三轮复习: '#4e94f8',
  高数专题课: '#4e94f8', '660': '#3b82f6', '1000b': '#1d4ed8', '880': '#1e3a8a',
};
export const IMPORTANT_DATES = [
  { date: '2026-12-19', label: '考研初试', color: '#e74c3c' },
  { date: '2026-10-10', label: '正式报名', color: '#e67e22' },
  { date: '2026-09-24', label: '预报名', color: '#3498db' },
  { date: '2026-11-01', label: '网上确认', color: '#9b59b6' },
];
export const MONTHS = [
  { month: '7月', monthNum: 7, days: 31, weekStart: 3, weekCount: 4 },
  { month: '8月', monthNum: 8, days: 31, weekStart: 7, weekCount: 4 },
  { month: '9月', monthNum: 9, days: 30, weekStart: 11, weekCount: 5 },
  { month: '10月', monthNum: 10, days: 31, weekStart: 16, weekCount: 4 },
  { month: '11月', monthNum: 11, days: 30, weekStart: 20, weekCount: 4 },
  { month: '12月', monthNum: 12, days: 31, weekStart: 24, weekCount: 3 },
];
const withWeeks = goal => ({ goal, weeks: { 1: '', 2: '', 3: '', 4: '' } });
const emptyGoal = () => ({ goal: '', weeks: {} });
export const DEFAULT_GOALS = [
  { month: '7月', monthNum: 7, days: 31, subjects: {
    专业课: withWeeks('第二轮教材+第一轮背诵'),
    数学: { goal: '结束线代强化并开高数的头', weeks: { 1: '', 2: '', 3: '', 4: '', 5: '二次型复习加函数数列极限' } },
    英语: withWeeks('开始背考研核心词和刷阅读真题'), 政治: withWeeks('过第一轮马原和新思想'),
  } },
  { month: '8月', monthNum: 8, days: 31, subjects: {
    专业课: withWeeks('第二轮教材+第一轮背诵'), 数学: withWeeks('争取结束高数强化'), 英语: emptyGoal(), 政治: emptyGoal(),
  } },
  { month: '9月', monthNum: 9, days: 30, subjects: {
    专业课: emptyGoal(), 数学: withWeeks('过渡真题+李范全书？'), 英语: emptyGoal(), 政治: emptyGoal(),
  } },
  { month: '10月', monthNum: 10, days: 31, subjects: {
    专业课: withWeeks('刷真题'), 数学: emptyGoal(), 英语: emptyGoal(), 政治: emptyGoal(),
  } },
  { month: '11月', monthNum: 11, days: 30, subjects: {
    专业课: withWeeks('模考'), 数学: emptyGoal(), 英语: emptyGoal(), 政治: emptyGoal(),
  } },
  { month: '12月', monthNum: 12, days: 31, subjects: {
    专业课: emptyGoal(), 数学: emptyGoal(), 英语: emptyGoal(), 政治: emptyGoal(),
  } },
];
export const cloneGoals = data => JSON.parse(JSON.stringify(data));
export function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export const parseDate = value => new Date(`${value}T00:00:00`);
export function addDays(value, count) {
  const date = parseDate(value);
  date.setDate(date.getDate() + count);
  return formatDate(date);
}
export function dayDiff(start, end) {
  const a = parseDate(start), b = parseDate(end);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}
export function initialRange(before, after) {
  const today = formatDate(new Date());
  return { start: addDays(today, -before), end: addDays(today, after) };
}
export const rangeDates = range => Array.from({ length: Math.max(0, dayDiff(range.start, range.end) + 1) }, (_, i) => addDays(range.start, i));
export const globalWeek = date => Math.floor(dayDiff('2026-06-21', date) / 7) + 1;
export function scheduleColor(record) {
  if (record.subject === '数学') {
    const tag = Object.keys(MATH_TAGS).find(key => record.label === key || record.label?.startsWith(`${key}：`));
    if (tag) return MATH_TAGS[tag];
  }
  return GRADIENTS[record.subject] || '#888';
}
export function eventLanes(events, range) {
  const count = dayDiff(range.start, range.end) + 1;
  const placed = [];
  events.forEach(event => {
    const start = dayDiff(range.start, event.start_date), end = dayDiff(range.start, event.end_date);
    if (end < 0 || start >= count) return;
    let lane = 0;
    while (placed.some(other => other.lane === lane && !(end < other.start || start > other.end))) lane++;
    placed.push({ event, start, end, lane });
  });
  return placed;
}
