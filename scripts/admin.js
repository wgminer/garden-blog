(function () {
  "use strict";

  var postsEditor = document.getElementById("posts-editor");
  var btnPickFolder = document.getElementById("btn-pick-folder");
  var btnLoadServer = document.getElementById("btn-load-server");
  var btnAddPost = document.getElementById("btn-add-post");
  var btnSave = document.getElementById("btn-save");
  var folderStatus = document.getElementById("folder-status");
  var adminMessage = document.getElementById("admin-message");

  /** @type {FileSystemDirectoryHandle | null} */
  var rootHandle = null;

  /** Post shape matching data/posts.json */
  var posts = [];

  /** Map of repo-relative path -> File (new or replaced uploads) */
  var pendingFiles = new Map();

  function hasFSAccess() {
    return typeof window.showDirectoryPicker === "function";
  }

  function setMessage(text) {
    adminMessage.textContent = text || "";
  }

  function setFolderLabel() {
    if (rootHandle && rootHandle.name) {
      folderStatus.textContent = "Folder: " + rootHandle.name + " (save writes here)";
    } else if (hasFSAccess()) {
      folderStatus.textContent = "No folder chosen — save will offer downloads.";
    } else {
      folderStatus.textContent = "This browser cannot pick a folder — save will download files.";
    }
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

  async function readPostsFromRoot(root) {
    var dataDir = await root.getDirectoryHandle("data");
    var fh = await dataDir.getFileHandle("posts.json");
    var file = await fh.getFile();
    var text = await file.text();
    return JSON.parse(text);
  }

  async function writeTextFile(root, pathParts, content) {
    var dir = root;
    for (var i = 0; i < pathParts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(pathParts[i], { create: true });
    }
    var fh = await dir.getFileHandle(pathParts[pathParts.length - 1], { create: true });
    var w = await fh.createWritable();
    await w.write(content);
    await w.close();
  }

  async function writeBinaryFile(root, relPath, file) {
    var parts = relPath.split("/").filter(Boolean);
    if (parts.length < 2) throw new Error("Invalid path: " + relPath);
    var dir = root;
    for (var j = 0; j < parts.length - 1; j++) {
      dir = await dir.getDirectoryHandle(parts[j], { create: true });
    }
    var fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
    var w = await fh.createWritable();
    await w.write(await file.arrayBuffer());
    await w.close();
  }

  async function verifyWritable(root) {
    if (root.requestPermission) {
      var st = await root.requestPermission({ mode: "readwrite" });
      if (st !== "granted") throw new Error("Folder permission not granted.");
    }
  }

  function downloadBlob(filename, blob) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  function serializePosts() {
    return JSON.stringify(posts, null, 2) + "\n";
  }

  async function saveToDisk() {
    var json = serializePosts();
    await verifyWritable(rootHandle);

    await writeTextFile(rootHandle, ["data", "posts.json"], json);

    var written = 0;
    var paths = Array.from(pendingFiles.keys());
    for (var i = 0; i < paths.length; i++) {
      var rel = paths[i];
      var file = pendingFiles.get(rel);
      await writeBinaryFile(rootHandle, rel, file);
      written += 1;
    }
    pendingFiles.clear();
    setMessage("Saved data/posts.json" + (written ? " and " + written + " image(s)." : "."));
  }

  async function saveViaDownload() {
    downloadBlob("posts.json", new Blob([serializePosts()], { type: "application/json" }));

    var idx = 0;
    pendingFiles.forEach(function (file, rel) {
      idx += 1;
      var safeName = rel.replace(/\//g, "__");
      downloadBlob(safeName, file);
    });

    if (pendingFiles.size === 0) {
      setMessage("Downloaded posts.json. Place it in data/posts.json in your project.");
    } else {
      setMessage(
        "Downloaded posts.json and " +
          pendingFiles.size +
          " image file(s). Rename images from assets__posts__slug__file.png to assets/posts/slug/file.png (see README)."
      );
    }
    pendingFiles.clear();
    render();
  }

  async function onSave() {
    syncFromForm();
    setMessage("");
    try {
      if (!posts.length) {
        setMessage("Add at least one post before saving.");
        return;
      }
      for (var i = 0; i < posts.length; i++) {
        if (!posts[i].slug) {
          setMessage("Each post needs a slug (used for assets/posts/your-slug/).");
          return;
        }
      }
      if (rootHandle) {
        await saveToDisk();
      } else {
        await saveViaDownload();
      }
    } catch (e) {
      console.error(e);
      setMessage("Save failed: " + (e.message || String(e)));
    }
  }

  async function onPickFolder() {
    setMessage("");
    if (!hasFSAccess()) {
      setMessage("Use Chrome or Edge to pick a folder, or save to download files.");
      return;
    }
    try {
      var picked = await window.showDirectoryPicker({ mode: "readwrite" });
      rootHandle = picked;
      setFolderLabel();
      var data = await readPostsFromRoot(rootHandle);
      posts = normalizePosts(data);
      pendingFiles.clear();
      setMessage("Loaded posts from disk.");
      render();
    } catch (e) {
      if (e && e.name === "AbortError") return;
      console.error(e);
      rootHandle = null;
      setFolderLabel();
      setMessage("Could not open folder: " + (e.message || String(e)));
    }
  }

  function onLoadServer() {
    setMessage("");
    fetch("data/posts.json")
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        posts = normalizePosts(data);
        pendingFiles.clear();
        setMessage("Loaded posts from server.");
        render();
      })
      .catch(function (e) {
        setMessage("Could not load data/posts.json — use Choose folder or run from repo root.");
        console.error(e);
      });
  }

  function addPost() {
    posts.unshift(
      normalizePost({
        id: "post-" + Date.now(),
        slug: "",
        title: "",
        date: new Date().toISOString().slice(0, 10),
        body: "",
        images: [],
      })
    );
    render();
  }

  function removePost(index) {
    var p = posts[index];
    if (!p) return;
    if (p.images) {
      p.images.forEach(function (rel) {
        pendingFiles.delete(rel);
      });
    }
    posts.splice(index, 1);
    render();
  }

  function syncFromForm() {
    var cards = postsEditor.querySelectorAll(".admin-post[data-index]");
    cards.forEach(function (card) {
      var idx = parseInt(card.getAttribute("data-index"), 10);
      if (isNaN(idx) || !posts[idx]) return;
      var title = card.querySelector("[data-field=title]");
      var slug = card.querySelector("[data-field=slug]");
      var date = card.querySelector("[data-field=date]");
      var body = card.querySelector("[data-field=body]");
      if (title) posts[idx].title = title.value;
      if (slug) {
        var nextSlug = sanitizeSlug(slug.value);
        posts[idx].slug = nextSlug;
      }
      if (date) posts[idx].date = date.value;
      if (body) posts[idx].body = body.value;
    });
  }

  function moveImage(postIndex, imageIndex, delta) {
    var p = posts[postIndex];
    if (!p || !p.images) return;
    var j = imageIndex + delta;
    if (j < 0 || j >= p.images.length) return;
    var tmp = p.images[j];
    p.images[j] = p.images[imageIndex];
    p.images[imageIndex] = tmp;
    render();
  }

  function removeImage(postIndex, relPath) {
    var p = posts[postIndex];
    if (!p || !p.images) return;
    p.images = p.images.filter(function (x) {
      return x !== relPath;
    });
    pendingFiles.delete(relPath);
    render();
  }

  function handleFilesChosen(postIndex, fileList) {
    syncFromForm();
    var p = posts[postIndex];
    if (!p) return;
    var slug = sanitizeSlug(p.slug);
    p.slug = slug;
    if (!slug) {
      setMessage("Set a slug before adding images.");
      render();
      return;
    }

    var used = new Set();
    p.images.forEach(function (rel) {
      var base = rel.split("/").pop();
      used.add(base);
    });

    var files = Array.prototype.slice.call(fileList);
    for (var i = 0; i < files.length; i++) {
      var raw = safeFilename(files[i].name);
      var name = uniqueFilename(raw, used);
      used.add(name);
      var rel = "assets/posts/" + slug + "/" + name;
      p.images.push(rel);
      pendingFiles.set(rel, files[i]);
    }
    setMessage("");
    render();
  }

  function render() {
    syncFromForm();
    postsEditor.innerHTML = "";

    if (!posts.length) {
      var empty = document.createElement("p");
      empty.className = "admin-help";
      empty.textContent = "No posts yet. Click “Add post” or load from disk / server.";
      postsEditor.appendChild(empty);
      return;
    }

    for (var i = 0; i < posts.length; i++) {
      (function (postIndex) {
        var p = posts[postIndex];
        var card = document.createElement("section");
        card.className = "admin-post";
        card.setAttribute("data-index", String(postIndex));

        var h = document.createElement("h2");
        h.className = "admin-post__title";
        h.textContent = p.title.trim() || "Untitled post";

        function field(label, hint, inputEl) {
          var wrap = document.createElement("div");
          wrap.className = "admin-field";
          var lab = document.createElement("label");
          lab.textContent = label;
          wrap.appendChild(lab);
          wrap.appendChild(inputEl);
          if (hint) {
            var hi = document.createElement("p");
            hi.className = "admin-field__hint";
            hi.textContent = hint;
            wrap.appendChild(hi);
          }
          return wrap;
        }

        var titleIn = document.createElement("input");
        titleIn.type = "text";
        titleIn.setAttribute("data-field", "title");
        titleIn.value = p.title;
        titleIn.addEventListener("input", function () {
          posts[postIndex].title = titleIn.value;
          h.textContent = titleIn.value.trim() || "Untitled post";
        });

        var slugIn = document.createElement("input");
        slugIn.type = "text";
        slugIn.setAttribute("data-field", "slug");
        slugIn.value = p.slug;
        slugIn.addEventListener("change", function () {
          posts[postIndex].slug = sanitizeSlug(slugIn.value);
          slugIn.value = posts[postIndex].slug;
        });

        var dateIn = document.createElement("input");
        dateIn.type = "date";
        dateIn.setAttribute("data-field", "date");
        dateIn.value = p.date;

        var bodyIn = document.createElement("textarea");
        bodyIn.setAttribute("data-field", "body");
        bodyIn.value = p.body;

        var imagesLabel = document.createElement("div");
        imagesLabel.className = "admin-field";
        var labImg = document.createElement("label");
        labImg.textContent = "Images";
        imagesLabel.appendChild(labImg);

        var list = document.createElement("ul");
        list.className = "admin-images__list";
        (p.images || []).forEach(function (rel, imgIdx) {
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
            moveImage(postIndex, imgIdx, -1);
          });

          var down = document.createElement("button");
          down.type = "button";
          down.className = "admin-icon-btn";
          down.textContent = "↓";
          down.setAttribute("aria-label", "Move image down");
          down.disabled = imgIdx === p.images.length - 1;
          down.addEventListener("click", function () {
            moveImage(postIndex, imgIdx, 1);
          });

          var rm = document.createElement("button");
          rm.type = "button";
          rm.className = "admin-icon-btn admin-danger";
          rm.textContent = "×";
          rm.setAttribute("aria-label", "Remove image");
          rm.addEventListener("click", function () {
            removeImage(postIndex, rel);
          });

          li.appendChild(span);
          li.appendChild(up);
          li.appendChild(down);
          li.appendChild(rm);
          li.appendChild(document.createTextNode(" "));
          list.appendChild(li);
        });
        imagesLabel.appendChild(list);

        var fileIn = document.createElement("input");
        fileIn.type = "file";
        fileIn.accept = "image/*";
        fileIn.multiple = true;
        fileIn.className = "admin-field";
        fileIn.addEventListener("change", function () {
          if (fileIn.files && fileIn.files.length) {
            handleFilesChosen(postIndex, fileIn.files);
            fileIn.value = "";
          }
        });

        var pickWrap = document.createElement("div");
        pickWrap.className = "admin-field";
        var pickLab = document.createElement("label");
        pickLab.textContent = "Upload images from your computer";
        pickLab.setAttribute("for", "file-" + postIndex);
        pickLab.style.display = "block";
        pickLab.style.marginBottom = "var(--space-xs)";
        fileIn.id = "file-" + postIndex;
        pickWrap.appendChild(pickLab);
        pickWrap.appendChild(fileIn);

        var actions = document.createElement("div");
        actions.className = "admin-row-actions";
        var del = document.createElement("button");
        del.type = "button";
        del.className = "admin-btn admin-danger";
        del.textContent = "Delete post";
        del.addEventListener("click", function () {
          if (window.confirm("Delete this post?")) removePost(postIndex);
        });
        actions.appendChild(del);

        card.appendChild(h);
        card.appendChild(field("Title", null, titleIn));
        card.appendChild(
          field(
            "Slug",
            "Folder under assets/posts/ (letters, numbers, hyphens). If you change slug after adding images, update image paths manually.",
            slugIn
          )
        );
        card.appendChild(field("Date", null, dateIn));
        card.appendChild(field("Body", "One paragraph per line (blank line = blank line).", bodyIn));
        card.appendChild(imagesLabel);
        card.appendChild(pickWrap);
        card.appendChild(actions);

        postsEditor.appendChild(card);
      })(i);
    }
  }

  btnPickFolder.addEventListener("click", onPickFolder);
  btnLoadServer.addEventListener("click", onLoadServer);
  btnAddPost.addEventListener("click", function () {
    syncFromForm();
    addPost();
  });
  btnSave.addEventListener("click", onSave);

  setFolderLabel();
  onLoadServer();
})();
