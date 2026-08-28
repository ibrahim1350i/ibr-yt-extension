// Background Service Worker — API isteklerini content script adına yapar (CORS-free).

const API_BASE = "http://127.0.0.1:48271";
const API_URL  = `${API_BASE}/api/download`;

async function getApiToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['extension_token'], (res) => {
      resolve(res.extension_token || null);
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "SEND_TO_API") return false;

  (async () => {
    try {
      const extUrl = chrome.runtime.getURL('');
      const extOrigin = (new URL(extUrl)).origin;
      
      const token = await getApiToken();
      const headers = { 
        "Content-Type": "application/json",
        "X-Ext-Origin": extOrigin
      };
      if (token) headers["X-App-Token"] = token;

      const res = await fetch(API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          url: msg.url,
          mode: msg.mode || "auto"
        })
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        // Eğer 401 döndüyse büyük ihtimalle token yanlış veya lisans aktif değil
        if (res.status === 401) {
           sendResponse({ ok: false, error: "Token Hatalı veya Geçersiz Lisans!" });
           return;
        }
        sendResponse({ ok: false, error: data?.error || `http_${res.status}` });
      } else {
        sendResponse({ ok: true, mode: data?.mode || "auto" });
      }
    } catch (err) {
      console.error("API bağlantı hatası:", err);
      sendResponse({ ok: false, error: "connect_failed" });
    }
  })();

  return true; // async yanıt
});
