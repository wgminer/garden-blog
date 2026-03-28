(function () {
  "use strict";

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
  };

  function sortByDateDesc(posts) {
    return posts.slice().sort(function (a, b) {
      return (b.date || "").localeCompare(a.date || "");
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderBody(body) {
    if (!body) return "";
    var parts = String(body).split("\n");
    return parts
      .map(function (line) {
        return "<p>" + escapeHtml(line) + "</p>";
      })
      .join("");
  }

  function openCarousel(postImages, startIndex, triggerEl) {
    if (!postImages || !postImages.length) return;
    state.postImages = postImages;
    state.imageIndex = Math.max(0, Math.min(startIndex, postImages.length - 1));
    state.lastFocus = triggerEl || document.activeElement;

    carouselEl.hidden = false;
    carouselEl.setAttribute("aria-hidden", "false");
    document.body.classList.add("carousel-open");
    requestAnimationFrame(function () {
      carouselEl.classList.add("carousel--open");
    });

    updateCarouselSlide();
    var closeBtn = carouselEl.querySelector(".carousel__close");
    if (closeBtn) closeBtn.focus();
  }

  function closeCarousel() {
    carouselEl.classList.remove("carousel--open");
    carouselEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("carousel-open");

    var restore = state.lastFocus;
    state.postImages = [];
    state.imageIndex = 0;

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
          openCarousel(images, idx, btn);
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
      renderPosts(data);
    })
    .catch(function () {
      showError(
        "Could not load posts. Run a local server from this folder (see README) or check that data/posts.json exists."
      );
    });
})();
