export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageDataUrl, model = 'gpt-4o-mini', retry = false } = req.body || {};
    if (!imageDataUrl) return res.status(400).json({ error: 'imageDataUrl is required' });
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY is missing' });

    const system = [
      '너는 대한민국 초등 수학 선생님. 사진 속 문제를 읽고, 단계별로 간결하게 풀이한 뒤 마지막 줄에 정답을 한 번만 제시한다.',
      '[Odd-One-Out]은 단순 규칙(짝/홀, 배수, 자릿수, 등차/등비)을 우선 적용하고 각 행별로 유일 규칙을 채택한다.',
      '[격자/채우기]는 격자 크기, 시작/끝, 진행 방향을 먼저 확정 후 규칙을 설명하고 채운다.',
      '출력 형식(최소 5줄): 1) 문제 핵심 2) 규칙/식 3) 계산/결론  마지막 줄: "정답: ○○"',
      retry ? '이전 풀이가 의심스럽다. 더 단순 규칙과 반례 검증을 우선하라.' : ''
    ].filter(Boolean).join('\n');

    const temperature = retry ? 0.35 : 0.1;

    const payload = {
      model,
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: [
            { type: 'text', text: '이 사진의 수학 문제를 위 형식으로 풀이하고, 마지막 줄에 정답을 한 번만 제시하세요.' },
            { type: 'image_url', image_url: { url: imageDataUrl } }
        ]}
      ]
    };

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ error: 'OpenAI error', detail: t });
    }

    const data = await r.json();
    const answer = data?.choices?.[0]?.message?.content || '(빈 응답)';
    return res.status(200).json({ answer });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
