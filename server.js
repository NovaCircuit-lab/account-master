import http from "http";
import { WebSocketServer } from "ws";
import admin from "firebase-admin";

/* =========================
   1️⃣ Firebase 初始化
========================= */

if (!process.env.FIREBASE_ADMIN_KEY)
  throw new Error("FIREBASE_ADMIN_KEY 未設定");

const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/* =========================
   2️⃣ Render PORT
========================= */

const PORT = process.env.PORT || 8080;

/* =========================
   3️⃣ HTTP Server
========================= */

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("WebSocket Server running");
});

/* =========================
   4️⃣ WebSocket Server
========================= */

const wss = new WebSocketServer({ server });

wss.on("connection", async (ws, req) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const idToken = url.searchParams.get("token");
    if (!idToken) throw new Error("缺少 Firebase ID Token");

    // 驗證 Token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    ws.userId = uid;

    console.log(`使用者 ${uid} 已連線`);

    /* =========================
       5️⃣ 建立初始資料（如果不存在）
    ========================= */

    const userRef = db.collection("users").doc(uid);
    const doc = await userRef.get();

    if (!doc.exists) {
      await userRef.set({
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        nickname: "新玩家",
        role: "player",
        level: 1,
        exp: 0,
        money: 1000
      });
      console.log("已建立初始資料");
    }

    ws.send(JSON.stringify({
      success: true,
      message: "登入成功",
      uid
    }));

    /* =========================
       6️⃣ 處理前端訊息
    ========================= */

    ws.on("message", async (msg) => {
      try {
        const data = JSON.parse(msg);

        /* ===== 取得自己的資料 ===== */
        if (data.action === "getProfile") {
          const userDoc = await userRef.get();
          ws.send(JSON.stringify({
            success: true,
            profile: userDoc.data()
          }));
        }

        /* ===== 更新自己的資料 ===== */
        else if (data.action === "updateProfile") {

          // 防止修改其他人資料
          if (data.uid !== uid) {
            ws.send(JSON.stringify({
              success: false,
              message: "非法操作"
            }));
            return;
          }

          // 可限制可修改欄位（避免亂改）
          const allowedFields = ["nickname"];
          const updateData = {};

          for (const key of allowedFields) {
            if (data.payload[key] !== undefined) {
              updateData[key] = data.payload[key];
            }
          }

          await userRef.update(updateData);

          ws.send(JSON.stringify({
            success: true,
            message: "更新成功"
          }));
        }

        else {
          ws.send(JSON.stringify({
            success: false,
            message: "未知指令"
          }));
        }

      } catch (err) {
        ws.send(JSON.stringify({
          success: false,
          message: "訊息格式錯誤"
        }));
      }
    });

  } catch (err) {
    console.log("連線驗證失敗:", err.message);
    ws.close();
  }
});

/* =========================
   7️⃣ 啟動伺服器
========================= */

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
