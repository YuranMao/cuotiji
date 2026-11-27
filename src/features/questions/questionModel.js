export const ordered = items => [...items].sort((a, b) => (a.sort_order || a.id) - (b.sort_order || b.id));
export const utcDate = () => new Date().toISOString().slice(0, 10);
export function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function mastery(question) {
  const log = question.review_log || [];
  let streak = 0;
  for (let i = log.length - 1; i >= 0 && log[i].result === 'correct'; i--) streak++;
  const correct = question.correct_count || 0;
  const wrong = question.wrong_count || 0;
  return { streak, correct, wrong, mastered: streak >= 5, reviewed: log.length > 0 || correct + wrong > 0 };
}
export function aggregate(questions) {
  const stats = { total: questions.length, mastered: 0, reviewing: 0, unreviewed: 0, correct: 0, wrong: 0 };
  questions.forEach(q => {
    const m = mastery(q);
    stats.correct += m.correct;
    stats.wrong += m.wrong;
    stats[m.mastered ? 'mastered' : m.reviewed ? 'reviewing' : 'unreviewed']++;
  });
  stats.pending = stats.total - stats.mastered;
  stats.attempts = stats.correct + stats.wrong;
  stats.rate = stats.attempts ? Math.round(stats.correct / stats.attempts * 100) : null;
  return stats;
}
export function questionToCorePayload(q, chapterId) {
  return { chapter_id: chapterId, image_data: q.image_data, answer: q.answer || '', answer_image: q.answer_image || '', tag: q.note || '', note: '', sort_order: 0, correct_count: q.correct_count || 0, wrong_count: q.wrong_count || 0, review_log: q.review_log || [] };
}
export function coreToQuestionPayload(q, kpId) {
  return { knowledge_point_id: kpId, image_data: q.image_data, answer: q.answer || '', answer_image: q.answer_image || '', note: q.tag || '', first_upload_date: localDate(), file_name: q.name || '', sort_order: 0, correct_count: q.correct_count || 0, wrong_count: q.wrong_count || 0, review_log: q.review_log || [] };
}
export const normalizeNote = note => String(note || '').replace(/\\begin\{tabular\}(\{[^\n]*\})/g, '\\begin{array}$1').replace(/\\end\{tabular\}/g, '\\end{array}').replace(/\\(?:toprule|midrule|bottomrule)/g, '\\hline');
