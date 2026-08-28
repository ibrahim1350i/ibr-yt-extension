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
      const timeout = setTimeout(() => resolve({ ok: false, error: "timeout" }), 3000);
      try {
        chrome.runtime.sendMessage({ type: "SEND_TO_API", url, mode }, (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError || !response) {
            resolve({ ok: false, error: "worker_failed" });
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
        if (errMsg === "timeout" || errMsg === "worker_failed" || errMsg === "no_worker" || errMsg === "connect_failed") {
          showToast("❌ Uygulamaya bağlanılamadı");
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

  // ===== WATCH PAGE =====
  function addWatchPageButton() {
    if (document.querySelector('[data-ibrdl-watch]')) return;
    if (!window.location.href.includes("/watch?v=")) return;

    const target = document.querySelector("#top-level-buttons-computed") ||
                   document.querySelector("#flexible-item-buttons") ||
                   document.querySelector("#actions");

    if (!target) return;

    // Klonlanacak yerel YouTube butonunu bul (Özellikle Paylaş, Kaydet gibi tekil butonları hedefle)
    const nativeBtns = target.querySelectorAll("ytd-button-renderer, yt-button-view-model, button");
    let nativeBtn = null;
    
    // 1. Öncelik: Paylaş veya Kaydet butonu
    for (const b of nativeBtns) {
        const txt = (b.textContent || "").toLowerCase();
        if (txt.includes('paylaş') || txt.includes('share') || txt.includes('kaydet') || txt.includes('save')) {
            nativeBtn = b;
            break;
        }
    }
    
    // 2. Öncelik: Beğen (segmented) HARİCİ herhangi bir metinli buton
    if (!nativeBtn) {
        for (const b of nativeBtns) {
            // Segmented (birleşik) butonlardan uzak dur
            if (!b.closest('ytd-segmented-like-dislike-button-renderer, yt-segmented-like-dislike-button-view-model')) {
                if (b.textContent && b.textContent.trim().length > 0) {
                    nativeBtn = b;
                    break;
                }
            }
        }
    }
    
    // 3. Fallback: Bulamazsa ilk butonu al
    if (!nativeBtn && nativeBtns.length > 0) nativeBtn = nativeBtns[0];

    if (nativeBtn) {
      // En dış sarmalayıcıyı bul (CSS'in bozulmaması için)
      const wrapperToClone = nativeBtn.closest("ytd-button-renderer, yt-button-view-model") || nativeBtn;
      const cloned = wrapperToClone.cloneNode(true);
      
      cloned.setAttribute("data-ibrdl-watch", "1");
      
      // ID'leri temizle (duplicate ID sorununu önle)
      cloned.removeAttribute("id");
      cloned.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
      
      // Metni "İndir" yap
      // YouTube bazen metni div içine koyuyor, o yüzden daha geniş arayalım
      const textEls = cloned.querySelectorAll("yt-formatted-string, span, div.yt-spec-button-shape-next__button-text-content, div.cbox");
      let textReplaced = false;
      for (const el of textEls) {
        const txt = (el.textContent || "").trim();
        // İkon veya boşluk olmayan ilk metni değiştir
        if (txt.length > 0 && txt.length < 20 && !el.closest("yt-icon, svg")) {
          el.textContent = "İndir";
          textReplaced = true;
          break;
        }
      }
      
      // Eğer metin hiçbir elementte bulunamadıysa (doğrudan textNode olarak eklendiyse)
      if (!textReplaced) {
         const btnShape = cloned.querySelector('button') || cloned;
         // Çok riskli ama son çare
         if (btnShape.textContent.includes(nativeBtn.textContent.trim())) {
             btnShape.innerHTML = btnShape.innerHTML.replace(nativeBtn.textContent.trim(), "İndir");
         }
      }
      
      // İkonu tamamen yeni SVG ile değiştir (iç içe girmeyi engelle)
      const svgEls = cloned.querySelectorAll("svg");
      if (svgEls.length > 0) {
          const oldSvg = svgEls[0];
          const parser = new DOMParser();
          const doc = parser.parseFromString(ICON_SVG, 'image/svg+xml');
          const newSvg = doc.querySelector('svg');
          
          if (newSvg && oldSvg.parentNode) {
              // YouTube'un kendi SVG sınıflarını koru ki yerleşimi bozulmasın
              if (oldSvg.className.baseVal) newSvg.setAttribute("class", oldSvg.className.baseVal);
              else if (oldSvg.getAttribute("class")) newSvg.setAttribute("class", oldSvg.getAttribute("class"));
              
              newSvg.style.cssText = oldSvg.style.cssText;
              oldSvg.parentNode.replaceChild(newSvg, oldSvg);
          }
      }
      
      // Tıklama olayını engelle ve kendi kodumuzu çalıştır
      cloned.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (cloned.dataset.busy === "1") return;
        cloned.dataset.busy = "1";
        
        const liveUrl = normalizeDownloadUrl(window.location.href);
        if (!liveUrl) {
          cloned.dataset.busy = "0";
          showToast("URL okunamadı");
          return;
        }
        
        const result = await sendToLocalApi(liveUrl, "auto");
        if (!result.ok) {
          showToast("❌ Uygulamaya bağlanılamadı");
        } else {
          if (result.mode === "already_exists") showToast("⚠️ Zaten eklendi");
          else showToast("✅ Uygulamaya gönderildi");
        }
        setTimeout(() => { cloned.dataset.busy = "0"; }, 1500);
      }, true);
      
      target.insertBefore(cloned, target.firstChild);
    } else {
      // Fallback: Bulunamazsa kendi özel butonumuzu koy
      const btn = buildButton(() => window.location.href, "default");
      btn.setAttribute("data-ibrdl-watch", "1");
      target.insertBefore(btn, target.firstChild);
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

  // ===== TIKTOK THUMBNAIL BUTTONS =====
  function scanTikTokThumbnails() {
    // TikTok arama, keşfet ve profil sayfalarındaki video kartları
    // Linkler genelde /@username/video/XXXX formatında
    const links = document.querySelectorAll('a[href*="/video/"]');
    
    for (const a of links) {
      if (a.querySelector(`.${BTN_CLASS_BASE}`)) continue;
      
      // Görsel içerik var mı?
      const hasVisual = a.querySelector("img, video, canvas, picture");
      if (!hasVisual) continue;
      
      // Çok küçük öğeleri atla
      const rect = a.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 80) continue;
      
      // Zaten tam ekran video sayfasındaki aksiyonbar butonumuzsa atla
      if (a.closest(`.${BTN_CLASS_BASE}`)) continue;
      
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
    
    const svgs = document.querySelectorAll("svg");
    
    for (const svg of svgs) {
      if (svg.closest(`.${BTN_CLASS_BASE}`)) continue;
      
      let actionBar = null;
      let parent = svg.parentElement;
      
      for (let i = 0; i < 6; i++) {
        if (!parent) break;
        const style = window.getComputedStyle(parent);
        
        if (style.display === "flex" && style.flexDirection === "column") {
          const btnCount = parent.querySelectorAll("button").length;
          const w = parent.offsetWidth;
          const h = parent.offsetHeight;
          if (btnCount >= 3 && btnCount <= 8 && w >= 30 && w <= 100 && h >= 200) {
            actionBar = parent;
            break;
          }
        }
        parent = parent.parentElement;
      }
      
      if (actionBar && actionBar.offsetHeight > 100 && !actionBar.querySelector(`.${BTN_CLASS_BASE}`)) {
         const btn = buildButton(() => {
             // Her tıklamada video URL'sini yeniden hesapla; ana sayfa URL'sine düşme.
             return findTikTokVideoUrl() || "";
         }, "insta"); 
         btn.style.background = "transparent";
         btn.style.color = "currentColor";
         btn.style.border = "none";
         btn.style.cursor = "pointer";
         btn.style.padding = "8px 0";
         btn.style.display = "flex";
         btn.style.flexDirection = "column";
         btn.style.alignItems = "center";
         btn.style.marginBottom = "16px"; 
         btn.style.outline = "none";
         
         const iconSvg = btn.querySelector("svg");
         if (iconSvg) {
             iconSvg.style.width = "32px";
             iconSvg.style.height = "32px";
         }
         
         actionBar.insertBefore(btn, actionBar.firstChild);
      }
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

  // ===== BAŞLAT =====
  scan();
  setInterval(tick, 500);
})();
