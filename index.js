import blessed from "blessed";
import fs from "fs";
import path from "path";
import axios from "axios";
import { execSync } from "child_process";

// --- CONFIGURATION ---
const GITHUB_USERNAME = "adhishcantcode";
const REPO_NAME = "Neowalls";
const FOLDER_PATH = "Walls";
const BRANCH = "main";
// ---------------------

const API_URL = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${FOLDER_PATH}`;

const CACHE_DIR = path.resolve(process.cwd(), "neowalls_cache");
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
  content: "{center}Preview Area\n(Move arrows to load){/center}",
  tags: true,
  border: { type: "line" },
  style: { border: { fg: "yellow" } },
});

screen.append(list);
screen.append(previewBox);

function getThumbnailUrl(filename) {
  const rawUrl = `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${REPO_NAME}/${BRANCH}/${FOLDER_PATH}/${filename}`;
  // Request a slightly higher quality thumbnail (w=600, q=80)
  return `https://wsrv.nl/?url=${encodeURIComponent(rawUrl)}&w=600&q=80`;
}

async function fetchFiles() {
  try {
    const response = await axios.get(API_URL);
    return response.data.filter(
      (item) =>
        item.type === "file" && item.name.match(/\.(jpg|jpeg|png|webp)$/i)
    );
  } catch (err) {
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
          const thumbUrl = getThumbnailUrl(selectedFile.name);
          const response = await axios({
            url: thumbUrl,
            method: "GET",
            responseType: "arraybuffer",
          });
          fs.writeFileSync(cachePath, response.data);
        }

        let wrapWidth = previewBox.width - 4 || 10;
        let wrapHeight = previewBox.height - 4 || 10;
        const sizeStr = `${wrapWidth}x${wrapHeight}`;

        try {
          // --- QUALITY UPDATE ---
          // --symbols vhalf,block,space : Uses half-blocks for 2x detail
          // --dither none : Removes noisy "dots", making it look smoother like a photo
          // -c 256 : Safe color mode for your version
          const rawOutput = execSync(
            `chafa "${cachePath}" -s ${sizeStr} --symbols vhalf,block,space --dither none -c 256`,
            { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
          );

          const cleanOutput = rawOutput.replace(/\x1b\[\?25[hl]/g, "");
          previewBox.setContent(cleanOutput);
        } catch (e) {
          // Fallback to simple ascii if even vhalf fails
          try {
            const rawOutput = execSync(
              `chafa "${cachePath}" -s ${sizeStr} --symbols ascii`,
              { encoding: "utf-8" }
            );
            previewBox.setContent(rawOutput.replace(/\x1b\[\?25[hl]/g, ""));
          } catch (err2) {
            previewBox.setContent(`{red-fg}Preview Error{/red-fg}`);
          }
        }

        screen.render();
      } catch (err) {
        previewBox.setContent(`{red-fg}Error: ${err.message}{/red-fg}`);
        screen.render();
      }
    }, 400);
  });

  list.on("select", (item, index) => {
    const selectedFile = files[index];
    const savePath = path.resolve(process.cwd(), selectedFile.name);

    const downloadMsg = blessed.message({
      top: "center",
      left: "center",
      width: "50%",
      height: 5,
      border: { type: "line", fg: "blue" },
      style: { fg: "white", bg: "blue" },
    });
    screen.append(downloadMsg);
    downloadMsg.display(`{center}Downloading High-Res Image...{/center}`, 0);
    screen.render();

    axios({
      url: selectedFile.download_url,
      method: "GET",
      responseType: "stream",
    }).then((response) => {
      const writer = fs.createWriteStream(savePath);
      response.data.pipe(writer);

      writer.on("finish", () => {
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
          `{center}Saved HD Image to:\n${selectedFile.name}{/center}`,
          2
        );
      });
    });
  });
}

screen.key(["escape", "q", "C-c"], () => {
  process.exit(0);
});

screen.on("resize", () => {
  list.emit("select item", list.getItem(list.selected), list.selected);
  screen.render();
});

start();
