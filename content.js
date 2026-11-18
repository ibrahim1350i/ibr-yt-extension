(() => {
  const BTN_CLASS_BASE = "ibrdl-btn";
  const TOAST_CLASS = "ibrdl-toast";
  const ICON_SVG = `<svg class="ibrdl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>`;

  function absUrl(href) {
    if (!href) return null;
    try {
      return new URL(href, location.origin).toString();
    } catch {
      return null;
    }
  }

  function isTikTokHostUrl(rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      return parsed.hostname.toLowerCase().includes("tiktok.com");
    } catch {
      return false;
    }
  }

  function isTikTokVideoUrl(rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      const host = parsed.hostname.toLowerCase();
      if (!host.includes("tiktok.com")) return false;
      const path = (parsed.pathname || "").toLowerCase();
      return path.includes("/video/") || path.includes("/photo/") || path.startsWith("/t/");
    } catch {
      return false;
    }
  }

  function normalizeDownloadUrl(rawUrl) {
    const absolute = absUrl(rawUrl) || rawUrl || "";
    if (!absolute) {
      if (window.location.href.includes("tiktok.com")) {
        const detectedFromPage = findTikTokVideoUrl();
        if (detectedFromPage && isTikTokVideoUrl(detectedFromPage)) return detectedFromPage;
      }
      return "";
    }
    if (!isTikTokHostUrl(absolute)) return absolute;
    if (isTikTokVideoUrl(absolute)) return absolute;

    const detected = findTikTokVideoUrl();
    if (detected && isTikTokVideoUrl(detected)) return detected;
    return "";
  }

  function showToast(msg) {
    let t = document.querySelector(`.${TOAST_CLASS}`);
    if (!t) {
      t = document.createElement("div");
      t.className = TOAST_CLASS;
      document.documentElement.appendChild(t);
    }
    t.textContent = msg;
    clearTimeout(t._hideTimer);
    t.style.display = "block";
    t._hideTimer = setTimeout(() => { t.style.display = "none"; }, 2500);
  }

  function fetchViaWorker(url, mode) {
    return new Promise((resolve) => {
      // The desktop app may need a few seconds to wake up; don't report a
      // failed connection while its service worker request is still in flight.
      const timeout = setTimeout(() => resolve({ ok: false, error: "timeout" }), 15000);
      try {
        chrome.runtime.sendMessage({ type: "SEND_TO_API", url, mode }, (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError || !response) {
            resolve({ ok: false, error: chrome.runtime.lastError?.message || "worker_no_response" });
          } else {
            resolve(response);
          }
        });
      } catch {
        clearTimeout(timeout);
        resolve({ ok: false, error: "no_worker" });
      }
    });
  }

  async function sendToLocalApi(url, mode = "auto") {
    let result = await fetchViaWorker(url, mode);
    return result;
  }
  // Buton oluşturma
  function buildButton(getVideoUrl, type = "default") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `${BTN_CLASS_BASE} ${type === "shorts" ? "ibrdl-btn--shorts" : type === "thumb" ? "ibrdl-btn--thumb" : type === "insta" ? "ibrdl-btn--insta" : ""}`;
    btn.title = "İndir";
    btn.setAttribute("aria-label", "İndir");
    btn.innerHTML = ICON_SVG;

    if (type === "default") {
      const span = document.createElement("span");
      span.textContent = "İndir";
      btn.appendChild(span);
    }

    const clickHandler = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (btn.dataset.busy === "1") return;
      btn.dataset.busy = "1";

      const rawUrl = (typeof getVideoUrl === "function" ? getVideoUrl() : null) || "";
      const liveUrl = normalizeDownloadUrl(rawUrl);
      if (!liveUrl) {
        btn.dataset.busy = "0";
        if (window.location.href.includes("tiktok.com")) {
          showToast("TikTok video linki bulunamadı. Videoyu açıp tekrar deneyin.");
        } else {
          showToast("URL okunamadı");
        }
        return;
      }

      const result = await sendToLocalApi(liveUrl, "auto");

      if (!result.ok) {
        const errMsg = result.error || "bilinmeyen_hata";
        if (errMsg === "timeout") {
          showToast("❌ Uygulama 15 saniyede yanıt vermedi");
        } else if (errMsg === "no_worker" || errMsg === "worker_no_response" || errMsg.includes("context invalidated")) {
          showToast("❌ Eklentiyi ve Instagram sekmesini yenileyin");
        } else if (errMsg === "connect_failed") {
          showToast("❌ Yerel uygulamaya bağlantı kurulamadı");
        } else {
          showToast(`❌ Hata: ${errMsg}`);
        }
      } else {
        const mode = result.mode || "";
        if (mode === "already_exists") {
          showToast("⚠️ Zaten eklendi (kuyrukta mevcut)");
        } else {
          showToast("✅ Uygulamaya gönderildi");
        }
      }

      setTimeout(() => { btn.dataset.busy = "0"; }, 1500);
    };

    btn.addEventListener("click", clickHandler, { passive: false });

    // Eğer Shorts ise container ve etiket oluşturup döndürelim
    if (type === "shorts") {
      const container = document.createElement("div");
      container.className = "ibrdl-shorts-container";
      
      const label = document.createElement("span");
      label.className = "ibrdl-shorts-label";
      label.textContent = "İndir";
      
      container.appendChild(btn);
      container.appendChild(label);
      
      // Butonun dışındaki kapsayıcıya da tıklama ekleyelim
      container.addEventListener("click", clickHandler, { passive: false });
      
      return container;
    }

    return btn;
  }

  // ===== WATCH PAGE (UZUN VİDEOLAR) =====
  function addWatchPageButton() {
    const isWatch = location.pathname.startsWith("/watch") || location.href.includes("/watch?v=");
    if (!isWatch) return;

    // Aktif görünür watch sayfasını veya metadata alanını bul
    const watchScope = document.querySelector("ytd-watch-flexy:not([hidden])") ||
                       document.querySelector("ytd-watch-metadata") ||
                       document;

    const target = watchScope.querySelector("#top-level-buttons-computed") ||
                   watchScope.querySelector("#flexible-item-buttons") ||
                   watchScope.querySelector("ytd-menu-renderer.ytd-watch-metadata #top-level-buttons-computed") ||
                   watchScope.querySelector("ytd-watch-metadata #actions-inner") ||
                   watchScope.querySelector("#actions-inner") ||
                   watchScope.querySelector("#actions");

    if (!target) return;
    if (target.querySelector("[data-ibrdl-watch]")) return;

    // Kendi modern, bağımsız YouTube butonumuzu üret
    const btn = buildButton(() => window.location.href, "default");
    btn.setAttribute("data-ibrdl-watch", "1");
    btn.classList.add("ibrdl-btn--watch");

    // Butonu aksiyon barında en uygun konuma yerleştir (Like/Dislike hapının hemen sağına)
    const segmented = target.querySelector("ytd-segmented-like-dislike-button-renderer, yt-segmented-like-dislike-button-view-model");
    if (segmented && segmented.nextSibling) {
      target.insertBefore(btn, segmented.nextSibling);
    } else if (target.firstChild) {
      target.insertBefore(btn, target.firstChild);
    } else {
      target.appendChild(btn);
    }
  }


  // ===== SHORTS PAGE =====
  function addShortsPageButton() {
    if (!location.pathname.startsWith("/shorts")) return;

    const reels = document.querySelectorAll("ytd-reel-video-renderer");

    for (const reel of reels) {
      if (reel.querySelector(".ibrdl-shorts-container") || reel.querySelector(".ibrdl-btn--shorts")) continue;

      // DOM analizinden elde edildi: Shorts sağ menüsünün gerçek kapsayıcısı
      // reel-action-bar-view-model > BUTTON-VIEW-MODEL > LABEL > DIV > span(Paylaş)
      let target = reel.querySelector("reel-action-bar-view-model");

      if (!target) {
          // Fallback: eski ID tabanlı yöntemler
          target = reel.querySelector("#actions-inner") || reel.querySelector("#actions");
      }

      if (!target) {
          // Son çare: Beğen butonundan tırman
          const likeBtn = reel.querySelector('ytd-like-button-renderer, #like-button');
          if (likeBtn) {
              let parent = likeBtn.parentElement;
              for (let i = 0; i < 6; i++) {
                  if (!parent) break;
                  if (parent.tagName === 'REEL-ACTION-BAR-VIEW-MODEL') {
                      target = parent;
                      break;
                  }
                  parent = parent.parentElement;
              }
          }
      }

      if (!target) continue;

      const btn = buildButton(() => window.location.href, "shorts");
      target.insertBefore(btn, target.firstChild);
    }
  }

  // ===== THUMBNAIL BUTTONS =====
  function attachButtonToThumbnail(a, isShorts = false) {
    if (!a || a.querySelector(`.${BTN_CLASS_BASE}--thumb`)) return;

    const href = a.getAttribute("href") || "";
    if (!href) return;

    const isWatchLink = href.includes("/watch?v=") || href.includes("youtu.be");
    const isShortsLink = href.includes("/shorts/");
    const isTikTokVideo = href.includes("/video/");
    
    if (!isWatchLink && !isShortsLink && !isTikTokVideo) return;

    const parent = a;
    const style = getComputedStyle(parent);
    if (style.position === "static") {
      parent.style.position = "relative";
    }
    parent.style.overflow = "visible";

    const btn = buildButton(() => absUrl(a.getAttribute("href")), "thumb");
    parent.appendChild(btn);
  }

  function scanThumbnails() {

    document.querySelectorAll('a#thumbnail[href^="/shorts/"]').forEach(a => attachButtonToThumbnail(a, true));
    document.querySelectorAll('a[href^="/shorts/"]').forEach(a => {
      if (a.querySelector("img, ytd-thumbnail, yt-image")) attachButtonToThumbnail(a, true);
    });

    document.querySelectorAll('a#thumbnail[href*="/watch"]').forEach(a => attachButtonToThumbnail(a, false));
    
    document.querySelectorAll("ytd-rich-grid-media, ytd-video-renderer, ytd-grid-video-renderer").forEach(card => {
      const a = card.querySelector('a#thumbnail[href*="/watch"], a#thumbnail[href^="/shorts/"]');
      if (a) {
        const isShorts = a.getAttribute("href")?.startsWith("/shorts/");
        attachButtonToThumbnail(a, isShorts);
      }
    });

    document.querySelectorAll("ytd-playlist-video-renderer").forEach(card => {
      const a = card.querySelector('a#thumbnail[href*="/watch"]');
      if (a) attachButtonToThumbnail(a, false);
    });

    // Instagram grid/profil thumbnails
    if (window.location.href.includes("instagram.com")) {
      scanInstagramThumbnails();
    }

    // TikTok arama/keşfet/profil thumbnails
    if (window.location.href.includes("tiktok.com")) {
      scanTikTokThumbnails();
    }
  }

  // ===== TIKTOK THUMBNAIL BUTTONS (Fotoğraf 2: Grid/Profil kartlarının sol üstü) =====
  function scanTikTokThumbnails() {
    if (!window.location.href.includes("tiktok.com")) return;

    // Sadece /video/ linki barındıran kartları bul
    const links = document.querySelectorAll('a[href*="/video/"]');
    for (const a of links) {
      if (a.querySelector(`.${BTN_CLASS_BASE}`)) continue;
      // Sol kenar çubuğu, üst bar veya gezinme menülerindeyse kesinlikle atla
      if (a.closest("header, nav, aside, [role='navigation'], #app-header, [class*='sidebar'], [class*='SideNav']")) continue;

      // Kart görsel veya video barındırmalı
      const hasMedia = a.querySelector("img, video, canvas, picture") ||
                       Array.from(a.querySelectorAll("div")).some(d => {
                         const bg = getComputedStyle(d).backgroundImage;
                         return bg && bg !== "none";
                       });
      if (!hasMedia) continue;

      const rect = a.getBoundingClientRect();
      // Çok küçük öğeleri atla (avatar vb.)
      if (rect.width < 70 || rect.height < 70) continue;

      const style = getComputedStyle(a);
      if (style.position === "static") {
        a.style.position = "relative";
      }

      const postUrl = absUrl(a.getAttribute("href"));
      if (!postUrl) continue;

      const btn = buildButton(() => postUrl, "thumb");
      btn.className = `${BTN_CLASS_BASE} ibrdl-btn--tiktok-thumb`;
      btn.title = "İndir";
      btn.setAttribute("aria-label", "İndir");
      a.appendChild(btn);
    }
  }

  // ===== INSTAGRAM THUMBNAIL BUTTONS =====
  function scanInstagramThumbnails() {
    // Strateji 1: /p/ veya /reel/ linklerine sahip <a> etiketleri
    const links = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
    
    for (const a of links) {
      if (a.querySelector(`.${BTN_CLASS_BASE}`)) continue;
      
      // Görsel içerik var mı? (img, video, canvas veya background-image olan div)
      const hasVisual = a.querySelector("img, video, canvas") || 
                        Array.from(a.querySelectorAll("div")).some(d => {
                          const bg = getComputedStyle(d).backgroundImage;
                          return bg && bg !== "none";
                        });
      if (!hasVisual) continue;
      
      // Çok küçük öğeleri atla (profil resmi, metin linkleri vb.)
      const rect = a.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 80) continue;
      
      // Önceden eklenmiş mi kontrol et (parent'ta da bakmalıyız)
      if (a.closest && a.closest(`.${BTN_CLASS_BASE}`)) continue;
      
      // Container pozisyonunu ayarla
      const style = getComputedStyle(a);
      if (style.position === "static") {
        a.style.position = "relative";
      }
      
      const postUrl = absUrl(a.getAttribute("href"));
      const btn = buildButton(() => postUrl, "thumb");
      btn.classList.remove("ibrdl-btn--thumb");
      btn.classList.add("ibrdl-btn--insta-thumb");
      a.appendChild(btn);
    }
  }

  // ===== INSTAGRAM PAGE =====
  function addInstagramButton() {
    if (!window.location.href.includes("instagram.com")) return;
    
    // Tüm SVG'leri tara (aksiyon barlarını bulmak için en güvenilir yol)
    const svgs = document.querySelectorAll("svg");
    
    for (const svg of svgs) {
      if (svg.closest(`.${BTN_CLASS_BASE}`)) continue; // Bizim butonumuzsa atla
      
      let actionBar = null;
      let parent = svg.parentElement;
      
      // İlk önceliğimiz Instagram'ın efsanevi <section> etiketini bulmak
      for (let i = 0; i < 6; i++) {
        if (!parent) break;
        if (parent.tagName.toLowerCase() === "section") {
          const svgCount = parent.querySelectorAll("svg").length;
          // İçinde en azından Beğen, Yorum vb var mı?
          if (svgCount >= 2 && svgCount <= 10) {
            actionBar = parent;
            break;
          }
        }
        parent = parent.parentElement;
      }
      
      // Eğer <section> bulamadıysak, SVG'leri yatay dizen bir div arayalım
      if (!actionBar) {
        parent = svg.parentElement;
        for (let i = 0; i < 5; i++) {
          if (!parent) break;
          const svgCount = parent.querySelectorAll("svg").length;
          if (svgCount >= 3 && svgCount <= 8) {
            const style = window.getComputedStyle(parent);
            if (style.display === "flex" && style.flexDirection === "row") {
              actionBar = parent;
            }
          }
          parent = parent.parentElement;
        }
      }

      // Aksiyon barı çok uzun (örn. sayfa yapısı) olmamalı
      if (actionBar && actionBar.offsetHeight < 120 && !actionBar.querySelector(`.${BTN_CLASS_BASE}`)) {
         let postUrl = window.location.href;
         // Postun veya reel'in kendi linkini bulmaya çalış
         const article = actionBar.closest("article"); 
         if (article) {
           const permalinkNode = article.querySelector('a[href*="/p/"], a[href*="/reel/"]');
           if (permalinkNode) {
             postUrl = absUrl(permalinkNode.getAttribute("href")) || postUrl;
           }
         }
         
         const btn = buildButton(() => postUrl, "insta");
         btn.style.background = "transparent";
         btn.style.color = "currentColor";
         btn.style.border = "none";
         btn.style.cursor = "pointer";
         btn.style.padding = "8px";
         btn.style.display = "flex";
         btn.style.alignItems = "center";
         btn.style.marginLeft = "4px"; 
         btn.style.outline = "none";
         
         // actionBar içine ekle
         actionBar.appendChild(btn);
      }
    }
  }

  function buildTikTokVideoUrl(videoId, handle) {
    if (!videoId) return null;
    const normalized = (handle || "tiktok").trim().replace(/^@+/, "");
    return `https://www.tiktok.com/@${normalized}/video/${videoId}`;
  }

  function tryExtractTikTokUrlFromJsonText(text) {
    if (!text) return null;
    try {
      const idMatch = text.match(/"id"\s*:\s*"(\d{17,21})"/);
      if (!idMatch) return null;
      const handleMatch =
        text.match(/"uniqueId"\s*:\s*"([^"]+)"/) ||
        text.match(/"author"\s*:\s*"([^"]+)"/);
      return buildTikTokVideoUrl(idMatch[1], handleMatch ? handleMatch[1] : "tiktok");
    } catch {
      return null;
    }
  }

  // ===== TIKTOK: Video URL Bulma (çok katmanlı strateji) =====
  function findTikTokVideoUrl() {
    // STRATEJİ 1: canonical veya og:url meta etiketi (TikTok bazen burayı günceller)
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      const href = canonical.getAttribute("href") || "";
      if (href.includes("/video/") || href.includes("/photo/")) return href;
    }
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) {
      const content = ogUrl.getAttribute("content") || "";
      if (content.includes("/video/") || content.includes("/photo/")) return content;
    }

    // STRATEJİ 2: Ekranın ortasına en yakın /video/ veya /photo/ linkini bul
    const centerY = window.innerHeight / 2;
    let bestLink = null;
    let bestDist = Infinity;
    for (const a of document.querySelectorAll('a[href*="/video/"], a[href*="/photo/"]')) {
      const rect = a.getBoundingClientRect();
      // Gizli (0x0) öğeleri atla
      if (rect.width === 0 && rect.height === 0) continue;
      const dist = Math.abs(rect.top + rect.height / 2 - centerY);
      if (dist < bestDist) {
        bestDist = dist;
        bestLink = a.getAttribute("href");
      }
    }
    if (bestLink) return absUrl(bestLink);

    // STRATEJİ 3: Aktif (oynayan) <video> öğesinden yukarı çıkarak bul
    const allVideos = document.querySelectorAll("video");
    let activeVideo = null;
    for (const v of allVideos) {
      if (!v.paused) { activeVideo = v; break; }
    }
    // Hiç oynamıyorsa, ekran ortasına en yakın olanı al
    if (!activeVideo) {
      let bestVDist = Infinity;
      for (const v of allVideos) {
        const rect = v.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        const dist = Math.abs(rect.top + rect.height / 2 - centerY);
        if (dist < bestVDist) {
          bestVDist = dist;
          activeVideo = v;
        }
      }
    }
    if (activeVideo) {
      let el = activeVideo;
      for (let i = 0; i < 20; i++) {
        if (!el || el.tagName === "BODY") break;
        // Bu seviyede /video/ linki var mı?
        const aNode = el.querySelector('a[href*="/video/"], a[href*="/photo/"]');
        if (aNode) return absUrl(aNode.getAttribute("href"));
        // /@username linki + uzun sayısal ID var mı?
        const authorNode = el.querySelector('a[href^="/@"]');
        if (authorNode && el.id && /^\d{17,21}$/.test(el.id)) {
          const authorPath = (authorNode.getAttribute("href").match(/(\/@[^\/\?]+)/) || [])[1];
          if (authorPath) return `https://www.tiktok.com${authorPath}/video/${el.id}`;
        }
        // data-e2e ile video id bulabilir miyiz?
        for (const child of el.querySelectorAll("[data-e2e]")) {
          const val = child.getAttribute("data-e2e") || "";
          if (/^\d{17,21}$/.test(val)) {
            const author2 = el.querySelector('a[href^="/@"]');
            if (author2) {
              const ap = (author2.getAttribute("href").match(/(\/@[^\/\?]+)/) || [])[1];
              if (ap) return `https://www.tiktok.com${ap}/video/${val}`;
            }
          }
        }
        el = el.parentElement;
      }
    }

    // STRATEJİ 4: SIGI_STATE veya __NEXT_DATA__ script etiketinden çek
    try {
      const sigiEl = document.getElementById("SIGI_STATE");
      if (sigiEl) {
        const state = JSON.parse(sigiEl.textContent);
        const items = state?.ItemModule || {};
        const keys = Object.keys(items);
        if (keys.length > 0) {
          // İlk video öğesinin linkini al
          const firstKey = keys[0];
          const item = items[firstKey];
          if (item && item.author) {
            return `https://www.tiktok.com/@${item.author}/video/${firstKey}`;
          }
        }
      }
    } catch (e) { /* ignore */ }

    // STRATEJI 5: Modern hydration scriptlerinden regex tabanli cikarim
    try {
      const scriptTexts = [
        document.getElementById("SIGI_STATE")?.textContent || "",
        document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__")?.textContent || "",
        document.getElementById("__NEXT_DATA__")?.textContent || ""
      ];

      for (const text of scriptTexts) {
        const extracted = tryExtractTikTokUrlFromJsonText(text);
        if (extracted) return extracted;
      }
    } catch (e) { /* ignore */ }

    // Hiçbir şey bulunamadı
    return null;
  }

  // ===== TIKTOK PAGE =====
  function addTikTokButton() {
    if (!window.location.href.includes("tiktok.com")) return;

    // A) DİKEY FEED BARI (Fotoğraf 1: Avatarın üstünde, dikey aksiyon barının en tepesinde)
    const allSvgs = document.querySelectorAll("svg");
    const feedBars = new Set();
    const modalBars = new Set();

    for (const svg of allSvgs) {
      if (svg.closest(`.${BTN_CLASS_BASE}`)) continue;
      
      // Header, nav, aside veya sol menüdeyse kesinlikle atla
      if (svg.closest("header, nav, aside, [role='navigation'], #app-header, [class*='Header'], [class*='header'], [data-e2e*='nav']")) continue;

      let el = svg.parentElement;
      for (let i = 0; i < 5; i++) {
        if (!el || el.tagName === "BODY") break;
        if (el.closest("header, nav, aside, [role='navigation'], #app-header, [class*='Header'], [class*='header']")) break;

        const style = window.getComputedStyle(el);
        if (style.display === "flex") {
          const rect = el.getBoundingClientRect();
          // Üst menü (header) kontrolü: y koordinatı 70px'ten küçükse kesinlikle atla
          if (rect.top < 65) break;

          // 1) Dikey aksiyon barı (Fotoğraf 1): dar, yüksek, ekranın sağ kısmında
          if (style.flexDirection === "column" && rect.width >= 30 && rect.width <= 100 && rect.height >= 180) {
            if (el.querySelectorAll("button, [role='button']").length >= 2 || el.querySelectorAll("svg").length >= 2) {
              feedBars.add(el);
              break;
            }
          }

          // 2) Yatay modal barı: SADECE bir video modalı / browse-video kapsayıcısı içindeyse!
          const isInsideVideoModal = el.closest("[data-e2e='browse-video'], div[class*='DivBrowserModeContainer'], div[class*='DivContentContainer'], div[class*='DivModalContainer'], article");
          if (isInsideVideoModal && style.flexDirection === "row" && rect.height >= 24 && rect.height <= 80 && rect.width >= 120 && rect.width <= 700) {
            if (el.querySelectorAll("button, [role='button']").length >= 3) {
              modalBars.add(el);
              break;
            }
          }
        }
        el = el.parentElement;
      }
    }

    // 1) Dikey Feed Barlarına Ekle (Fotoğraf 1 ile birebir: Barın en tepesinde, avatarın üstünde tek buton)
    for (const bar of feedBars) {
      if (bar.querySelector("[data-ibrdl-tiktok]")) continue;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `${BTN_CLASS_BASE} ibrdl-btn--tiktok-feed`;
      btn.title = "Videoyu İndir";
      btn.setAttribute("aria-label", "Videoyu İndir");
      btn.setAttribute("data-ibrdl-tiktok", "1");
      btn.innerHTML = ICON_SVG;

      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (btn.dataset.busy === "1") return;
        btn.dataset.busy = "1";

        let videoUrl = "";
        const card = bar.closest("article, [data-e2e='recommend-list-item-container'], div[class*='DivItemContainer']") || bar.parentElement;
        if (card) {
          const a = card.querySelector('a[href*="/video/"]');
          if (a) videoUrl = absUrl(a.getAttribute("href"));
        }
        if (!videoUrl && isTikTokVideoUrl(window.location.href)) {
          videoUrl = window.location.href;
        }
        if (!videoUrl) {
          videoUrl = findTikTokVideoUrl() || window.location.href;
        }

        videoUrl = normalizeDownloadUrl(videoUrl);
        if (!videoUrl) {
          btn.dataset.busy = "0";
          showToast("TikTok video linki bulunamadı.");
          return;
        }

        const result = await sendToLocalApi(videoUrl, "auto");
        if (!result.ok) {
          const errMsg = result.error || "bilinmeyen_hata";
          showToast(`❌ Uygulamaya bağlanılamadı (${errMsg})`);
        } else {
          if (result.mode === "already_exists") {
            showToast("⚠️ Zaten eklendi (kuyrukta mevcut)");
          } else {
            showToast("✅ Uygulamaya gönderildi");
          }
        }

        setTimeout(() => { btn.dataset.busy = "0"; }, 1500);
      }, { passive: false });

      // En tepeye (ilk sıraya) ekle -> Fotoğraf 1'deki yerleşim
      bar.insertBefore(btn, bar.firstChild);
    }

    // 2) Yatay Detay Modal Barlarına Ekle (Kaydet butonunun hemen sağına)
    for (const bar of modalBars) {
      if (bar.querySelector("[data-ibrdl-tiktok]")) continue;

      const children = Array.from(bar.children).filter(c => 
        !c.classList.contains("ibrdl-tiktok-action-wrapper") && 
        !c.querySelector(".ibrdl-tiktok-action-wrapper")
      );
      if (children.length < 3) continue;

      // 3. eleman (index 2) TikTok detay barında daima Kaydet / Favori butonudur
      const bookmarkTarget = children.length >= 3 ? children[2] : null;
      if (!bookmarkTarget) continue;

      const wrapper = document.createElement("div");
      wrapper.className = "ibrdl-tiktok-action-wrapper";
      wrapper.setAttribute("data-ibrdl-tiktok", "1");
      wrapper.style.display = "inline-flex";
      wrapper.style.alignItems = "center";
      wrapper.style.margin = "0 6px";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `${BTN_CLASS_BASE} ibrdl-btn--tiktok-action`;
      btn.title = "Videoyu İndir";
      btn.setAttribute("aria-label", "Videoyu İndir");
      btn.innerHTML = ICON_SVG;

      const label = document.createElement("span");
      label.className = "ibrdl-tiktok-action-label";
      label.textContent = "İndir";

      wrapper.appendChild(btn);
      wrapper.appendChild(label);

      wrapper.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (btn.dataset.busy === "1") return;
        btn.dataset.busy = "1";

        let videoUrl = isTikTokVideoUrl(window.location.href) ? window.location.href : (findTikTokVideoUrl() || window.location.href);
        videoUrl = normalizeDownloadUrl(videoUrl);
        if (!videoUrl) {
          btn.dataset.busy = "0";
          showToast("TikTok video linki bulunamadı.");
          return;
        }

        const result = await sendToLocalApi(videoUrl, "auto");
        if (!result.ok) {
          const errMsg = result.error || "bilinmeyen_hata";
          showToast(`❌ Uygulamaya bağlanılamadı (${errMsg})`);
        } else {
          if (result.mode === "already_exists") {
            showToast("⚠️ Zaten eklendi (kuyrukta mevcut)");
          } else {
            showToast("✅ Uygulamaya gönderildi");
          }
        }

        setTimeout(() => { btn.dataset.busy = "0"; }, 1500);
      }, { passive: false });

      bookmarkTarget.insertAdjacentElement("afterend", wrapper);
    }
  }

  // ===== SCAN COORDINATOR =====
  function scan() {
    const url = window.location.href;
    
    if (url.includes("youtube.com/watch") || url.includes("youtu.be")) {
      addWatchPageButton();
    } else if (url.includes("/shorts/")) {
      addShortsPageButton();
    } else if (url.includes("instagram.com")) {
      addInstagramButton();
    } else if (url.includes("tiktok.com")) {
      addTikTokButton();
    }
    
    scanThumbnails();
  }

  // ===== URL DEĞİŞİM TAKİBİ =====
  let lastUrl = location.href;
  const tick = () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(scan, 400);
      setTimeout(scan, 1200);
    }
  };

  // ===== MUTATION OBSERVER (debounced) =====
  // MutationObserver zaten her DOM değişikliğinde tetikleniyor,
  // ek setInterval(scan) gereksiz CPU kullanımı yaratır.
  let _scanTimer = null;
  const debouncedScan = () => {
    if (_scanTimer) clearTimeout(_scanTimer);
    _scanTimer = setTimeout(() => { _scanTimer = null; scan(); }, 300);
  };
  const mo = new MutationObserver(debouncedScan);
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // YouTube SPA sayfa geçişleri
  window.addEventListener("yt-navigate-finish", () => {
    setTimeout(scan, 200);
    setTimeout(scan, 800);
  });
  window.addEventListener("spfdone", () => {
    setTimeout(scan, 200);
  });

  // ===== BAŞLAT =====
  scan();
  setInterval(tick, 500);
})();
