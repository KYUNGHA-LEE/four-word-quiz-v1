// 임시 진단용 — Gemini 판정이 서버에서 작동하는지 확인 (확인 후 삭제할 것)
module.exports = async (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const info = {
    hasKey: Boolean(key),
    keyLength: key ? key.length : 0,
    keyLooksMasked: key ? /•/.test(key) : null,
    model,
  };
  if (!key) return res.status(200).json({ ...info, result: "키 없음" });

  const word = String((req.query && req.query.word) || "백년손님").slice(0, 20);
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + key;
  const prompt =
    '다음이 실제로 존재하고 자연스럽게 쓰이는 한국어 낱말(합성어·사자성어 포함)인지 판단하세요. ' +
    '맞으면 O, 아니면 X, 오직 한 글자로만 답하세요: "' + word + '"';
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 10, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    const bodyText = await resp.text();
    if (!resp.ok) {
      let detail = bodyText.slice(0, 300);
      try { detail = JSON.parse(bodyText).error; } catch (e) {}
      return res.status(200).json({ ...info, word, httpStatus: resp.status, apiError: detail });
    }
    const data = JSON.parse(bodyText);
    const text = ((((data.candidates || [])[0] || {}).content || {}).parts || [])
      .map((p) => p.text || "").join("").trim();
    return res.status(200).json({
      ...info,
      word,
      httpStatus: resp.status,
      aiAnswer: text,
      finishReason: ((data.candidates || [])[0] || {}).finishReason || null,
    });
  } catch (e) {
    return res.status(200).json({ ...info, word, fetchError: String((e && e.message) || e) });
  }
};
