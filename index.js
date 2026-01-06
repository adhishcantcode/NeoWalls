import blessed from "blessed";
import fs from "fs";
import path from "path";
import os from "os";
import axios from "axios";
import { exec } from "child_process";
import { setWallpaper } from "wallpaper";

const GITHUB_USERNAME = "adhishcantcode";
const REPO_NAME = "Neowalls";
const FOLDER_PATH = "Walls";
const BRANCH = "main";

const CUSTOM_DOWNLOAD_PATH = "E:/Wallpapers/Downloaded";

const API_URL = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${FOLDER_PATH}`;

const CACHE_DIR = path.join(os.tmpdir(), "neowalls_cache");
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

const screen = blessed.screen({
  smartCSR: true,
  title: "Neowalls Turbo",
  fullUnicode: true,
});

const list = blessed.list({
  top: "center",
  left: 0,
  width: "30%",
  height: "100%",
  items: ["Loading..."],
  border: { type: "line" },
  style: {
    selected: { bg: "blue", fg: "white" },
    border: { fg: "cyan" },
  },
  keys: true,
  vi: true,
});

const previewBox = blessed.box({
  top: "center",
  left: "30%",
  width: "70%",
  height: "100%",
  content:
    "{center}Preview Area\n\n⬇ Use Arrows to Browse\n[SPACE] View Actual Image\n[ENTER] Download & Set Wallpaper{/center}",
  tags: true,
  border: { type: "line" },
  style: { border: { fg: "yellow" } },
});

screen.append(list);
screen.append(previewBox);

function getThumbnailUrl(filename) {
  const rawUrl = `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${REPO_NAME}/${BRANCH}/${FOLDER_PATH}/${filename}`;
  return `https://wsrv.nl/?url=${encodeURIComponent(rawUrl)}&w=600&q=80`;
}

async function fetchFiles() {
  try {
    const response = await axios.get(API_URL);
    return response.data.filter(
      (item) =>
        item.type === "file" && item.name.match(/\.(jpg|jpeg|png|webp)$/i)
    );
  } catch {
    return [];
  }
}

let debounceTimer = null;

async function start() {
  const files = await fetchFiles();

  if (files.length === 0) {
    list.setItems(["No images found."]);
    screen.render();
    return;
  }

  list.setItems(files.map((f) => f.name));
  list.focus();
  screen.render();

  list.on("select item", (item, index) => {
    const selectedFile = files[index];
    const cachePath = path.join(CACHE_DIR, selectedFile.name);

    previewBox.setContent("{center}\n\nLoading...{/center}");
    screen.render();

    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(async () => {
      try {
        if (!fs.existsSync(cachePath)) {
          const response = await axios({
            url: getThumbnailUrl(selectedFile.name),
            method: "GET",
            responseType: "arraybuffer",
          });
          fs.writeFileSync(cachePath, response.data);
        }

        const wrapWidth = previewBox.width - 4 || 10;
        const wrapHeight = previewBox.height - 4 || 10;
        const sizeStr = `${wrapWidth}x${wrapHeight}`;

        try {
          const { execSync } = await import("child_process");
          const output = execSync(
            `chafa "${cachePath}" -s ${sizeStr} --symbols vhalf,block,space --dither none -c 256`,
            { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
          );
          previewBox.setContent(output.replace(/\x1b\[\?25[hl]/g, ""));
        } catch {
          try {
            const { execSync } = await import("child_process");
            const output = execSync(
              `chafa "${cachePath}" -s ${sizeStr} --symbols ascii`,
              { encoding: "utf-8" }
            );
            previewBox.setContent(output.replace(/\x1b\[\?25[hl]/g, ""));
          } catch {
            previewBox.setContent("{red-fg}Preview Error{/red-fg}");
          }
        }

        screen.render();
      } catch (err) {
        previewBox.setContent(`{red-fg}Error: ${err.message}{/red-fg}`);
        screen.render();
      }
    }, 400);
  });

  list.key(["space"], () => {
    const selectedFile = files[list.selected];
    const cachePath = path.join(CACHE_DIR, selectedFile.name);

    if (!fs.existsSync(cachePath)) return;

    const msg = blessed.message({
      top: "center",
      left: "center",
      width: "40%",
      height: 5,
      border: { type: "line", fg: "magenta" },
      style: { fg: "white", bg: "magenta" },
    });

    screen.append(msg);
    msg.display("{center}Opening Image...{/center}", 1);

    if (process.platform === "win32") exec(`explorer "${cachePath}"`);
    else if (process.platform === "darwin") exec(`open "${cachePath}"`);
    else exec(`xdg-open "${cachePath}"`);
  });

  list.on("select", (item, index) => {
    const selectedFile = files[index];

    if (!fs.existsSync(CUSTOM_DOWNLOAD_PATH)) {
      fs.mkdirSync(CUSTOM_DOWNLOAD_PATH, { recursive: true });
    }

    const savePath = path.join(CUSTOM_DOWNLOAD_PATH, selectedFile.name);

    const downloadMsg = blessed.message({
      top: "center",
      left: "center",
      width: "50%",
      height: 5,
      border: { type: "line", fg: "blue" },
      style: { fg: "white", bg: "blue" },
    });

    screen.append(downloadMsg);
    downloadMsg.display(
      `{center}Downloading to ${CUSTOM_DOWNLOAD_PATH}...\nSetting Wallpaper...{/center}`,
      0
    );

    axios({
      url: selectedFile.download_url,
      method: "GET",
      responseType: "stream",
    }).then((response) => {
      const writer = fs.createWriteStream(savePath);
      response.data.pipe(writer);

      writer.on("finish", async () => {
        try {
          await setWallpaper(savePath);

          downloadMsg.detach();
          const successMsg = blessed.message({
            top: "center",
            left: "center",
            width: "50%",
            height: 5,
            border: { type: "line", fg: "green" },
            style: { fg: "white", bg: "green" },
          });

          screen.append(successMsg);
          successMsg.display(
            "{center}✅ DONE!\nSaved & Wallpaper Updated.{/center}",
            3
          );
        } catch (err) {
          downloadMsg.detach();
          const errorMsg = blessed.message({
            top: "center",
            left: "center",
            width: "50%",
            height: 5,
            border: { type: "line", fg: "red" },
            style: { fg: "white", bg: "red" },
          });

          screen.append(errorMsg);
          errorMsg.display(
            `{center}Saved, but failed to set wallpaper:\n${err.message}{/center}`,
            4
          );
        }

        screen.render();
      });
    });
  });
}

screen.key(["escape", "q", "C-c"], () => process.exit(0));

screen.on("resize", () => {
  list.emit("select item", list.getItem(list.selected), list.selected);
  screen.render();
});

start();
