import http from "http";
import { WebSocketServer } from "ws";
import admin from "firebase-admin";

// 1️⃣ 從 Render Secret 讀取 Firebase Admin Key
if (!process.env.FIREBASE_ADMIN_KEY) throw new Error("FIREBASE_ADMIN_KEY 未設定");
const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY);

// 2️⃣ 初始化 Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// 3️⃣ Render 提供的 PORT
const PORT = process.env.PORT || 8080;

// 4️⃣ 建 HTTP Server
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("WebSocket Server running");
});

// 5️⃣ 建立 WebSocket Server
const wss = new WebSocketServer({ server });

wss.on("connection", async (ws, req) => {
  try {
    // 從 URL 讀取 Firebase ID Token
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const idToken = url.searchParams.get("token");
    if (!idToken) throw new Error("缺少 Firebase ID Token");

    // 6️⃣ 驗證 ID Token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    ws.userId = decodedToken.uid; // 綁定 UID
    console.log(`使用者 ${ws.userId} 已連線`);

    ws.send(JSON.stringify({ success: true, message: "登入成功", uid: ws.userId }));

    // 7️⃣ 處理訊息
    ws.on("message", (msg) => {
      try {
        const data = JSON.parse(msg);

        if (data.action === "updateProfile" && data.uid === ws.userId) {
          console.log(`使用者 ${ws.userId} 更新資料:`, data.payload);

          // TODO: 連接你的資料庫，更新使用者資料
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

// 8️⃣ 監聽 Render 提供的 PORT
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
