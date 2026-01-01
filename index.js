#!/usr/bin/env node
import fs from "fs";
import path from "path";
import axios from "axios";
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";

// --- CONFIGURATION ---
// 1. Create a Public Repo on GitHub
// 2. Upload images there
// 3. Put your username and repo name here:
const GITHUB_USERNAME = "Adhishcantcode";
const REPO_NAME = "YOUR_REPO_NAME";
const FOLDER_PATH = ""; // Leave empty if images are in the root of the repo

const API_URL = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${FOLDER_PATH}`;

async function main() {
  console.log(
    chalk.cyan.bold(`\n🚀  Fetching wallpapers from ${GITHUB_USERNAME}... \n`)
  );

  const spinner = ora("Connecting to GitHub...").start();

  try {
    // 1. Get list of files
    const response = await axios.get(API_URL);

    // Filter for images only
    const files = response.data.filter(
      (item) =>
        item.type === "file" && item.name.match(/\.(jpg|jpeg|png|webp)$/i)
    );

    spinner.stop();

    if (files.length === 0) {
      console.log(chalk.red("No images found in the repository!"));
      return;
    }

    // 2. Show the menu
    const answer = await inquirer.prompt([
      {
        type: "list",
        name: "selectedFile",
        message: "Choose a wallpaper to download:",
        choices: files.map((file) => ({
          name: `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`,
          value: file,
        })),
      },
    ]);

    const fileData = answer.selectedFile;

    // 3. Download the file
    const downloadSpinner = ora(`Downloading ${fileData.name}...`).start();

    const imageResponse = await axios({
      url: fileData.download_url,
      method: "GET",
      responseType: "stream",
    });

    const savePath = path.resolve(process.cwd(), fileData.name);
    const writer = fs.createWriteStream(savePath);

    imageResponse.data.pipe(writer);

    writer.on("finish", () => {
      downloadSpinner.succeed(chalk.green(`Saved to: ${savePath}`));
    });

    writer.on("error", () => {
      downloadSpinner.fail(chalk.red("Download failed."));
    });
  } catch (error) {
    spinner.fail(
      chalk.red("Error. Check your internet or GitHub Repo details.")
    );
    console.log(error.message);
  }
}

main();
