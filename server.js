import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import admin from "firebase-admin";

// 1️⃣ 從 Render Secret 讀取 Firebase Admin Key
const serviceAccountJSON = process.env.FIREBASE_ADMIN_KEY;
if (!serviceAccountJSON) {
  throw new Error("FIREBASE_ADMIN_KEY 未設定！");
}
const serviceAccount = JSON.parse(serviceAccountJSON);

// 2️⃣ 初始化 Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// 3️⃣ Render 提供的 PORT
const PORT = process.env.PORT || 8080;

// 4️⃣ 建立 HTTP Server（WebSocket 必須附在 HTTP Server 上）
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("WebSocket Server running");
});

// 5️⃣ 建立 WebSocket Server
const wss = new WebSocketServer({ server });

wss.on("connection", async (ws, req) => {
  try {
    // 從 URL 拿 Firebase ID Token
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const idToken = url.searchParams.get("token");
    if (!idToken) throw new Error("缺少 Firebase ID Token");

    // 6️⃣ 用 Admin SDK 驗證 Token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    ws.userId = decodedToken.uid; // 綁定使用者 UID
    console.log(`使用者 ${ws.userId} 已連線`);

    ws.send(JSON.stringify({ success: true, message: "登入成功", uid: ws.userId }));

    // 7️⃣ 處理訊息
    ws.on("message", (msg) => {
      try {
        const data = JSON.parse(msg);

        // 只允許修改自己的資料
        if (data.action === "updateProfile" && data.uid === ws.userId) {
          console.log(`使用者 ${ws.userId} 更新資料:`, data.payload);

          // TODO: 改成你資料庫更新邏輯
          // updateDatabase(ws.userId, data.payload);

          ws.send(JSON.stringify({ success: true, message: "更新成功" }));
        } else {
          ws.send(JSON.stringify({ success: false, message: "非法操作" }));
        }
      } catch {
        ws.send(JSON.stringify({ success: false, message: "訊息格式錯誤" }));
      }
    });

  } catch (err) {
    console.log("連線驗證失敗:", err.message);
    ws.close();
  }
});

// 8️⃣ HTTP Server 監聽 Render PORT
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
