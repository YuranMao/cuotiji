function openCache() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('CuotijiCache', 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('cache')) request.result.createObjectStore('cache');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readQuestionCache() {
  let db;
  try {
    db = await openCache();
    const transaction = db.transaction('cache', 'readonly');
    const request = transaction.objectStore('cache').get('data');
    return await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch { return null; }
  finally { db?.close(); }
}

export async function saveQuestionCache(data) {
  let db;
  try {
    db = await openCache();
    const transaction = db.transaction('cache', 'readwrite');
    const store = transaction.objectStore('cache');
    const request = store.get('data');
    request.onsuccess = () => {
      store.put({ ...(request.result || {}), chapters: data.chapters, kps: data.knowledge_points, questions: data.questions, coreQuestions: data.core_questions, sources: data.sources, chapter_sources: data.chapter_sources }, 'data');
    };
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch { /* Cache availability must not block online data. */ }
  finally { db?.close(); }
}
