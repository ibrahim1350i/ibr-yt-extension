// Sunucu bağlantısını kontrol eden popup.js (tokensiz)
document.addEventListener("DOMContentLoaded", () => {
  const statusDot = document.getElementById("statusDot");
  const statusMsg = document.getElementById("statusMsg");
  const refreshBtn = document.getElementById("refreshBtn");
  const tokenInput = document.getElementById("extTokenInput");
  const saveBtn = document.getElementById("saveTokenBtn");
  const tokenMsg = document.getElementById("tokenMsg");

  // Kayıtlı tokeni yükle
  chrome.storage.local.get(['extension_token'], (res) => {
    if (res.extension_token) {
      tokenInput.value = res.extension_token;
    }
  });

  saveBtn.addEventListener("click", () => {
    const val = tokenInput.value.trim();
    chrome.storage.local.set({ extension_token: val }, () => {
      tokenMsg.style.display = "block";
      tokenMsg.style.color = "#4caf50";
      tokenMsg.textContent = "Token kaydedildi!";
      setTimeout(() => { tokenMsg.style.display = "none"; }, 2000);
      checkConnection(); // Token kaydedildikten sonra tekrar kontrol et
    });
  });

  function checkConnection() {
    statusDot.className = "dot dot-warn";
    statusMsg.textContent = "Bağlanıyor...";

    fetch("http://127.0.0.1:48271/api/status")
      .then((res) => res.json())
      .then((data) => {
        if (data && data.ok) {
          statusDot.className = "dot dot-ok";
          statusMsg.textContent = "Uygulama Çalışıyor ✅";
        } else {
          throw new Error("Geçersiz yanıt");
        }
      })
      .catch(() => {
        statusDot.className = "dot dot-warn";
        statusMsg.textContent = "Uygulama Kapalı";
      });
  }

  refreshBtn.addEventListener("click", () => {
    checkConnection();
  });

  // Açılışta kontrol et
  checkConnection();
});
