// Read-only compatibility at the scene boundary; never migrate projects on load.
export function readSpokenText(scene = {}, projectType = 'full-ai') {
  const fields = projectType === 'semi' ? ['Voiceover'] : ['Dialogue', 'Voiceover'];
  const present = fields.filter(field => Object.hasOwn(scene, field));
  const invalid = present.filter(field => typeof scene[field] !== 'string');
  if (invalid.length) {
    return { text: '', source: null, issue: 'INVALID_SPOKEN_TEXT',
      message: invalid.join(', ') + ' phải là chuỗi văn bản.' };
  }
  if (projectType !== 'semi' && present.length === 2 && scene.Dialogue !== scene.Voiceover) {
    return { text: '', source: null, issue: 'DIALOGUE_VOICEOVER_CONFLICT',
      message: 'Dialogue và Voiceover khác nhau. Hãy mở Sửa để chọn lời thoại cần giữ.' };
  }
  const source = present[0] || null;
  return { text: source ? scene[source] : '', source, issue: null, message: '' };
}

export function countSpokenWords(text) {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}

// Use only on an explicit text edit/resolution or when creating a NEW Full AI project.
export function writeFullDialogue(scene, text) {
  if (typeof text !== 'string') throw new TypeError('Dialogue phải là chuỗi văn bản.');
  const result = { ...scene, Dialogue: text, Word_count: countSpokenWords(text) };
  delete result.Voiceover;
  return result;
}

// Creation boundary only. Legacy reads and updateProjectProgress do not call this.
export function prepareNewProjectScenes(scenes, projectType) {
  return scenes.map(scene => {
    const spoken = readSpokenText(scene, projectType);
    if (spoken.issue) throw new Error('Scene ' + scene.scene_n + ': ' + spoken.message);
    return projectType === 'semi' ? { ...scene } : writeFullDialogue(scene, spoken.text);
  });
}
