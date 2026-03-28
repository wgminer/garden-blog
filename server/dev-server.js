"use strict";

var fs = require("fs");
var path = require("path");
var express = require("express");
var multer = require("multer");

var ROOT = path.resolve(__dirname, "..");
var PORT = Number(process.env.PORT) || 8080;

var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function isAllowedImagePath(rel) {
  if (!rel || typeof rel !== "string") return false;
  if (rel.indexOf("..") !== -1 || rel.indexOf("\\") !== -1) return false;
  var prefix = "assets/posts/";
  if (rel.indexOf(prefix) !== 0) return false;
  var rest = rel.slice(prefix.length);
  var segments = rest.split("/").filter(Boolean);
  if (segments.length < 2) return false;
  var slug = segments[0];
  var fileName = segments[segments.length - 1];
  if (!/^[a-z0-9-]+$/.test(slug) || !fileName) return false;
  return true;
}

function printGardenBanner(port) {
  var base = "http://127.0.0.1:" + port;
  var lines = [
    "",
    "    🌿  Garden blog — your local plot is open",
    "    " + "─".repeat(44),
    "    🌻  Stroll the paths:     " + base + "/",
    "    🪴  Tend the beds (admin): " + base + "/admin",
    "    📋  Peek at seeds (JSON): " + base + "/data/posts.json",
    "",
    "    Water your drafts here, then commit + push to publish.",
    "",
  ];
  console.log(lines.join("\n"));
}

var app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", function (req, res) {
  res.json({ ok: true, server: "garden-blog-dev" });
});

app.get("/api/posts", function (req, res) {
  var p = path.join(ROOT, "data", "posts.json");
  fs.readFile(p, "utf8", function (err, text) {
    if (err) {
      if (err.code === "ENOENT") return res.json([]);
      return res.status(500).json({ error: err.message });
    }
    try {
      var data = JSON.parse(text);
      res.json(Array.isArray(data) ? data : []);
    } catch (e) {
      res.status(500).json({ error: "Invalid JSON in data/posts.json" });
    }
  });
});

app.post("/api/save", upload.array("images", 200), function (req, res) {
  var postsRaw = req.body.posts;
  var pathsRaw = req.body.paths || "[]";
  var posts;
  var paths;

  try {
    posts = JSON.parse(postsRaw);
  } catch (e) {
    return res.status(400).json({ error: "Invalid posts JSON" });
  }
  try {
    paths = JSON.parse(pathsRaw);
  } catch (e) {
    return res.status(400).json({ error: "Invalid paths JSON" });
  }

  if (!Array.isArray(posts)) {
    return res.status(400).json({ error: "posts must be an array" });
  }
  if (!Array.isArray(paths)) {
    return res.status(400).json({ error: "paths must be an array" });
  }

  var files = req.files || [];
  if (paths.length !== files.length) {
    return res.status(400).json({ error: "Number of paths must match number of uploaded files" });
  }

  for (var i = 0; i < paths.length; i++) {
    if (!isAllowedImagePath(paths[i])) {
      return res.status(400).json({ error: "Disallowed image path: " + paths[i] });
    }
  }

  function writeImages(callback) {
    var idx = 0;
    function next() {
      if (idx >= files.length) return callback(null);
      var rel = paths[idx];
      var file = files[idx];
      idx += 1;
      var dest = path.join(ROOT, rel.split("/").join(path.sep));
      fs.mkdir(path.dirname(dest), { recursive: true }, function (err) {
        if (err) return callback(err);
        fs.writeFile(dest, file.buffer, function (err2) {
          if (err2) return callback(err2);
          next();
        });
      });
    }
    next();
  }

  writeImages(function (err) {
    if (err) return res.status(500).json({ error: err.message });

    var json = JSON.stringify(posts, null, 2) + "\n";
    var dataPath = path.join(ROOT, "data", "posts.json");
    var tmpPath = dataPath + ".tmp";
    fs.mkdir(path.dirname(dataPath), { recursive: true }, function (mkdirErr) {
      if (mkdirErr) return res.status(500).json({ error: mkdirErr.message });
      fs.writeFile(tmpPath, json, "utf8", function (writeErr) {
        if (writeErr) return res.status(500).json({ error: writeErr.message });
        fs.rename(tmpPath, dataPath, function (renameErr) {
          if (renameErr) return res.status(500).json({ error: renameErr.message });
          res.json({ ok: true });
        });
      });
    });
  });
});

app.get("/admin", function (req, res) {
  res.sendFile(path.join(ROOT, "admin.html"));
});

app.get("/admin/", function (req, res) {
  res.sendFile(path.join(ROOT, "admin.html"));
});

app.use(express.static(ROOT));

var server = app.listen(PORT, "127.0.0.1", function () {
  printGardenBanner(PORT);
});

server.on("error", function (err) {
  if (err.code === "EADDRINUSE") {
    console.error("Port " + PORT + " is already in use. Stop the other process or run: PORT=3000 npm start");
  } else {
    console.error(err);
  }
  process.exit(1);
});
