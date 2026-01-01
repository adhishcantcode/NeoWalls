import blessed from "blessed";
import fs from "fs";
import path from "path";
import axios from "axios";
import { execSync } from "child_process";

// --- CONFIGURATION ---
const GITHUB_USERNAME = "adhishcantcode";
const REPO_NAME = "Neowalls";
const FOLDER_PATH = "Walls";
// ---------------------

const API_URL = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${FOLDER_PATH}`;
const TEMP_FILE = path.resolve(process.cwd(), "temp_preview_image");

// 1. Setup the Screen
const screen = blessed.screen({
  smartCSR: true,
  title: "Neowalls Downloader",
});

// 2. Create Layout: List on the LEFT
const list = blessed.list({
  top: "center",
  left: 0,
  width: "30%",
  height: "100%",
  items: ["Loading..."], // Initial placeholder
  border: { type: "line" },
  style: {
    selected: { bg: "blue", fg: "white" }, // Highlight color
    border: { fg: "cyan" },
  },
  keys: true, // Enable arrow keys
  vi: true, // Enable j/k keys
});

// 3. Create Layout: Preview on the RIGHT
const previewBox = blessed.box({
  top: "center",
  left: "30%",
  width: "70%",
  height: "100%",
  content: "{center}Preview Area{/center}",
  tags: true,
  border: { type: "line" },
  style: { border: { fg: "yellow" } },
});

// Add widgets to screen
screen.append(list);
screen.append(previewBox);

// Helper to fetch file list
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

// 4. MAIN LOGIC
async function start() {
  const files = await fetchFiles();

  if (files.length === 0) {
    list.setItems(["No images found or Error connecting."]);
    screen.render();
    return;
  }

  // Populate the list
  list.setItems(files.map((f) => f.name));
  list.focus(); // Give keyboard control to the list
  screen.render();

  // --- EVENT: When user moves selection (Arrow Up/Down) ---
  list.on("select item", async (item, index) => {
    const selectedFile = files[index];

    previewBox.setContent("{center}Loading preview...{/center}");
    screen.render();

    try {
      // A. Download image to temp file
      const response = await axios({
        url: selectedFile.download_url,
        method: "GET",
        responseType: "arraybuffer",
      });
      fs.writeFileSync(TEMP_FILE, response.data);

      // B. Generate Preview with Chafa
      // We pipe the output directly into the box content
      // -s sets size to fit the box roughly (width x height)
      const chafaOutput = execSync(
        `chafa "${TEMP_FILE}" -s 60x30 --symbols vhalf+block+space`,
        { encoding: "utf-8" }
      );

      previewBox.setContent(chafaOutput);
      screen.render();
    } catch (err) {
      previewBox.setContent(
        `{red-fg}Error loading preview: ${err.message}{/red-fg}`
      );
      screen.render();
    }
  });

  // --- EVENT: When user presses ENTER to Download ---
  list.on("select", (item, index) => {
    const selectedFile = files[index];
    const savePath = path.resolve(process.cwd(), selectedFile.name);

    // Copy the temp file (since we already downloaded it for preview!)
    if (fs.existsSync(TEMP_FILE)) {
      fs.copyFileSync(TEMP_FILE, savePath);

      // Show success message briefly
      const msg = blessed.message({
        top: "center",
        left: "center",
        width: "50%",
        height: 5,
        border: { type: "line", fg: "green" },
        style: { fg: "white", bg: "green" },
      });
      screen.append(msg);
      msg.display(`Downloaded: ${selectedFile.name}`, 2, () => {
        msg.detach(); // Remove message after 2 seconds
        screen.render();
      });
    }
  });
}

// Quit on Escape, q, or Ctrl+C
screen.key(["escape", "q", "C-c"], () => process.exit(0));

// Start the app
start();
