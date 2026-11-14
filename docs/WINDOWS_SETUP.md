# Windows setup — Chess Club app

One step at a time, with a check after each. Do not skip ahead: each check
isolates a single thing that can go wrong, so when something fails you know
exactly which step to report.

If a step fails, note **the step number and the exact error text**. That is
what makes it debuggable.

---

## Step 1 — Install Node.js

The app needs Node.js. This is separate from Python; having Python installed
does not give you Node.

1. Go to <https://nodejs.org>.
2. Download the **LTS** version (the left-hand button). Take the `.msi`
   installer for Windows.
3. Run it. Accept the defaults on every screen. If it offers "Automatically
   install the necessary tools for native modules", you can leave that
   **unchecked** — this project does not need it.
4. When it finishes, **close every open terminal and VS Code window.** Node
   adds itself to your PATH, and programs only see a new PATH when they start.

### Check 1

Open a **new** PowerShell window (Start menu → type `powershell` → Enter) and
run:

```powershell
node --version
npm --version
```

You should see two version numbers, for example `v22.11.0` and `10.9.0`. The
Node version must start with `v18` or higher.

- **"node is not recognized"** → the PATH did not update. Restart the computer
  and try Check 1 again. If it still fails, reinstall Node and make sure you
  are opening a *new* terminal afterwards.

---

## Step 2 — Put the project somewhere sensible

Unzip `chess-club-app.zip` next to your existing chess club work, so
everything lives together. For example:

```
C:\ChessClub\
    game_analyzer.py
    coach_report.py
    chess-club-app\        <- the unzipped folder
```

The unzipped folder must contain `package.json` directly inside it — not
inside a second `chess-club-app` folder. Zip tools sometimes add an extra
level. If you see `chess-club-app\chess-club-app\package.json`, move the inner
folder up one level.

### Check 2

Open the folder in File Explorer. You should see `package.json`, `index.html`,
`vite.config.js`, and a `src` folder.

---

## Step 3 — Open the project in VS Code

1. Open VS Code.
2. **File → Open Folder…**
3. Select the `chess-club-app` folder (the one containing `package.json`) and
   click **Select Folder**.
4. If VS Code asks "Do you trust the authors of the files in this folder?",
   choose **Yes, I trust the authors**. Without this the terminal will not run.

### Check 3

The Explorer panel on the left shows `package.json`, `src`, `index.html`.

---

## Step 4 — Open a terminal inside VS Code

**Terminal → New Terminal** (or `` Ctrl+` ``).

A panel opens at the bottom. The prompt should already show your project
folder, something like `PS C:\ChessClub\chess-club-app>`.

### Check 4

In that terminal, run:

```powershell
dir package.json
```

It should list the file. If it says the file cannot be found, the terminal is
in the wrong folder — close VS Code and redo Step 3, making sure you select the
folder that *contains* `package.json`.

---

## Step 5 — Install the project's packages

In the VS Code terminal:

```powershell
npm install
```

This downloads React and Vite into a `node_modules` folder. It takes 15–60
seconds the first time and prints something like `added 63 packages`.

### Check 5

`npm install` finished without the word `ERR!` in the output, and a
`node_modules` folder now exists in the Explorer panel.

- **"npm is not recognized"** → go back to Check 1.
- **Errors mentioning `EPERM`, `EACCES`, or `operation not permitted`** →
  antivirus or OneDrive is locking the folder. Move the project out of
  OneDrive/Documents to something like `C:\ChessClub\` and run `npm install`
  again.
- **Errors mentioning `ETIMEDOUT`, `ENOTFOUND`, or a proxy** → the network is
  blocking npm. Try on a different network.

---

## Step 6 — Check the chess rules engine

Before looking at the website, confirm the rules engine itself is sound. This
needs no browser and takes a couple of seconds:

```powershell
npm test
```

### Check 6

The last line reads `93 passed, 0 failed`.

This runs perft — it counts every legal sequence of moves several moves deep
and compares against published totals. If those numbers match, move generation
is correct.

---

## Step 7 — Run the website

```powershell
npm run dev
```

The terminal prints something like:

```
  VITE v5.4.11  ready in 420 ms
  ➜  Local:   http://localhost:5173/
```

Your browser should open by itself. If it does not, hold **Ctrl** and click the
`http://localhost:5173/` link in the terminal.

### Check 7

The Chess Club page loads and you can see the dashboard.

- **The page is blank and white** → press `F12`, click the **Console** tab, and
  send me the red error text.
- **"Port 5173 is in use"** → Vite will offer another port; use the URL it
  prints.
- **Windows Firewall prompt** → allow it for private networks. (Nothing leaves
  your machine; this is just a local server.)

---

## Step 8 — Play a game

1. Click **Play** in the top nav.
2. Click a white pawn, then click one of the highlighted squares. Or drag it.
3. Play a few moves for both sides.
4. Click **Copy PGN**.

### Check 8

Moves appear in the list on the right in chess notation (`e4`, `Nf3`, …), and
**Copy PGN** puts the game on your clipboard — paste it into Notepad to see it.

That PGN is the exact format `coach_report.py` reads, so a game played here can
go straight into the analyzer.

**Try the computer opponent:** in the **Opponent** panel, switch to "Play vs
computer" and pick an Elo. That's the real Stockfish engine — the first move
it makes may take an extra second while the browser loads the engine file
(a few MB), after which it's instant.

**Try the puzzle trainer:** click **Training** in the top nav. Solve a
puzzle's forced line move by move; picking a name under **Trainee** saves
your results to that player's row on the Roster page.

---

## Everyday use, once it is working

- Open the folder in VS Code, run `npm run dev`, work, then press `Ctrl+C` in
  the terminal to stop the server.
- You only ever run `npm install` again if you add a new package.
- Editing a file and saving it updates the browser instantly — no restart.

## Making a version you can put on the web later

```powershell
npm run build
```

This writes a `dist` folder containing the whole site as plain files. That
folder is what gets uploaded when the club is ready to host it.

---

## If you get stuck

Send the **step number**, the **command you ran**, and the **exact text** of
the error, copied from the terminal. "It didn't work" cannot be debugged;
"Step 5, `npm install`, `npm ERR! code EPERM`" can be fixed in one reply.
