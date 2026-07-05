// 학생 답안 채점 (서버에서만) — 정답 목록은 학생에게 절대 노출되지 않음
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}
const db = admin.database();

// 정답 비교용 정규화: 공백 제거 + 소문자
const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, "").toLowerCase();

// 목록에 없을 때 Gemini에게 "실제 한국어 낱말인지" 물어봄
// 반환: true(맞음) / false(아님) / null(키 없음·오류 → 판정 불가)
async function judgeWithGemini(word) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + key;
  const prompt =
    '다음이 실제로 존재하고 자연스럽게 쓰이는 한국어 낱말(합성어·사자성어 포함)인지 판단하세요. ' +
    '맞으면 O, 아니면 X, 오직 한 글자로만 답하세요: "' + word + '"';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // 2.5 모델은 thinking 이 토큰을 먹으므로 끔(thinkingBudget:0) + 출력 여유
        generationConfig: { temperature: 0, maxOutputTokens: 10, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const text = ((((data.candidates || [])[0] || {}).content || {}).parts || [])
      .map((p) => p.text || "").join("").trim();
    if (!text) return null;
    if (text.includes("O") && !text.includes("X")) return true;
    return false;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST만 허용됩니다." });
  try {
    const { roomCode, idToken, index, answer } = req.body || {};
    if (!roomCode || !idToken || index === undefined || answer === undefined) {
      return res.status(400).json({ error: "필수 값이 없습니다." });
    }

    // 1) 학생 신원 확인 (토큰 검증 → 남의 이름으로 제출 방지)
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;
    const idx = Number(index);

    // 2) 방 / 게임 상태 확인
    const roomSnap = await db.ref("rooms/" + roomCode).get();
    if (!roomSnap.exists()) return res.status(404).json({ error: "존재하지 않는 방입니다." });
    const room = roomSnap.val();
    if (room.gameStatus !== "playing") return res.status(409).json({ error: "지금은 제출할 수 없습니다." });
    if (room.currentIndex !== idx) return res.status(409).json({ error: "현재 문제가 아닙니다." });
    if (!room.players || !room.players[uid]) return res.status(409).json({ error: "먼저 입장해 주세요." });

    // 3) 이미 제출했는지 확인 (문제당 1번)
    const subRef = db.ref("submissions/" + roomCode + "/" + idx + "/" + uid);
    if ((await subRef.get()).exists()) {
      return res.status(409).json({ error: "이미 제출했습니다.", already: true });
    }

    // 4) 랜덤 순서(order)로 실제 문제 번호를 찾아 정답 목록 읽기 + 채점
    const order = room.order || [];
    const bankIndex = order[idx];
    if (bankIndex === undefined || bankIndex === null) {
      return res.status(409).json({ error: "문제를 찾을 수 없습니다." });
    }
    const ansSnap = await db.ref("questionBank/fourWordQuiz/questions/" + bankIndex + "/answers").get();
    const answers = ansSnap.exists() ? Object.values(ansSnap.val()) : [];
    const my = norm(answer);
    let correct = answers.some((a) => norm(a) === my);

    // 목록에 없으면 Gemini에게 실제 낱말인지 판정 요청 (하이브리드)
    // 같은 단어는 한 번만 물어보도록 판정 결과를 DB에 캐시해 무료 한도를 아낀다
    if (!correct) {
      const prefixSnap = await db.ref("questionBank/fourWordQuiz/questions/" + bankIndex + "/prefix").get();
      const prefix = prefixSnap.exists() ? String(prefixSnap.val()) : "";
      const fullWord = prefix + String(answer).replace(/\s+/g, "");
      const cacheKey = fullWord.replace(/[.#$\[\]\/]/g, "").slice(0, 50);
      const cacheRef = cacheKey ? db.ref("questionBank/fourWordQuiz/aiJudgments/" + cacheKey) : null;
      const cached = cacheRef ? (await cacheRef.get()).val() : null;
      if (cached === true || cached === false) {
        correct = cached;
      } else {
        const ai = await judgeWithGemini(fullWord);
        if (ai === true) correct = true;
        if (cacheRef && (ai === true || ai === false)) {
          try { await cacheRef.set(ai); } catch (e) {}
        }
      }
    }

    // 5) 제출 기록 + 점수 반영 (정답 +1 / 오답 0점, 감점 없음)
    await subRef.set({
      value: String(answer).slice(0, 50),
      correct,
      submittedAt: admin.database.ServerValue.TIMESTAMP,
    });
    const scoreRef = db.ref("rooms/" + roomCode + "/players/" + uid + "/score");
    if (correct) { await scoreRef.transaction((cur) => (cur || 0) + 1); }
    const newScore = (await scoreRef.get()).val() || 0;

    return res.status(200).json({ correct, score: newScore });
  } catch (e) {
    return res.status(500).json({ error: "서버 오류", detail: String((e && e.message) || e) });
  }
};
