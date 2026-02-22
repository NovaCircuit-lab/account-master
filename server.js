// index.js
import http from "http";
import { WebSocketServer } from "ws";
import admin from "firebase-admin";
import { createClient } from "@supabase/supabase-js";

// ======= 讀取 Render Secret =======
if (!process.env.FIREBASE_ADMIN_KEY) throw new Error("FIREBASE_ADMIN_KEY 未設定");
if (!process.env.SUPABASE_URL) throw new Error("SUPABASE_URL 未設定");
if (!process.env.SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY 未設定");

const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY);

// ======= 初始化 Firebase Admin =======
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// ======= 初始化 Supabase Client =======
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ======= WebSocket 監聽 Port =======
const PORT = process.env.PORT || 8080;

// ======= HTTP Server (WebSocket 需要) =======
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Master Server WebSocket running");
});

// ======= 建立 WebSocket Server =======
const wss = new WebSocketServer({ server });

// ======= 可由前端修改的欄位（非付費） =======
const ALLOWED_FIELDS = ["nickname", "avatar", "settings", "level", "score"];

wss.on("connection", async (ws, req) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const idToken = url.searchParams.get("token");
    if (!idToken) throw new Error("缺少 Firebase ID Token");

    // ======= 驗證 Firebase ID Token =======
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    ws.userId = decodedToken.uid;
    console.log(`使用者 ${ws.userId} 已連線`);

    ws.send(JSON.stringify({ success: true, message: "登入成功", uid: ws.userId }));

    // ======= 處理訊息 =======
    ws.on("message", async (msg) => {
      try {
        const data = JSON.parse(msg);

        switch (data.action) {

          // -------- 更新遊戲資料 --------
          case "updateProjectData":
            if (!data.projectId || !data.payload) throw new Error("缺少 projectId 或 payload");

            // 過濾欄位
            const filteredPayload = {};
            for (let key of ALLOWED_FIELDS) {
              if (key in data.payload) filteredPayload[key] = data.payload[key];
            }

            // 更新 Supabase
            await supabase
              .from("project_player_data")
              .upsert({
                uid: ws.userId,
                project_id: data.projectId,
                data: filteredPayload
              }, { onConflict: ["uid", "project_id"] });

            ws.send(JSON.stringify({ success: true, message: "資料更新成功", payload: filteredPayload }));
            break;

          // -------- 兌換邀請碼 --------
          case "redeemInvite":
            if (!data.code) throw new Error("缺少邀請碼");

            const { data: inviteData, error } = await supabase
              .from("invite_codes")
              .select("*")
              .eq("code", data.code)
              .single();

            if (error || !inviteData) {
              ws.send(JSON.stringify({ success: false, message: "無效邀請碼" }));
              break;
            }

            if (inviteData.used_by) {
              ws.send(JSON.stringify({ success: false, message: "邀請碼已使用" }));
              break;
            }

            // 標記已使用
            await supabase
              .from("invite_codes")
              .update({ used_by: ws.userId })
              .eq("id", inviteData.id);

            // TODO: 設定 Plan / Circuit 幣等
            ws.send(JSON.stringify({ success: true, message: "邀請碼兌換成功", plan: inviteData.plan }));
            break;

          // -------- 發放 Circuit 幣 --------
          case "earnCircuit":
            if (!data.projectId || !data.amount || !data.source) throw new Error("缺少必要欄位");

            await supabase
              .from("circuit_ledger")
              .insert({
                uid: ws.userId,
                project_id: data.projectId,
                amount: data.amount,
                type: "earn",
                source: data.source,
                reference_id: data.reference_id || null
              });

            ws.send(JSON.stringify({ success: true, message: "Circuit 幣已發放", amount: data.amount }));
            break;

          default:
            ws.send(JSON.stringify({ success: false, message: "未知指令" }));
        }

      } catch (err) {
        ws.send(JSON.stringify({ success: false, message: err.message }));
      }
    });

  } catch (err) {
    console.log("連線驗證失敗:", err.message);
    ws.close();
  }
});

// ======= 啟動服務 =======
server.listen(PORT, () => console.log(`Master Server running on port ${PORT}`));
