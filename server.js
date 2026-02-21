import WebSocket, { WebSocketServer } from "ws";
import admin from "firebase-admin";

// 1️⃣ 從環境變數讀取 Admin Key
// Render 的 Secret 會在 process.env 裡
const serviceAccountJSON = process.env.FIREBASE_ADMIN_KEY;
if (!serviceAccountJSON) {
  throw new Error("FIREBASE_ADMIN_KEY 未設定！");
}
const serviceAccount = JSON.parse(serviceAccountJSON);

// 2️⃣ 初始化 Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// 3️⃣ 建立 WebSocket Server
const wss = new WebSocketServer({ port: process.env.PORT || 8080 });
console.log(`WebSocket 伺服器啟動在 ws://localhost:${process.env.PORT || 8080}`);

wss.on("connection", async (ws, req) => {
  try {
    // 從 URL 拿 token
    const url = new URL(req.url, "https://dummy.com");
    const idToken = url.searchParams.get("token");
    if (!idToken) throw new Error("缺少 Firebase ID Token");

    // 4️⃣ 驗證 Firebase ID Token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    ws.userId = decodedToken.uid; // UID 綁定連線
    console.log(`使用者 ${ws.userId} 已連線`);

    ws.send(JSON.stringify({ success: true, message: "登入成功", uid: ws.userId }));

    // 5️⃣ 處理訊息
    ws.on("message", (msg) => {
      try {
        const data = JSON.parse(msg);

        // 只允許修改自己的資料
        if (data.action === "updateProfile" && data.uid === ws.userId) {
          console.log(`使用者 ${ws.userId} 更新資料:`, data.payload);

          // TODO: 改成你資料庫的更新邏輯
          // updateDatabase(ws.userId, data.payload);

          ws.send(JSON.stringify({ success: true, message: "更新成功" }));
        } else {
          ws.send(JSON.stringify({ success: false, message: "非法操作" }));
        }
      } catch (err) {
        ws.send(JSON.stringify({ success: false, message: "訊息格式錯誤" }));
      }
    });

  } catch (err) {
    console.log("連線驗證失敗:", err.message);
    ws.close();
  }
});
