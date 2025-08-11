export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { mode, problem, imageDataUrl, notes, style='korean', hint='none', seed=0 } = req.body || {};
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY is missing' });

  const system = [
    'You are an expert Korean math tutor for K-12 and competition math.',
    'Policy: Do NOT ask questions first. Solve directly.',
    'Output order: 1) 정답만 한 줄 2) 풀이 단계',
    'When uncertain or information is missing, clearly say: "추가 정보가 필요합니다:" and specify exactly what.',
    'Always check arithmetic carefully. Keep units and constraints consistent.',
    'Also provide a self-rated confidence between 0 and 1 as JSON metadata at the end: CONFIDENCE: {"value": number}.',
  ].join('\n');

  const styleInst = style === 'english'
    ? 'Answer in English. Start with **Answer:** then **Steps:**'
    : (style === 'korean_brief' ? '한국어로 간결하게. **정답:** 한 줄 → **핵심 풀이:** 3~6단계.' : '한국어로 자세하게. **정답:** 한 줄 → **풀이:** 단계별.');

  const hintInst = hint === 'guided'
    ? '풀이에 각 단계마다 작은 힌트를 괄호로 덧붙여라.'
    : (hint === 'light' ? '풀이 끝에 한 줄 힌트를 덧붙여라.' : '힌트는 포함하지 마라.');

  const userText = [
    mode === 'text' ? `문제: ${problem}` : '문제: [이미지 업로드됨]',
    notes ? `부연 설명: ${notes}` : null,
    `재현성 seed: ${seed}`,
    styleInst,
    hintInst,
  ].filter(Boolean).join('\n');

  // 메시지 구성 (이미지 있으면 vision 메시지로 전달)
  const content = mode === 'image' && imageDataUrl ? [
    { type: 'text', text: userText },
    { type: 'image_url', image_url: { url: imageDataUrl } },
  ] : [ { type: 'text', text: userText } ];

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        top_p: 0.9,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content }
        ]
      })
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ error: 'OpenAI error', detail: t });
    }

    const data = await r.json();
    let text = data?.choices?.[0]?.message?.content || '';

    // CONFIDENCE 추출 (형식: CONFIDENCE: {"value": 0.87})
    let confidence = null;
    const m = text.match(/CONFIDENCE:\s*\{\"value\":\s*(0?\.\d+|1(?:\.0)?)\s*\}/i);
    if (m) {
      confidence = Number(m[1]);
      text = text.replace(/CONFIDENCE:[\s\S]*$/i, '').trim();
    }

    return res.status(200).json({ answer: text, confidence });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
