/* Frontend Fieldwork — jQuery event handling, native Pointer Events and CSS motion. */
(() => {
  "use strict";

  function boot($) {
    $(function () {
      const $doc = $(document), $body = $(document.body);
      const desk = document.getElementById("desk");
      const drawer = document.getElementById("drawer");
      const $preview = $("#hover-preview"), $cursor = $("#cursor");
      const touchLayout = matchMedia("(max-width: 980px), (pointer: coarse), (max-height: 560px)");
      const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
      const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
      const cards = [...document.querySelectorAll(".project")];
      const pieces = [...document.querySelectorAll(".piece")].map(el => ({ el, x: 0, y: 0, frame: 0 }));
      const states = new Map(pieces.map(state => [state.el, state]));
      const camera = { x: 0, y: 0, frame: 0 };
      const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
      let mobile = touchLayout.matches, category = "all", activeIndex = 0, zIndex = 6;
      let gesture = null, swipe = null, blockedUntil = 0, resizeTimer = 0;
      let returnFocus = null, closeTimer = 0, toastTimer = 0, cursorFrame = 0;
      let entranceTimer = 0;
      let keyboardNavigation = false, focusFrame = 0, cameraTarget = null;
      const cursor = { x: 0, y: 0, tx: 0, ty: 0, initialized: false };
      const scrambles = new Map();

      // 01 — Separate world coordinates from camera coordinates. No scaling math is needed.
      function render(state) {
        const target = state === camera ? document.documentElement : state.el;
        target.style.setProperty(state === camera ? "--pan-x" : "--x", `${state.x.toFixed(2)}px`);
        target.style.setProperty(state === camera ? "--pan-y" : "--y", `${state.y.toFixed(2)}px`);
        // The geographic marker stays fixed; only the camera and grid move.
      }
      function stop(state) {
        cancelAnimationFrame(state.frame); state.frame = 0;
        if (state === camera) cameraTarget = null;
      }
      function moveTo(state, x, y) { stop(state); state.x = x; state.y = y; render(state); }
      function visibleCards() { return cards.filter(el => category === "all" || el.dataset.category === category); }
      function announce(message) { $("#announcement").text(message); }

      function updateNavigation(visible = visibleCards()) {
        $("#project-position").text(`${String(visible.length ? activeIndex + 1 : 0).padStart(2, "0")} / ${String(visible.length).padStart(2, "0")}`);
        $("#previous-project, #next-project").prop("disabled", visible.length < 2);
        $("#projects").attr("aria-roledescription", mobile ? "carousel" : "project workspace");
      }

      function syncFilterCounts() {
        $("[data-filter]").each(function () {
          const filter = this.dataset.filter;
          const count = cards.filter(el => filter === "all" || el.dataset.category === filter).length;
          $(this).find("span").last().text(String(count).padStart(2, "0"));
          $(this).prop("disabled", count === 0);
        });
      }

      function renderStack(speak = false) {
        const visible = visibleCards();
        const focusedCard = document.activeElement && document.activeElement.closest(".project");
        activeIndex = visible.length ? ((activeIndex % visible.length) + visible.length) % visible.length : 0;
        const activeCard = visible[activeIndex];
        const nextCard = visible.length > 1 ? visible[(activeIndex + 1) % visible.length] : null;
        cards.forEach(el => {
          const included = visible.includes(el), active = el === activeCard;
          const behind = mobile && included && el === nextCard;
          // All eligible cards stay in the catalogue, but only two are painted on touch.
          el.hidden = !included || (mobile && !active && !behind);
          el.inert = !included || (mobile && !active);
          $(el).toggleClass("is-active", mobile && active).toggleClass("is-behind", behind);
          if (el.inert) el.setAttribute("aria-hidden", "true"); else el.removeAttribute("aria-hidden");
          el.style.removeProperty("--swipe-x"); el.style.removeProperty("--swipe-angle");
        });
        updateNavigation(visible);
        if (mobile && focusedCard && focusedCard !== activeCard && activeCard) {
          activeCard.querySelector("[data-open]").focus({ preventScroll: true });
        }
        if (speak) announce(activeCard
          ? `${activeCard.querySelector("h2").textContent.replace("↗", "").trim()}. Project ${activeIndex + 1} of ${visible.length}.`
          : "No projects match this filter.");
      }

      function projectInView(card) {
        const r = card.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.left >= 24 && r.right <= desk.clientWidth - 24 &&
          r.top >= 82 && r.bottom <= desk.clientHeight - 132;
      }

      function panToProject(card, animated = true) {
        if (mobile || !card || card.hidden) return;
        const state = states.get(card);
        if (!state) return;
        stop(state);
        card.style.zIndex = ++zIndex;
        // Centre the selected work between the fixed header and the controls.
        const x = desk.clientWidth / 2 - state.x - card.offsetWidth / 2;
        const y = (82 + desk.clientHeight - 132) / 2 - state.y - card.offsetHeight / 2;
        if (cameraTarget && Math.hypot(cameraTarget.x - x, cameraTarget.y - y) < .5) return;
        stop(camera); hidePreview();
        if (!animated || reducedMotion.matches || Math.hypot(camera.x - x, camera.y - y) < 1) {
          moveTo(camera, x, y);
          return;
        }
        const startX = camera.x, startY = camera.y, startTime = performance.now();
        cameraTarget = { x, y };
        function frame(now) {
          const progress = clamp((now - startTime) / 480, 0, 1);
          const ease = 1 - Math.pow(1 - progress, 3);
          camera.x = startX + (x - startX) * ease;
          camera.y = startY + (y - startY) * ease;
          render(camera);
          if (progress < 1) camera.frame = requestAnimationFrame(frame);
          else { camera.frame = 0; cameraTarget = null; }
        }
        camera.frame = requestAnimationFrame(frame);
      }

      function home(preserveSelection = false) {
        if ($body.hasClass("is-entering")) finishEntrance();
        cancelAnimationFrame(focusFrame); focusFrame = 0;
        cancelInteractions(); pieces.forEach(stop); stop(camera);
        mobile = touchLayout.matches;
        moveTo(camera, 0, 0);
        if (!mobile) {
          // 1. Read container dimensions before mutating the DOM.
          const w = desk.clientWidth, h = desk.clientHeight;
          // 2. Measure every card in one pass.
          cards.forEach(el => { el.hidden = false; });
          const oreilles = document.getElementById("oreilles-card");
          const human = document.getElementById("human-card");
          const oreillesW = oreilles.offsetWidth, oreillesH = oreilles.offsetHeight;
          const humanH = human.offsetHeight;
          const additional = cards.slice(2);
          const additionalSizes = additional.map(el => ({
            el,
            w: el.offsetWidth,
            h: el.offsetHeight
          }));

          // 3. Apply all positions in a pure write pass.
          const positions = {
            "intro-card": [w * .055, Math.max(108, h * .19), 2],
            "window-card": [w * .445, Math.max(100, h * .13), 4],
            "oreilles-card": [w - oreillesW - Math.max(50, w * .045), Math.max(185, h - oreillesH - 132), 3],
            "human-card": [w * .105, h - humanH - 104, 5]
          };
          pieces.forEach(state => {
            const position = positions[state.el.id];
            if (!position) return;
            moveTo(state, position[0], position[1]); state.el.style.zIndex = position[2];
          });
          const widest = additionalSizes.reduce((width, item) => Math.max(width, item.w), 0);
          const pairOffset = Math.max(440, widest + 70);
          const stride = Math.max(960, w * .88, pairOffset + widest + 150);
          additionalSizes.forEach(({ el, h: cardH }, i) => {
            const group = Math.floor(i / 2), second = i % 2 === 1;
            const x = w + 96 + group * stride + (second ? pairOffset : 0) + (group % 2 ? 16 : 0);
            const y = second ? Math.max(185, h - cardH - 132) - (group % 2 ? 12 : 0)
              : Math.max(100, h * .13) + (group % 2 ? 12 : 0);
            moveTo(states.get(el), x, y);
            el.style.zIndex = 6 + i;
          });
          zIndex = 6 + additional.length;
        }
        $("[data-drag-handle]").prop("disabled", mobile);
        renderStack(); hideCursor(); hidePreview();
        const selected = visibleCards()[activeIndex];
        if (preserveSelection === true && !mobile && selected && !projectInView(selected)) panToProject(selected, false);
      }

      // Initial entrance. Additive translation preserves drag and mobile transforms.
      function finishEntrance() {
        clearTimeout(entranceTimer);
        clearTimeout(window.fieldworkEntryFallback);
        if (window.fieldworkRevealPending) window.fieldworkRevealPending();
        entranceTimer = 0;
        $body.removeClass("is-entering");
        document.documentElement.dataset.entry = "done";
        document.removeEventListener("pointerdown", finishEntrance, true);
        document.removeEventListener("keydown", finishEntrance, true);
        pieces.forEach(({ el }) => {
          el.classList.remove("entry-piece");
          ["--burst-x", "--burst-y", "--overshoot-x", "--overshoot-y", "--settle-x", "--settle-y", "--entry-delay", "--entry-opacity"].forEach(name => el.style.removeProperty(name));
        });
      }

      function playEntrance() {
        const root = document.documentElement;
        clearTimeout(window.fieldworkEntryFallback);
        // Immediate reveal on mobile/reducedMotion for optimal LCP, and avoid relaunching on late CDN load.
        if (mobile || reducedMotion.matches || root.dataset.entry !== "pending" || document.hidden) {
          finishEntrance();
          return;
        }
        const deskW = desk.clientWidth, deskH = desk.clientHeight;
        const origin = { x: deskW / 2, y: deskH * .47 };

        // 1. Pure read phase (prevents layout thrashing).
        const visiblePieces = pieces
          .map(({ el }) => ({ el, hidden: el.hidden, rect: el.getBoundingClientRect() }))
          .filter(({ hidden, rect }) => !hidden && rect.width && rect.height &&
            rect.right > 0 && rect.bottom > 0 && rect.left < deskW && rect.top < deskH);

        // 2. Pure write phase.
        visiblePieces.forEach(({ el, rect }, order) => {
          el.classList.add("entry-piece");
          const dx = origin.x - (rect.left + rect.width / 2);
          const dy = origin.y - (rect.top + rect.height / 2);
          const ox = clamp(-dx * .075, -50, 50), oy = clamp(-dy * .075, -40, 40);
          el.style.setProperty("--burst-x", `${dx.toFixed(2)}px`);
          el.style.setProperty("--burst-y", `${dy.toFixed(2)}px`);
          el.style.setProperty("--overshoot-x", `${ox.toFixed(2)}px`);
          el.style.setProperty("--overshoot-y", `${oy.toFixed(2)}px`);
          el.style.setProperty("--settle-x", `${(-ox * .18).toFixed(2)}px`);
          el.style.setProperty("--settle-y", `${(-oy * .18).toFixed(2)}px`);
          el.style.setProperty("--entry-delay", `${order * 80}ms`);
          el.style.setProperty("--entry-opacity", el.classList.contains("is-behind") ? ".55" : "1");
        });

        root.dataset.entry = "playing";
        if (window.fieldworkRevealPending) window.fieldworkRevealPending();
        $body.addClass("is-entering");
        // Capture runs before existing drag handlers: any input settles the scene first.
        document.addEventListener("pointerdown", finishEntrance, true);
        document.addEventListener("keydown", finishEntrance, true);
        const rawDuration = getComputedStyle(root).getPropertyValue("--entry-duration").trim();
        const duration = rawDuration.endsWith("ms") ? parseFloat(rawDuration)
          : rawDuration.endsWith("s") ? parseFloat(rawDuration) * 1000 : 1040;
        entranceTimer = setTimeout(finishEntrance, Math.max(1400, duration + Math.max(0, visiblePieces.length - 1) * 80 + 100));
      }

      // 02 — Time-based inertia. Pauses, cancellation and reduced motion stop it immediately.
      function coast(state, vx, vy) {
        stop(state);
        if (reducedMotion.matches) return;
        let previous = performance.now();
        function frame(now) {
          const dt = Math.min(now - previous, 32); previous = now;
          const decay = Math.exp(-dt / 160);
          vx *= decay; vy *= decay;
          state.x += vx * dt; state.y += vy * dt; render(state);
          if (Math.hypot(vx, vy) > .018) state.frame = requestAnimationFrame(frame);
          else state.frame = 0;
        }
        state.frame = requestAnimationFrame(frame);
      }
      function releaseCapture(el, id) {
        try { if (el.hasPointerCapture(id)) el.releasePointerCapture(id); } catch (_) { /* Pointer already released. */ }
      }
      function endDrag(inertia = false) {
        if (!gesture) return;
        const g = gesture; gesture = null;
        releaseCapture(desk, g.id);
        $body.removeClass("is-dragging"); $(g.state.el).removeClass("is-dragging");
        if (g.moved) {
          blockedUntil = performance.now() + 240;
          if (inertia && performance.now() - g.time < 90) coast(g.state, g.vx, g.vy);
        }
      }
      $(desk).on("pointerdown", function (event) {
        const e = event.originalEvent;
        if (mobile || e.button !== 0 || e.isPrimary === false || gesture || drawer.open) return;
        const piece = e.target.closest(".piece");
        if (piece) {
          stop(camera);
          piece.style.zIndex = ++zIndex;
          const index = visibleCards().indexOf(piece);
          if (index !== -1) { activeIndex = index; updateNavigation(); }
        }
        if (e.target.closest("a,button,input,textarea,select") && !e.target.closest("[data-drag-handle]")) return;
        const state = piece ? states.get(piece) : camera;
        stop(state); hidePreview();
        gesture = { state, id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: state.x, oy: state.y,
          lx: e.clientX, ly: e.clientY, time: performance.now(), vx: 0, vy: 0, moved: false };
        const handle = e.target.closest("[data-drag-handle]");
        if (handle) handle.focus({ preventScroll: true });
        try { desk.setPointerCapture(e.pointerId); } catch (_) { /* Document listeners remain active. */ }
        event.preventDefault();
      });
      function dragMove(e) {
        if (!gesture || e.pointerId !== gesture.id) return;
        const g = gesture, dx = e.clientX - g.sx, dy = e.clientY - g.sy;
        if (!g.moved && Math.hypot(dx, dy) < 5) return;
        g.moved = true;
        const now = performance.now(), dt = Math.max(1, now - g.time);
        g.vx = .35 * g.vx + .65 * clamp((e.clientX - g.lx) / dt, -2.5, 2.5);
        g.vy = .35 * g.vy + .65 * clamp((e.clientY - g.ly) / dt, -2.5, 2.5);
        g.state.x = g.ox + dx; g.state.y = g.oy + dy; render(g.state);
        g.lx = e.clientX; g.ly = e.clientY; g.time = now;
        $body.addClass("is-dragging"); $(g.state.el).addClass("is-dragging");
      }
      $(desk).on("lostpointercapture", () => endDrag(false));
      $doc.on("keydown", "[data-drag-handle]", function (e) {
        if (mobile || e.altKey || e.ctrlKey || e.metaKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
        e.preventDefault();
        const state = states.get(this.closest(".piece")), step = e.shiftKey ? 80 : 20;
        stop(camera);
        state.el.style.zIndex = ++zIndex;
        moveTo(state, state.x + (e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0),
          state.y + (e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0));
      });

      // 03 — Touch cards: distinguish taps, horizontal swipes and vertical gestures.
      function nextProject(direction) {
        if ($body.hasClass("is-entering")) finishEntrance();
        cancelInteractions();
        activeIndex += direction; renderStack(true); hidePreview();
        if (!mobile) panToProject(visibleCards()[activeIndex]);
      }
      $("#next-project").on("click", () => nextProject(1));
      $("#previous-project").on("click", () => nextProject(-1));
      $("#projects").on("keydown", function (e) {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        if (!mobile && e.target.closest("[data-drag-handle]")) return;
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault(); nextProject(e.key === "ArrowRight" ? 1 : -1);
          const card = visibleCards()[activeIndex];
          if (card) card.querySelector("[data-open]").focus({ preventScroll: true });
        }
      }).on("pointerdown", function (event) {
        const e = event.originalEvent;
        if (!mobile || e.button !== 0 || e.isPrimary === false || swipe || visibleCards().length < 2) return;
        const card = e.target.closest(".project.is-active");
        if (card) swipe = { id: e.pointerId, card, x: e.clientX, y: e.clientY, dx: 0, time: performance.now(), moved: false };
      });
      function swipeMove(e) {
        if (!swipe || swipe.id !== e.pointerId) return;
        const s = swipe, dx = e.clientX - s.x, dy = e.clientY - s.y;
        if (!s.moved && Math.abs(dy) > 9 && Math.abs(dy) > Math.abs(dx)) { endSwipe(false); return; }
        if (!s.moved && Math.abs(dx) < 10) return;
        if (!s.moved) {
          s.moved = true;
          try { s.card.setPointerCapture(e.pointerId); } catch (_) { /* A cancelled native gesture needs no capture. */ }
        }
        s.dx = dx;
        $(s.card).addClass("is-swiping").css({ "--swipe-x": `${dx * .8}px`, "--swipe-angle": `${clamp(dx * .025, -9, 9)}deg` });
        if (e.cancelable) e.preventDefault();
      }
      function endSwipe(commit = false) {
        if (!swipe) return;
        const s = swipe; swipe = null;
        releaseCapture(s.card, s.id);
        $(s.card).removeClass("is-swiping");
        s.card.style.removeProperty("--swipe-x"); s.card.style.removeProperty("--swipe-angle");
        if (s.moved) {
          blockedUntil = performance.now() + 280;
          const velocity = Math.abs(s.dx) / Math.max(1, performance.now() - s.time);
          if (commit && (Math.abs(s.dx) > Math.min(65, s.card.offsetWidth * .18) || (velocity > .5 && Math.abs(s.dx) > 22))) nextProject(s.dx < 0 ? 1 : -1);
        }
      }
      $doc.on("pointermove", e => { dragMove(e.originalEvent); swipeMove(e.originalEvent); });
      $doc.on("pointerup pointercancel", e => {
        const id = e.originalEvent.pointerId, commit = e.type === "pointerup";
        if (gesture && gesture.id === id) endDrag(commit);
        if (swipe && swipe.id === id) endSwipe(commit);
      });
      $("#projects").on("lostpointercapture", function (event) {
        const e = event.originalEvent;
        if (swipe && event.target === swipe.card && e.pointerId === swipe.id) endSwipe(false);
      });
      // A released drag must never activate the button underneath it.
      document.addEventListener("click", e => {
        if (performance.now() < blockedUntil) { e.preventDefault(); e.stopImmediatePropagation(); }
      }, true);
      function cancelInteractions() { endDrag(false); endSwipe(false); }

      // Mouse focus never moves a link beneath its click. Keyboard focus reveals offscreen work.
      document.addEventListener("pointerdown", () => {
        keyboardNavigation = false;
        cancelAnimationFrame(focusFrame); focusFrame = 0;
      }, true);
      document.addEventListener("keydown", e => {
        if (["Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) keyboardNavigation = true;
      }, true);
      $doc.on("focusin", ".project", function () {
        if (mobile) return;
        const card = this, index = visibleCards().indexOf(card);
        if (index === -1) return;
        activeIndex = index; updateNavigation();
        if (!keyboardNavigation) return;
        cancelAnimationFrame(focusFrame);
        focusFrame = requestAnimationFrame(() => {
          focusFrame = 0;
          // Prevent native focus scrolling from becoming a second, competing camera.
          desk.scrollLeft = 0; desk.scrollTop = 0;
          if (card.contains(document.activeElement) && !projectInView(card)) panToProject(card);
        });
      });

      $(".skip-link").on("click", function (e) {
        e.preventDefault();
        const card = visibleCards()[activeIndex];
        if (!card) return;
        if (!mobile && !projectInView(card)) panToProject(card);
        card.querySelector("[data-open]").focus({ preventScroll: true });
      });

      // 04 — Filtering, recentering and a persistent color theme.
      function closeFilters() { $("#filter-panel").prop("hidden", true); $("#filter-toggle").attr("aria-expanded", "false"); }
      $("#filter-toggle").on("click", function () {
        const open = this.getAttribute("aria-expanded") === "true";
        $(this).attr("aria-expanded", String(!open)); $("#filter-panel").prop("hidden", open);
      });
      $doc.on("pointerdown", e => { if (!e.target.closest(".filter-wrap")) closeFilters(); });
      $("[data-filter]").on("click", function () {
        category = this.dataset.filter; activeIndex = 0;
        $("[data-filter]").each(function () { $(this).attr("aria-pressed", String(this.dataset.filter === category)); });
        closeFilters(); home();
        const first = visibleCards()[0];
        if (!mobile && first && !projectInView(first)) panToProject(first);
        announce(`${visibleCards().length} projects shown.`);
        $("#filter-toggle").trigger("focus");
      });
      $("#reset-view").on("click", () => {
        category = "all"; activeIndex = 0;
        $("[data-filter]").each(function () { $(this).attr("aria-pressed", String(this.dataset.filter === "all")); });
        closeFilters(); home(); toast("A fresh desk. Make yourself at home.");
      });
      function syncTheme() {
        const light = document.documentElement.dataset.theme === "light";
        $("#theme-toggle").attr("aria-pressed", String(light)).attr("title", light ? "Switch to dark mode" : "Switch to light mode");
        $("#theme-label").text(light ? "Dark" : "Light");
        $("meta[name='theme-color']").attr("content", light ? "#e7e5de" : "#0e0e10");
      }
      $("#theme-toggle").on("click", () => {
        const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = theme;
        try { localStorage.setItem("fieldwork-theme", theme); } catch (_) { /* The theme still works without storage. */ }
        syncTheme(); announce(`${theme === "light" ? "Light" : "Dark"} mode enabled.`);
      });

      // 05 — Native dialog, animated exit, stable focus and a real clipboard fallback.
      function openDrawer(id, opener) {
        const template = document.getElementById(id);
        if (!template || template.tagName !== "TEMPLATE") return;
        if ($body.hasClass("is-entering")) finishEntrance();
        clearTimeout(closeTimer); cancelInteractions(); pieces.forEach(stop); stop(camera);
        closeFilters(); hidePreview(); hideCursor(); returnFocus = opener;
        document.getElementById("drawer-content").replaceChildren(template.content.cloneNode(true));
        // Each view owns its label; project views always reset to their original label.
        document.getElementById("drawer-kicker").textContent = template.dataset.drawerLabel || "FIELDWORK / INSPECT";
        if (!drawer.open) drawer.showModal();
        drawer.scrollTop = 0;
        requestAnimationFrame(() => requestAnimationFrame(() => drawer.classList.add("is-open")));
        document.getElementById("close-drawer").focus({ preventScroll: true });
        bindImageFallbacks(drawer);
      }
      function closeDrawer() {
        if (!drawer.open) return;
        drawer.classList.remove("is-open");
        clearTimeout(closeTimer);
        closeTimer = setTimeout(() => {
          document.body.appendChild(document.getElementById("toast"));
          drawer.close();
          if (returnFocus && returnFocus.isConnected && returnFocus.getClientRects().length && !returnFocus.closest("[inert],[hidden]")) {
            const card = returnFocus.closest(".project");
            if (!mobile && card && !projectInView(card)) panToProject(card);
            returnFocus.focus({ preventScroll: true });
          } else document.getElementById("about-button").focus({ preventScroll: true });
        }, reducedMotion.matches ? 0 : 430);
      }
      $doc.on("click", "[data-open]", function () { openDrawer(this.dataset.open, this); });
      $("#close-drawer").on("click", closeDrawer);
      $(drawer).on("cancel", e => { e.preventDefault(); closeDrawer(); }).on("click", function (e) {
        if (e.target === drawer && e.clientX < drawer.getBoundingClientRect().left) closeDrawer();
      }).on("keydown", function (e) {
        if (e.key !== "Tab") return;
        const list = [...drawer.querySelectorAll("button,a[href],[tabindex='0']")].filter(el => !el.disabled && el.getClientRects().length);
        const first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
      $doc.on("keydown", e => {
        if (e.key === "Escape" && !$("#filter-panel").prop("hidden")) { closeFilters(); $("#filter-toggle").trigger("focus"); }
      });
      function toast(message) {
        clearTimeout(toastTimer);
        const el = document.getElementById("toast");
        (drawer.open ? drawer : document.body).appendChild(el);
        $(el).text(message).addClass("is-visible");
        toastTimer = setTimeout(() => $(el).removeClass("is-visible"), 3200);
      }
      $doc.on("click", "[data-copy-email]", async function () {
        const emailElement = document.getElementById("contact-email");
        const email = emailElement.textContent.trim();
        let copied = false;
        try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(email); copied = true; } } catch (_) { /* Try the selection-based fallback. */ }
        if (!copied) {
          const input = document.createElement("textarea");
          input.value = email; input.setAttribute("readonly", "");
          input.style.cssText = "position:fixed;opacity:0;left:0;top:0;font-size:16px";
          (drawer.open ? drawer : document.body).appendChild(input); input.select();
          try { copied = document.execCommand("copy"); } catch (_) { copied = false; }
          input.remove(); if (this.isConnected && drawer.open) this.focus({ preventScroll: true });
        }
        if (!copied && emailElement.isConnected && drawer.open) {
          const range = document.createRange(); range.selectNodeContents(emailElement);
          const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        }
        toast(copied ? "Email copied. Say hello." : "Select the email address and copy it manually.");
      });

      // 06 — Scramble is visual only: accessible names are stable in the HTML.
      function scramble(el) {
        if (reducedMotion.matches || scrambles.has(el)) return;
        const original = el.textContent, start = performance.now(), alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/<>";
        const state = { original, frame: 0 }; scrambles.set(el, state);
        function tick(now) {
          const progress = clamp((now - start) / 340, 0, 1);
          el.textContent = [...original].map((char, i) => /\s/.test(char) || i < progress * original.length ? char : alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
          if (progress < 1 && el.isConnected) state.frame = requestAnimationFrame(tick);
          else { el.textContent = original; scrambles.delete(el); }
        }
        state.frame = requestAnimationFrame(tick);
      }
      $doc.on("mouseenter focusin", "a,button", function () { $(this).find("[data-scramble]").each(function () { scramble(this); }); });

      // 07 — Hover magnifier and image parallax, available only to fine pointers.
      function effectsAllowed() { return !mobile && finePointer.matches && !reducedMotion.matches && !drawer.open && !$body.hasClass("is-entering"); }
      function hidePreview() { $preview.removeClass("is-visible"); }
      function positionPreview(e) {
        const width = 318, x = e.clientX + width + 40 < innerWidth ? e.clientX + 32 : e.clientX - width - 32;
        $preview.css({ "--preview-x": `${clamp(x, 16, innerWidth - width - 16)}px`, "--preview-y": `${clamp(e.clientY - 190, 85, innerHeight - 260)}px` });
        $preview.find("img").css({ "--px": `${-5 + (e.clientX / innerWidth - .5) * 5}%`, "--py": `${-5 + (e.clientY / innerHeight - .5) * 5}%` });
      }
      $doc.on("mouseenter", "[data-preview]", function (e) {
        if (!effectsAllowed() || gesture) return;
        $preview.find("img").attr("src", this.dataset.preview); positionPreview(e); $preview.addClass("is-visible");
      }).on("mousemove", "[data-preview]", e => { if (effectsAllowed()) positionPreview(e); })
        .on("mouseleave", "[data-preview]", hidePreview);
      $doc.on("pointermove", ".project-image", function (event) {
        if (!effectsAllowed()) return;
        const r = this.getBoundingClientRect(), e = event.originalEvent;
        $(this).css({ "--image-x": `${(e.clientX - r.left - r.width / 2) * .02}px`, "--image-y": `${(e.clientY - r.top - r.height / 2) * .02}px` });
      }).on("pointerleave", ".project-image", function () { $(this).css({ "--image-x": "0px", "--image-y": "0px" }); });

      // 08 — Magnetic cursor; rAF stops when the cursor reaches its target.
      function hideCursor() { $body.removeClass("cursor-active"); cancelAnimationFrame(cursorFrame); cursorFrame = 0; cursor.initialized = false; }
      function cursorTick() {
        cursor.x += (cursor.tx - cursor.x) * .25; cursor.y += (cursor.ty - cursor.y) * .25;
        $cursor.css({ left: `${cursor.x}px`, top: `${cursor.y}px` });
        cursorFrame = Math.hypot(cursor.tx - cursor.x, cursor.ty - cursor.y) > .2 ? requestAnimationFrame(cursorTick) : 0;
      }
      $doc.on("pointermove", function (event) {
        const e = event.originalEvent;
        if (!effectsAllowed() || e.pointerType !== "mouse") { hideCursor(); return; }
        const magnet = e.target.closest("[data-magnet]"), target = e.target.closest("[data-cursor]");
        cursor.tx = e.clientX; cursor.ty = e.clientY;
        if (magnet) {
          const r = magnet.getBoundingClientRect();
          cursor.tx += (r.left + r.width / 2 - e.clientX) * .22; cursor.ty += (r.top + r.height / 2 - e.clientY) * .22;
        }
        if (!cursor.initialized) { cursor.x = cursor.tx; cursor.y = cursor.ty; cursor.initialized = true; }
        const mode = gesture && gesture.moved ? "DRAG" : target ? target.dataset.cursor : e.target.closest("a,button") ? "OPEN" : "";
        $cursor.attr("data-mode", mode).find("span").text(mode); $body.addClass("cursor-active");
        if (!cursorFrame) cursorFrame = requestAnimationFrame(cursorTick);
      }).on("mouseleave", hideCursor);
      $doc.on("pointermove", "[data-magnet]", function (event) {
        if (!effectsAllowed()) return;
        const r = this.getBoundingClientRect(), e = event.originalEvent;
        $(this).css({ "--mx": `${(e.clientX - r.left - r.width / 2) * .14}px`, "--my": `${(e.clientY - r.top - r.height / 2) * .14}px` });
      }).on("pointerleave", "[data-magnet]", function () { $(this).css({ "--mx": "0px", "--my": "0px" }); });

      // 09 — Lifecycle cleanup and graceful asset failure.
      function bindImageFallbacks(root) {
        root.querySelectorAll("img").forEach(img => {
          img.addEventListener("error", () => img.classList.add("asset-failed"));
          img.addEventListener("load", () => img.classList.remove("asset-failed"));
          if (img.complete && img.getAttribute("src") && !img.naturalWidth) img.classList.add("asset-failed");
        });
      }
      function suspend() { if ($body.hasClass("is-entering")) finishEntrance(); cancelAnimationFrame(focusFrame); focusFrame = 0; cancelInteractions(); pieces.forEach(stop); stop(camera); hideCursor(); hidePreview(); }
      $(window).on("blur", suspend).on("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => home(true), 120); });
      $doc.on("visibilitychange", () => { if (document.hidden) suspend(); });
      touchLayout.addEventListener("change", () => home(true));
      finePointer.addEventListener("change", hideCursor);
      reducedMotion.addEventListener("change", () => {
        suspend(); scrambles.forEach((state, el) => { cancelAnimationFrame(state.frame); el.textContent = state.original; }); scrambles.clear();
        $("[data-magnet]").css({ "--mx": "0px", "--my": "0px" });
      });
      bindImageFallbacks(document); syncTheme(); syncFilterCounts(); home(); $body.addClass("is-ready"); playEntrance();
    });
  }

  // The CDN is primary. The downloadable archive also includes the identical local version.
  if (window.jQuery) boot(window.jQuery);
  else {
    const fallback = document.createElement("script");
    fallback.src = "assets/jquery-3.7.1.min.js";
    fallback.onload = () => boot(window.jQuery);
    fallback.onerror = () => {
      clearTimeout(window.fieldworkEntryFallback);
      if (window.fieldworkRevealPending) window.fieldworkRevealPending();
      document.documentElement.dataset.entry = "ready";
      const notice = document.createElement("p"); notice.className = "load-notice";
      notice.textContent = "The workspace could not start. Check your connection or the local jQuery file. Email: mohiedineabassi@gmail.com";
      document.body.appendChild(notice);
    };
    document.head.appendChild(fallback);
  }
})();