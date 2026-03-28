(function () {
  "use strict";

  var postsListEl = document.getElementById("posts-list");
  var btnAddPost = document.getElementById("btn-add-post");
  var adminMessage = document.getElementById("admin-message");

  var postModal = document.getElementById("post-modal");
  var modalTitle = document.getElementById("modal-title");
  var fieldTitle = document.getElementById("field-title");
  var fieldSlug = document.getElementById("field-slug");
  var fieldDate = document.getElementById("field-date");
  var fieldBody = document.getElementById("field-body");
  var modalImagesList = document.getElementById("modal-images-list");
  var modalFileInput = document.getElementById("modal-file-input");
  var btnModalCancel = document.getElementById("btn-modal-cancel");
  var btnModalApply = document.getElementById("btn-modal-apply");

  /** @type {Array} */
  var posts = [];

  /** Map of repo-relative path -> File (pending upload) */
  var pendingFiles = new Map();

  /** True when GET /api/posts succeeded (Express dev server); false if only static data/posts.json loaded */
  var canUseSaveApi = false;

  /** Draft while modal is open */
  var modalDraft = null;

  /** True when modal is adding a new post */
  var modalIsNew = false;

  /** Index in posts when editing; -1 when adding */
  var modalEditIndex = -1;

  /** For new posts: slug tracks title until the user edits the slug field */
  var slugManuallyEdited = false;

  var lastFocusBeforeModal = null;

  function setMessage(text) {
    adminMessage.textContent = text || "";
  }

  function sanitizeSlug(s) {
    var t = String(s || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return t || "post";
  }

  function safeFilename(name) {
    var base = String(name || "image").replace(/^.*[/\\]/, "");
    base = base.replace(/[^a-zA-Z0-9._-]/g, "_");
    return base || "image";
  }

  function uniqueFilename(desired, used) {
    if (!used.has(desired)) return desired;
    var m = /^(.+?)(\.[^.]+)?$/.exec(desired);
    var stem = m ? m[1] : desired;
    var ext = m && m[2] ? m[2] : "";
    var n = 2;
    var candidate;
    do {
      candidate = stem + "-" + n + ext;
      n += 1;
    } while (used.has(candidate));
    return candidate;
  }

  function normalizePost(p) {
    return {
      id: p.id || "post-" + Date.now(),
      slug: sanitizeSlug(p.slug),
      title: p.title || "",
      date: p.date || new Date().toISOString().slice(0, 10),
      body: p.body || "",
      images: Array.isArray(p.images) ? p.images.slice() : [],
    };
  }

  function normalizePosts(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizePost);
  }

  function sortByDateDesc(arr) {
    return arr
      .map(function (p, i) {
        return { p: p, i: i };
      })
      .sort(function (a, b) {
        return (b.p.date || "").localeCompare(a.p.date || "");
      });
  }

  function formatDateLabel(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso + "T12:00:00");
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch (e) {
      return iso;
    }
  }

  function viewSiteHref(slug) {
    return "index.html#post-" + sanitizeSlug(slug);
  }

  function syncDraftFromForm() {
    if (!modalDraft) return;
    modalDraft.title = fieldTitle.value;
    modalDraft.slug = sanitizeSlug(fieldSlug.value);
    fieldSlug.value = modalDraft.slug;
    modalDraft.date = fieldDate.value;
    modalDraft.body = fieldBody.value;
  }

  function fillFormFromDraft() {
    if (!modalDraft) return;
    fieldTitle.value = modalDraft.title || "";
    fieldSlug.value = modalDraft.slug || "";
    fieldDate.value = modalDraft.date || "";
    fieldBody.value = modalDraft.body || "";
  }

  function renderModalImages() {
    modalImagesList.innerHTML = "";
    if (!modalDraft) return;
    var imgs = modalDraft.images || [];
    imgs.forEach(function (rel, imgIdx) {
      var li = document.createElement("li");
      li.className = "admin-images__row";
      var span = document.createElement("span");
      span.className =
        "admin-images__path" + (pendingFiles.has(rel) ? " admin-images__path--pending" : "");
      span.textContent = rel + (pendingFiles.has(rel) ? " (pending save)" : "");

      var up = document.createElement("button");
      up.type = "button";
      up.className = "admin-icon-btn";
      up.textContent = "↑";
      up.setAttribute("aria-label", "Move image up");
      up.disabled = imgIdx === 0;
      up.addEventListener("click", function () {
        moveModalImage(imgIdx, -1);
      });

      var down = document.createElement("button");
      down.type = "button";
      down.className = "admin-icon-btn";
      down.textContent = "↓";
      down.setAttribute("aria-label", "Move image down");
      down.disabled = imgIdx === imgs.length - 1;
      down.addEventListener("click", function () {
        moveModalImage(imgIdx, 1);
      });

      var rm = document.createElement("button");
      rm.type = "button";
      rm.className = "admin-icon-btn admin-danger";
      rm.textContent = "×";
      rm.setAttribute("aria-label", "Remove image");
      rm.addEventListener("click", function () {
        removeModalImage(rel);
      });

      li.appendChild(span);
      li.appendChild(up);
      li.appendChild(down);
      li.appendChild(rm);
      modalImagesList.appendChild(li);
    });
  }

  function moveModalImage(imageIndex, delta) {
    if (!modalDraft || !modalDraft.images) return;
    var j = imageIndex + delta;
    if (j < 0 || j >= modalDraft.images.length) return;
    var tmp = modalDraft.images[j];
    modalDraft.images[j] = modalDraft.images[imageIndex];
    modalDraft.images[imageIndex] = tmp;
    renderModalImages();
  }

  function removeModalImage(relPath) {
    if (!modalDraft) return;
    modalDraft.images = (modalDraft.images || []).filter(function (x) {
      return x !== relPath;
    });
    pendingFiles.delete(relPath);
    renderModalImages();
  }

  function handleModalFiles(fileList) {
    syncDraftFromForm();
    var slug = sanitizeSlug(fieldSlug.value);
    if (!slug) {
      slug = sanitizeSlug(fieldTitle.value);
    }
    if (!slug) {
      setMessage("Set a post title or URL (slug) before adding images.");
      return;
    }
    modalDraft.slug = slug;
    fieldSlug.value = slug;

    var used = new Set();
    modalDraft.images.forEach(function (rel) {
      used.add(rel.split("/").pop());
    });

    var files = Array.prototype.slice.call(fileList);
    for (var i = 0; i < files.length; i++) {
      var raw = safeFilename(files[i].name);
      var name = uniqueFilename(raw, used);
      used.add(name);
      var rel = "assets/posts/" + slug + "/" + name;
      modalDraft.images.push(rel);
      pendingFiles.set(rel, files[i]);
    }
    setMessage("");
    renderModalImages();
  }

  function showModal() {
    lastFocusBeforeModal = document.activeElement;
    postModal.hidden = false;
    postModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("admin-modal-open");
    window.setTimeout(function () {
      fieldTitle.focus();
    }, 0);
  }

  function closeModal() {
    postModal.hidden = true;
    postModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("admin-modal-open");
    modalDraft = null;
    modalIsNew = false;
    modalEditIndex = -1;
    modalFileInput.value = "";
    if (lastFocusBeforeModal && typeof lastFocusBeforeModal.focus === "function") {
      lastFocusBeforeModal.focus();
    }
  }

  function openNewModal() {
    setMessage("");
    modalIsNew = true;
    slugManuallyEdited = false;
    modalEditIndex = -1;
    modalDraft = {
      id: "post-" + Date.now(),
      slug: "",
      title: "",
      date: new Date().toISOString().slice(0, 10),
      body: "",
      images: [],
    };
    modalTitle.textContent = "New post";
    fillFormFromDraft();
    renderModalImages();
    showModal();
  }

  function openEditModal(index) {
    setMessage("");
    var p = posts[index];
    if (!p) return;
    modalIsNew = false;
    modalEditIndex = index;
    modalDraft = {
      id: p.id,
      slug: p.slug,
      title: p.title,
      date: p.date,
      body: p.body,
      images: (p.images || []).slice(),
    };
    slugManuallyEdited =
      sanitizeSlug(p.slug) !== sanitizeSlug(p.title || "");
    modalTitle.textContent = "Edit post";
    fillFormFromDraft();
    renderModalImages();
    showModal();
  }

  async function applyModal() {
    if (!modalDraft) return;
    syncDraftFromForm();
    var normalized = normalizePost(modalDraft);
    if (!normalized.slug) {
      setMessage("Post URL (slug) is required.");
      fieldSlug.focus();
      return;
    }

    var nextPosts = posts.slice();
    if (modalIsNew) {
      nextPosts.unshift(normalized);
    } else if (modalEditIndex >= 0) {
      nextPosts[modalEditIndex] = normalized;
    }

    if (!canUseSaveApi) {
      posts = nextPosts;
      closeModal();
      setMessage("");
      renderPostList();
      return;
    }

    btnModalApply.disabled = true;
    btnModalCancel.disabled = true;
    setMessage("Saving…");
    try {
      var ok = await persistPostsToDisk(nextPosts);
      if (ok) {
        posts = nextPosts;
        closeModal();
        renderPostList();
      }
    } finally {
      btnModalApply.disabled = false;
      btnModalCancel.disabled = false;
    }
  }

  async function removePost(index) {
    var p = posts[index];
    if (!p) return;
    var backup = posts.slice();
    if (p.images) {
      p.images.forEach(function (rel) {
        pendingFiles.delete(rel);
      });
    }
    posts.splice(index, 1);
    renderPostList();

    if (!canUseSaveApi) return;

    setMessage("Saving…");
    var ok = await persistPostsToDisk(posts);
    if (!ok) {
      posts = backup;
      renderPostList();
    }
  }

  function renderPostList() {
    postsListEl.innerHTML = "";
    if (!posts.length) {
      var empty = document.createElement("p");
      empty.className = "admin-help";
      empty.textContent = "No posts yet. Click “Add new post” to plant one.";
      postsListEl.appendChild(empty);
      return;
    }

    var ordered = sortByDateDesc(posts);
    ordered.forEach(function (item) {
      var p = item.p;
      var idx = item.i;
      var row = document.createElement("article");
      row.className = "admin-post-row";

      var main = document.createElement("div");
      main.className = "admin-post-row__main";
      var h = document.createElement("h2");
      h.className = "admin-post-row__title";
      h.textContent = p.title.trim() || "Untitled post";
      var meta = document.createElement("p");
      meta.className = "admin-post-row__meta";
      meta.textContent = formatDateLabel(p.date) + " · /" + sanitizeSlug(p.slug);
      main.appendChild(h);
      main.appendChild(meta);

      var actions = document.createElement("div");
      actions.className = "admin-post-row__actions";

      var view = document.createElement("a");
      view.className = "admin-btn admin-btn--link";
      view.href = viewSiteHref(p.slug);
      view.textContent = "View on site";

      var edit = document.createElement("button");
      edit.type = "button";
      edit.className = "admin-btn";
      edit.textContent = "Edit";
      edit.addEventListener("click", function () {
        openEditModal(idx);
      });

      var del = document.createElement("button");
      del.type = "button";
      del.className = "admin-btn admin-danger";
      del.textContent = "Delete";
      del.addEventListener("click", function () {
        if (window.confirm("Delete this post?")) removePost(idx);
      });

      actions.appendChild(view);
      actions.appendChild(edit);
      actions.appendChild(del);

      row.appendChild(main);
      row.appendChild(actions);
      postsListEl.appendChild(row);
    });
  }

  function serializePostsArray(arr) {
    return JSON.stringify(arr, null, 2) + "\n";
  }

  /**
   * Writes postsToWrite and pending image uploads to disk via POST /api/save.
   * @param {Array} postsToWrite
   * @returns {Promise<boolean>}
   */
  async function persistPostsToDisk(postsToWrite) {
    setMessage("");
    try {
      if (!canUseSaveApi) {
        setMessage(
          "Saving needs the dev server. Run npm start from the repo root, then open " +
            adminUrlHint() +
            " (or the URL printed in the terminal) and reload this page."
        );
        return false;
      }
      for (var i = 0; i < postsToWrite.length; i++) {
        if (!postsToWrite[i].slug) {
          setMessage("Each post needs a URL (slug).");
          return false;
        }
      }

      var fd = new FormData();
      fd.append("posts", serializePostsArray(postsToWrite));
      var pathList = [];
      pendingFiles.forEach(function (file, rel) {
        pathList.push(rel);
      });
      fd.append("paths", JSON.stringify(pathList));
      pathList.forEach(function (rel) {
        var file = pendingFiles.get(rel);
        if (file) fd.append("images", file);
      });

      var res = await fetch("/api/save", {
        method: "POST",
        body: fd,
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        setMessage("Save failed: " + (data.error || res.statusText));
        return false;
      }
      pendingFiles.clear();
      setMessage(
        "Saved to data/posts.json" + (pathList.length ? " and " + pathList.length + " image(s)." : ".")
      );
      return true;
    } catch (e) {
      console.error(e);
      setMessage("Save failed: " + (e.message || String(e)));
      return false;
    }
  }

  function adminUrlHint() {
    try {
      if (window.location.protocol === "file:") {
        return "http://127.0.0.1:8080/admin.html";
      }
      return window.location.origin + window.location.pathname.replace(/[^/]*$/, "admin.html");
    } catch (e) {
      return "http://127.0.0.1:8080/admin.html";
    }
  }

  async function checkSaveApiAvailable() {
    try {
      var h = await fetch("/api/health");
      return h.ok;
    } catch (e) {
      return false;
    }
  }

  async function loadPosts() {
    setMessage("Loading…");
    canUseSaveApi = false;

    var loaded = false;

    try {
      var resData = await fetch("data/posts.json");
      if (resData.ok) {
        posts = normalizePosts(await resData.json());
        loaded = true;
      }
    } catch (e) {
      console.error(e);
    }

    if (!loaded) {
      try {
        var resApi = await fetch("/api/posts");
        if (resApi.ok) {
          posts = normalizePosts(await resApi.json());
          loaded = true;
        }
      } catch (e2) {
        console.error(e2);
      }
    }

    if (!loaded) {
      posts = [];
      setMessage(
        "Could not load posts. From the repo root run npm start and open " +
          adminUrlHint() +
          ". If you already use a static server, ensure data/posts.json is served. Opening admin.html as a file (file://) will not work."
      );
      renderPostList();
      return;
    }

    canUseSaveApi = await checkSaveApiAvailable();

    if (canUseSaveApi) {
      setMessage("");
    } else {
      setMessage(
        "Posts loaded. Saving to disk needs the dev server: run npm start from the repo root, then open " +
          adminUrlHint() +
          " (or the URL printed in the terminal) and reload this page."
      );
    }
    renderPostList();
  }

  btnAddPost.addEventListener("click", openNewModal);

  btnModalCancel.addEventListener("click", closeModal);
  btnModalApply.addEventListener("click", applyModal);

  postModal.querySelectorAll("[data-modal-close]").forEach(function (el) {
    el.addEventListener("click", closeModal);
  });

  modalFileInput.addEventListener("change", function () {
    if (modalFileInput.files && modalFileInput.files.length) {
      handleModalFiles(modalFileInput.files);
      modalFileInput.value = "";
    }
  });

  document.addEventListener("keydown", function (e) {
    if (postModal.hidden) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeModal();
    }
  });

  fieldTitle.addEventListener("input", function () {
    if (!modalDraft || slugManuallyEdited) return;
    var s = sanitizeSlug(fieldTitle.value);
    fieldSlug.value = s;
    modalDraft.slug = s;
  });

  fieldSlug.addEventListener("input", function () {
    if (modalDraft) slugManuallyEdited = true;
  });

  loadPosts();
})();
