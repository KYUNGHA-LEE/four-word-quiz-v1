// 강사 비밀번호 확인 + 방 생성 + hostUid 최초 등록 (서버에서만 처리)
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

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST만 허용됩니다." });
  try {
    const { password, idToken } = req.body || {};
    if (!password || !idToken) return res.status(400).json({ error: "필수 값이 없습니다." });

    // 1) 비밀번호 확인 (환경변수와 비교)
    if (password !== process.env.TEACHER_PASSWORD) {
      return res.status(401).json({ error: "비밀번호가 틀렸습니다." });
    }

    // 2) 강사 uid 확인 (토큰 검증 → 위조 방지)
    const decoded = await admin.auth().verifyIdToken(idToken);
    const hostUid = decoded.uid;

    // 3) 등록된 문제 수 확인
    let total = 0;
    const countSnap = await db.ref("questionBank/fourWordQuiz/count").get();
    if (countSnap.exists()) total = Number(countSnap.val());
    if (!total) {
      const qSnap = await db.ref("questionBank/fourWordQuiz/questions").get();
      total = qSnap.exists() ? Object.keys(qSnap.val()).length : 0;
    }
    if (!total) return res.status(400).json({ error: "등록된 문제가 없습니다. Firebase에 문제를 먼저 넣어주세요." });

    // 4) 겹치지 않는 4자리 방 코드 생성
    let roomCode = null;
    for (let i = 0; i < 12; i++) {
      const c = String(Math.floor(1000 + Math.random() * 9000));
      const ex = await db.ref("rooms/" + c).get();
      if (!ex.exists()) { roomCode = c; break; }
    }
    if (!roomCode) return res.status(500).json({ error: "방 코드 생성에 실패했습니다. 다시 시도해 주세요." });

    // 5) 방 생성 + hostUid 등록 (서버에서만)
    await db.ref("rooms/" + roomCode).set({
      hostUid,
      gameType: "fourWordQuiz",
      gameStatus: "waiting",
      currentIndex: -1,
      totalQuestions: total,
      createdAt: admin.database.ServerValue.TIMESTAMP,
    });

    return res.status(200).json({ roomCode, totalQuestions: total });
  } catch (e) {
    return res.status(500).json({ error: "서버 오류", detail: String((e && e.message) || e) });
  }
};
