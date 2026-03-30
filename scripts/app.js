(function () {
  "use strict";

  function isLocalDevHost() {
    var h = window.location.hostname;
    return (
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "::1" ||
      h === "[::1]"
    );
  }

  var headerAdminLink = document.getElementById("header-admin-link");
  if (headerAdminLink && isLocalDevHost()) {
    headerAdminLink.hidden = false;
  }

  var postsStatus = document.getElementById("posts-status");
  var postsList = document.getElementById("posts-list");
  var carouselEl = document.getElementById("carousel");
  var carouselImage = document.getElementById("carousel-image");
  var carouselCounter = document.getElementById("carousel-counter");
  var btnPrev = document.getElementById("carousel-prev");
  var btnNext = document.getElementById("carousel-next");

  var state = {
    postImages: [],
    imageIndex: 0,
    lastFocus: null,
    activePostSlug: "",
    suppressHashSync: false,
    postsData: [],
  };

  function sortByDateDesc(posts) {
    return posts.slice().sort(function (a, b) {
      return (b.date || "").localeCompare(a.date || "");
    });
  }

  function sanitizeSlug(s) {
    var t = String(s || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return t || "post";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  if (typeof marked !== "undefined" && marked.setOptions) {
    marked.setOptions({ gfm: true, breaks: true });
  }

  function renderBody(body) {
    if (!body) return "";
    var raw = String(body);
    if (typeof marked === "undefined" || typeof DOMPurify === "undefined") {
      return raw
        .split("\n")
        .map(function (line) {
          return "<p>" + escapeHtml(line) + "</p>";
        })
        .join("");
    }
    var html = marked.parse(raw);
    return DOMPurify.sanitize(html);
  }

  function getPostAnchor(slug) {
    return "post-" + sanitizeSlug(slug);
  }

  function getImageHash(slug, index) {
    return (
      "#image-" +
      encodeURIComponent(sanitizeSlug(slug)) +
      "-" +
      encodeURIComponent(String(index + 1))
    );
  }

  function parseImageHash(hash) {
    var raw = String(hash || "").replace(/^#/, "");
    var m = raw.match(/^image-([a-z0-9-]+)-([0-9]+)$/);
    if (!m) return null;
    var slug = decodeURIComponent(m[1] || "");
    var oneBased = parseInt(decodeURIComponent(m[2] || "0"), 10);
    if (!slug || !Number.isFinite(oneBased) || oneBased < 1) return null;
    return { slug: slug, index: oneBased - 1 };
  }

  function replaceHash(hash) {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, "", hash);
      return;
    }
    window.location.hash = hash.replace(/^#/, "");
  }

  function syncCarouselHash() {
    if (state.suppressHashSync) return;
    if (!state.postImages.length || !state.activePostSlug) return;
    replaceHash(getImageHash(state.activePostSlug, state.imageIndex));
  }

  function openCarousel(postImages, startIndex, triggerEl, postSlug) {
    if (!postImages || !postImages.length) return;
    state.postImages = postImages;
    state.imageIndex = Math.max(0, Math.min(startIndex, postImages.length - 1));
    state.lastFocus = triggerEl || document.activeElement;
    state.activePostSlug = sanitizeSlug(postSlug || "");

    carouselEl.hidden = false;
    carouselEl.setAttribute("aria-hidden", "false");
    document.body.classList.add("carousel-open");
    requestAnimationFrame(function () {
      carouselEl.classList.add("carousel--open");
    });

    updateCarouselSlide();
    syncCarouselHash();
    var closeBtn = carouselEl.querySelector(".carousel__close");
    if (closeBtn) closeBtn.focus();
  }

  function closeCarousel() {
    carouselEl.classList.remove("carousel--open");
    carouselEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("carousel-open");

    var restore = state.lastFocus;
    var postAnchor = state.activePostSlug
      ? "#" + getPostAnchor(state.activePostSlug)
      : "#posts";
    state.postImages = [];
    state.imageIndex = 0;
    state.activePostSlug = "";
    if (!state.suppressHashSync) {
      replaceHash(postAnchor);
    }

    window.setTimeout(function () {
      carouselEl.hidden = true;
      if (restore && typeof restore.focus === "function") {
        restore.focus();
      }
    }, 200);
  }

  function updateCarouselSlide() {
    var urls = state.postImages;
    var i = state.imageIndex;
    if (!urls.length) return;
    var src = urls[i];
    carouselImage.src = src;
    carouselImage.alt = "Photo " + (i + 1) + " of " + urls.length;
    carouselCounter.textContent = i + 1 + " / " + urls.length;
    syncCarouselHash();

    btnPrev.disabled = urls.length <= 1;
    btnNext.disabled = urls.length <= 1;
    btnPrev.setAttribute("aria-disabled", btnPrev.disabled ? "true" : "false");
    btnNext.setAttribute("aria-disabled", btnNext.disabled ? "true" : "false");
  }

  function showPrev() {
    if (state.postImages.length <= 1) return;
    state.imageIndex =
      (state.imageIndex - 1 + state.postImages.length) % state.postImages.length;
    updateCarouselSlide();
  }

  function showNext() {
    if (state.postImages.length <= 1) return;
    state.imageIndex = (state.imageIndex + 1) % state.postImages.length;
    updateCarouselSlide();
  }

  function getFocusableInCarousel() {
    var closeBtn = carouselEl.querySelector(".carousel__close");
    return [closeBtn, btnPrev, btnNext].filter(function (el) {
      return el && !el.disabled;
    });
  }

  function trapTabKey(e) {
    if (e.key !== "Tab" || carouselEl.hidden) return;
    var focusables = getFocusableInCarousel();
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function onKeyDown(e) {
    if (carouselEl.hidden) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeCarousel();
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      showPrev();
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      showNext();
      return;
    }
    trapTabKey(e);
  }

  function renderPosts(posts) {
    postsList.innerHTML = "";
    var sorted = sortByDateDesc(posts);

    sorted.forEach(function (post) {
      var article = document.createElement("article");
      article.className = "post";
      article.id = "post-" + sanitizeSlug(post.slug);

      var header = document.createElement("header");
      header.className = "post__header";
      var title = document.createElement("h2");
      title.className = "post__title";
      title.textContent = post.title || "Untitled";
      var dateEl = document.createElement("p");
      dateEl.className = "post__date";
      dateEl.textContent = formatDate(post.date);
      header.appendChild(title);
      header.appendChild(dateEl);

      var bodyWrap = document.createElement("div");
      bodyWrap.className = "post__body";
      bodyWrap.innerHTML = renderBody(post.body);

      var grid = document.createElement("ul");
      grid.className = "photo-grid";
      var images = Array.isArray(post.images) ? post.images : [];
      var n = images.length;
      if (n) {
        grid.setAttribute("data-count", String(n));
        if (n >= 4) {
          grid.classList.add("photo-grid--cols-2");
        }
        if (n >= 5 && n % 2 === 1) {
          grid.classList.add("photo-grid--tail-full");
        }
      }

      images.forEach(function (src, idx) {
        var li = document.createElement("li");
        li.className = "photo-grid__item";
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "photo-grid__btn";
        btn.setAttribute(
          "aria-label",
          "Open photo " + (idx + 1) + " of " + images.length + " for " + (post.title || "post")
        );
        var img = document.createElement("img");
        img.src = src;
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        btn.appendChild(img);
        btn.addEventListener("click", function () {
          openCarousel(images, idx, btn, post.slug);
        });
        li.appendChild(btn);
        grid.appendChild(li);
      });

      article.appendChild(header);
      article.appendChild(bodyWrap);
      if (images.length) article.appendChild(grid);
      postsList.appendChild(article);
    });

    postsStatus.hidden = true;
    postsList.hidden = false;
  }

  function formatDate(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso + "T12:00:00");
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch (err) {
      return iso;
    }
  }

  function showError(message) {
    postsStatus.textContent = message;
    postsStatus.hidden = false;
    postsList.hidden = true;
  }

  btnPrev.addEventListener("click", showPrev);
  btnNext.addEventListener("click", showNext);

  carouselEl.addEventListener("click", function (e) {
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute("data-carousel-close") !== null) {
      closeCarousel();
    }
  });

  document.addEventListener("keydown", onKeyDown);

  function findPostBySlug(posts, slug) {
    var target = sanitizeSlug(slug);
    for (var i = 0; i < posts.length; i += 1) {
      if (sanitizeSlug(posts[i] && posts[i].slug) === target) {
        return posts[i];
      }
    }
    return null;
  }

  function handleDeepLink(posts) {
    var parsed = parseImageHash(window.location.hash || "");
    if (!parsed) {
      if (!carouselEl.hidden) {
        state.suppressHashSync = true;
        closeCarousel();
        state.suppressHashSync = false;
      }
      return;
    }
    var post = findPostBySlug(posts, parsed.slug);
    if (!post) return;
    var images = Array.isArray(post.images) ? post.images : [];
    if (!images.length) return;
    var idx = Math.max(0, Math.min(parsed.index, images.length - 1));
    if (
      !carouselEl.hidden &&
      state.activePostSlug === sanitizeSlug(post.slug) &&
      state.postImages.length === images.length
    ) {
      state.imageIndex = idx;
      updateCarouselSlide();
      return;
    }
    state.suppressHashSync = true;
    openCarousel(images, idx, null, post.slug);
    state.suppressHashSync = false;
    syncCarouselHash();
  }

  window.addEventListener("hashchange", function () {
    if (!state.postsData.length) return;
    handleDeepLink(state.postsData);
  });

  fetch("data/posts.json")
    .then(function (res) {
      if (!res.ok) throw new Error("Could not load posts (" + res.status + ").");
      return res.json();
    })
    .then(function (data) {
      if (!Array.isArray(data) || data.length === 0) {
        showError("No posts yet.");
        return;
      }
      state.postsData = data;
      renderPosts(data);
      handleDeepLink(data);
    })
    .catch(function () {
      showError(
        "Could not load posts. Run a local server from this folder (see README) or check that data/posts.json exists."
      );
    });
})();
