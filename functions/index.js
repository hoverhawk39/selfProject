const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenAI } = require("@google/genai");
admin.initializeApp();
const db = admin.firestore();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

exports.analyzeWishes = functions.https.onRequest(async (req, res) => {
    // CORS 設定 (允許 Vanilla JS fetch 存取)
    res.set("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") {
        res.set("Access-Control-Allow-Methods", "POST");
        res.set("Access-Control-Allow-Headers", "Content-Type");
        res.status(204).send("");
        return;
    }
    try {
        // 撈取最新 50 筆願望
        const snapshot = await db.collection("wishes")
            .orderBy("createdAt", "desc")
            .limit(50)
            .get();
        if (snapshot.empty) {
            return res.json({ result: "目前許願池中還沒有資料可供分析喔！" });
        }
        const wishList = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.content) wishList.push(data.content);
        });

        // 讀取前端傳來的使用者提問角度 (例如：類別與預算 / 品牌偏好 / 商業機會)
        // 若沒有帶 prompt 或格式不對，就用預設的綜合分析角度，避免報錯
        const rawUserPrompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
        // 簡單長度限制，避免有人塞超長文字進來浪費 token 或做 prompt injection
        const userFocus = rawUserPrompt.slice(0, 200) || "請針對整體願望池數據做綜合趨勢分析";

        const prompt = `
你是一位專業的數據洞察與願望分析專家。請分析以下來自「許願池」的願望清單，並為使用者撰寫一份 500 字以內的簡短分析報告。

使用者這次特別想了解的角度是：「${userFocus}」
請你的分析內容盡量緊扣這個角度來回答，而不是每次都給一模一樣的泛用分析。

報告結構要求：
1. 【核心趨勢】：針對使用者關心的角度，總結最相關的前 2~3 個主題方向。
2. 【亮點觀察】：挑選 1~2 個與此角度相關、特別有趣或具創意的許願內容。
3. 【結語與建議】：給予一段溫暖、具鼓勵性質的總結。

注意事項：
- 總字數嚴格控制在 300 ~ 500 字之間。
- 請勿使用簡體字。
- 語氣親切、專業且具洞察力。
- 若使用者想了解的角度與願望清單內容關聯不大，仍請盡力連結，並誠實說明目前數據較無法完整回答此角度。

願望清單如下：
- ${wishList.join("\n- ")}
    `;

        // 呼叫 Gemini API
        const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
        });
        console.log("success! !");
        return res.status(200).json({ result: response.text });
    } catch (error) {
        console.error("AI 分析錯誤:", error);
        return res.status(500).json({ error: "系統發生錯誤，無法完成分析。" });
    }
});
