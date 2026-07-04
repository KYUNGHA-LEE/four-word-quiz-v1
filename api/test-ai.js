// 임시 진단용 엔드포인트: Gemini 판정이 작동하는지 확인.
// 사용법: 배포 주소 + /api/test-ai?word=양념통닭
// 확인이 끝나면 이 파일은 삭제하는 것을 권장합니다.
module.exports = async (req, res) => {
  const word = (req.query && req.query.word) ? String(req.query.word) : "양념통닭";
  const key = process.env.GEMINI_API_KEY;
  // 주소에 ?model=... 를 주면 그 모델로 테스트 (여러 모델 비교용)
  const model = (req.query && req.query.model) ? String(req.query.model) : (process.env.GEMINI_MODEL || "gemini-2.5-flash");

  if (!key) {
    return res.status(200).json({ ok: false, hasKey: false, reason: "GEMINI_API_KEY 환경변수가 없습니다. Vercel에 등록 후 Redeploy 하세요." });
  }

  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + key;
  const prompt =
    '다음이 실제로 존재하고 자연스럽게 쓰이는 한국어 낱말(합성어·사자성어 포함)인지 판단하세요. ' +
    '맞으면 O, 아니면 X, 오직 한 글자로만 답하세요: "' + word + '"';

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 10, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    const httpStatus = r.status;
    const data = await r.json().catch(() => null);
    let verdict = "";
    try {
      verdict = data.candidates[0].content.parts.map((p) => p.text || "").join("").trim();
    } catch (e) {}
    return res.status(200).json({
      ok: r.ok,
      hasKey: true,
      keyPreview: key.slice(0, 6) + "...",
      model,
      word,
      httpStatus,
      verdict,
      raw: data,
    });
  } catch (e) {
    return res.status(200).json({ ok: false, hasKey: true, model, word, error: String((e && e.message) || e) });
  }
};
