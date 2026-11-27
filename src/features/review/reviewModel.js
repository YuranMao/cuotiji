export const INTERVALS = [1, 2, 4, 7, 15, 30];
export const WORD_LABELS = { 1: '拼写', 2: '用法', 4: '综合缩词', 7: '缩词' };
export const SUBJECTS = ['冲刺', '专业课', '单词', '政治', '长难句', '词组', '词谱'];

export function formatDate(value = new Date()) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function normalizeReviews(reviews = []) {
  return (reviews || []).map(review => typeof review === 'string'
    ? { day: parseInt(review, 10) || 0, date: review } : { ...review });
}

export function getEbbDynamicSchedule(item, rollOverdue = true, today = formatDate()) {
  const reviews = normalizeReviews(item.reviews);
  return INTERVALS.map((day, index) => {
    const previous = index > 0 ? reviews.find(review => review.day === INTERVALS[index - 1]) : null;
    const date = new Date(previous ? previous.date : item.first_date);
    date.setDate(date.getDate() + (previous ? day - INTERVALS[index - 1] : day));
    let scheduled = formatDate(date);
    if (rollOverdue && scheduled < today) scheduled = today;
    const review = reviews.find(entry => entry.day === day);
    return { day, scheduled, done: !!review, reviewDate: review?.date || null, reviewNote: review?.note || '' };
  });
}

export function sentenceTags(item) {
  return String(item.hint || '').split(/[,，、]/).map(tag => tag.trim()).filter(Boolean);
}

export function getSentenceSettings() {
  return {
    apiUrl: localStorage.getItem('sentence_api_url') || 'https://api.deepseek.com',
    apiKey: localStorage.getItem('sentence_api_key') || '',
    model: localStorage.getItem('sentence_model') || 'deepseek-v4-pro',
  };
}

export function parseSentenceJson(content) {
  const cleaned = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const analysis = JSON.parse(cleaned);
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) throw new Error('API 未返回有效的分析对象');
  delete analysis.relations;
  return analysis;
}

export const SENTENCE_PROMPT = '你是一名考研英语长难句教师。请严格只返回 JSON，不要 Markdown 代码块。JSON 格式为：{"translation":"参考译文","tags":["语法标签"],"structure":[{"text":"原文片段","role":"主句或从句或非谓语或核心谓语","explanation":"结构说明"}],"grammar_points":[{"name":"语法知识点","text":"对应原文片段","explanation":"完整学习要点，包括规则、判断方法、句中作用、常见考法和易错点"}]}。请准确拆分主句、各类从句、非谓语、核心谓语及重要修饰结构。用户提供的知识点归类标签是本句分析的重点范围：必须围绕每一个标签，找出原句中所有相关的语法现象，逐项列入 grammar_points；每个知识点都要引用对应原文片段，并完整说明语法规则、在本句中的结构作用、识别方法、常见考法和易错点。若一个标签涉及多个语法现象，必须分别列出，不要只给概括性结论；若标签与原句不完全匹配，应说明原句中实际对应的语法现象。可以补充理解整句所必需的其他语法点，但不要遗漏用户标签涉及的内容。tags 只返回用户提供的归类标签，不要擅自修改标签。没有内容时返回空数组或空字符串。';
