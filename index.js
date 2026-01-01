import blessed from "blessed";
import fs from "fs";
import path from "path";
import axios from "axios";
import { exec, execSync } from "child_process";

// --- CONFIGURATION ---
const GITHUB_USERNAME = "adhishcantcode";
const REPO_NAME = "Neowalls";
const FOLDER_PATH = "Walls";
const BRANCH = "main";
// ---------------------

const API_URL = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${FOLDER_PATH}`;

// Setup Cache Folder
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
  content:
    "{center}Preview Area\n\n⬇ Use Arrows to Browse\n[SPACE] View Actual Image\n[ENTER] Download & Set Wallpaper{/center}",
  tags: true,
  border: { type: "line" },
  style: { border: { fg: "yellow" } },
});

screen.append(list);
screen.append(previewBox);

// --------------------------------------------------------
// 🛠️ HELPER: The "Nuclear" Wallpaper Setter
// --------------------------------------------------------
function forceWallpaperUpdate(imagePath) {
  return new Promise((resolve, reject) => {
    // 1. Ensure path is absolute and uses backslashes for Windows
    const absPath = path.resolve(imagePath);

    // 2. PowerShell Script that:
    //    a) Sets Registry keys for "Fill" style (looks best)
    //    b) Sets the Wallpaper path in Registry
    //    c) Calls the native Win32 API to refresh the desktop
    const psCommand = `
            $path = '${absPath}'
            
            # Set Registry Keys (Forces "Fill" Style)
            Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name WallpaperStyle -Value 10
            Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name TileWallpaper -Value 0
            Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name Wallpaper -Value $path

            # Define C# code to call the native Windows API
            $code = @'
            using System.Runtime.InteropServices;
            public class Wallpaper {
                [DllImport("user32.dll", CharSet=CharSet.Auto)]
                public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);
            }
            '@
            
            # Run the API Call
            Add-Type -TypeDefinition $code
            [Wallpaper]::SystemParametersInfo(20, 0, $path, 3)
        `;

    // Execute PowerShell
    exec(
      `powershell -ExecutionPolicy Bypass -NoProfile -Command "${psCommand}"`,
      (error, stdout, stderr) => {
        if (error) {
          // If it fails, send the detailed error back so we can see it
          reject(stderr || error.message);
        } else {
          resolve(stdout);
        }
      }
    );
  });
}
// --------------------------------------------------------

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

  // --- 1. HANDLE SCROLLING ---
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
          const rawOutput = execSync(
            `chafa "${cachePath}" -s ${sizeStr} --symbols vhalf,block,space --dither none -c 256`,
            { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
          );
          const cleanOutput = rawOutput.replace(/\x1b\[\?25[hl]/g, "");
          previewBox.setContent(cleanOutput);
        } catch (e) {
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

  // --- 2. HANDLE SPACEBAR ---
  list.key(["space"], () => {
    const selectedFile = files[list.selected];
    const cachePath = path.join(CACHE_DIR, selectedFile.name);

    if (fs.existsSync(cachePath)) {
      const msg = blessed.message({
        top: "center",
        left: "center",
        width: "40%",
        height: 5,
        border: { type: "line", fg: "magenta" },
        style: { fg: "white", bg: "magenta" },
      });
      screen.append(msg);
      msg.display(`{center}Opening Image...{/center}`, 1);

      if (process.platform === "win32") {
        exec(`explorer "${cachePath}"`);
      } else if (process.platform === "darwin") {
        exec(`open "${cachePath}"`);
      } else {
        exec(`xdg-open "${cachePath}"`);
      }
    }
  });

  // --- 3. HANDLE ENTER (Download & Set) ---
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
    downloadMsg.display(
      `{center}Downloading & Setting Wallpaper...{/center}`,
      0
    );
    screen.render();

    axios({
      url: selectedFile.download_url,
      method: "GET",
      responseType: "stream",
    }).then((response) => {
      const writer = fs.createWriteStream(savePath);
      response.data.pipe(writer);

      writer.on("finish", () => {
        // Safety Delay: Wait 1.5s for file lock to release
        setTimeout(async () => {
          try {
            // Try the NUCLEAR option
            await forceWallpaperUpdate(savePath);

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
            successMsg.display(`{center}✅ WALLPAPER UPDATED!{/center}`, 3);
          } catch (err) {
            downloadMsg.detach();
            const errorMsg = blessed.message({
              top: "center",
              left: "center",
              width: "60%",
              height: 7,
              border: { type: "line", fg: "red" },
              style: { fg: "white", bg: "red" },
            });
            screen.append(errorMsg);
            errorMsg.display(
              `{center}FAILED:\n${err.substring(0, 100)}...{/center}`,
              5
            );
          }
          screen.render();
        }, 1500);
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
