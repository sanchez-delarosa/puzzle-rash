# Puzzle Rush (personal)

A Puzzle Rush-style tactics trainer that runs on your own computer. It uses puzzles from the Lichess database and saves every run so you can track your progress.

## First-time setup

You need Python 3.10 or newer.

1. Open a terminal in this folder.
2. Install the decompressor for the Lichess file. You can skip this on Python 3.14+, which has it built in.
   ```
   pip install zstandard
   ```
3. Build the puzzle set:
   ```
   python build_puzzles.py
   ```
   This downloads `lichess_db_puzzle.csv.zst` (about 300 MB, only once) into `data/`, scans every puzzle, keeps the ones with reliable ratings and writes `app/puzzles.json` (about 5,000 puzzles, under 1 MB). It takes a couple of minutes.

If you already downloaded the file, pass it in with `python build_puzzles.py --input path\to\lichess_db_puzzle.csv.zst`. Once `app/puzzles.json` exists, you can delete the big download.

## Playing

Double-click `start.bat`, or run `python serve.py`. Your browser opens at http://127.0.0.1:8765.

When you close the browser tab, the server notices and stops by itself about 8 seconds later. The terminal window then closes. Reloading the page doesn't stop it, and with several tabs open it waits until the last one closes. To keep it running regardless, start it with `start.bat --keep-alive` or `python serve.py --keep-alive`, then stop it with Ctrl+C.

If the server isn't reachable while the page is open (for example, after your computer slept for a long time), a yellow notice appears. Any run you finish is kept in the browser and saved to your history file the next time you start the app and load the page.

- **3 min / 5 min:** solve as many as you can before the clock runs out.
- **Survival:** no clock.
- Every run starts with a 3, 2, 1, Go! countdown over the board. The clock doesn't start until "Go!", and the first puzzle appears then. End run or Esc during the countdown cancels it, and you can switch the countdown off in Settings → Training.
- In every mode, three misses end the run. Puzzle *n* is drawn from the rating band nearest `start + n × step`, which defaults to 600 + 40 per puzzle (you can change this in Settings).
- You move by dragging a piece or by clicking it and then clicking a square. As on Lichess, any move that gives checkmate counts as correct.
- When a run ends on your third miss, or the clock runs out in the middle of a puzzle, the board goes back to that position and keeps the correct move on screen (highlighted squares plus a green arrow) until you start the next run.
- After each run you see the time left on the clock (or, in Survival, how long the run lasted) and your average time per puzzle. You also get a list of the puzzles you played, the answer to each one you missed, and a link to open it on Lichess. The time left is saved with each run and appears in the runs CSV as `time_left_s`.

### Board controls

- **Moving:** drag a piece, or click it and then click a square. Drops are forgiving: if you release slightly outside the square you meant, the piece goes to the nearest legal square, as long as it's within about a third of a square of its edge. Picking a piece up also selects it, so if a drag ends without a move (released somewhere illegal, off the board, or cancelled), the piece stays selected with its moves shown.
- **Premoves:** while the opponent is replying, you can already move your next piece. The move is queued (both squares turn purple) and plays the instant it's your turn. It's dropped, without counting as a miss, if the opponent's reply makes it illegal.
- **Changing your mind:** right-click or press Esc while dragging to put the piece back. It stays selected, and a second right-click or Esc deselects it. Either one also clears a queued premove.
- **Arrows and circles:** right-drag between two squares to draw an arrow, or right-click one square to circle it. Drawing the same shape again removes it, and any left click on the board clears them all. Hold Shift for green, Ctrl for red or Alt for blue (the default is orange). Knight arrows bend in an L.

## Appearance

Under Settings, then Appearance, you can choose:

- **Looks:** one-click combinations of a board and a piece set, modelled on classic TV and print chess diagrams. All use the Diagram pieces:
  - **Broadcast:** white and sky blue with a black frame.
  - **VHS:** the same, with scanlines and a soft, slightly colour-fringed tube look.
  - **Newspaper:** hatched dark squares, like a printed column.
  - **Studio teal:** a cooler, greener blue.
  - **Night broadcast:** a deeper blue that suits the dark app themes.

  The boards are also listed under Board → Broadcast, and the pieces under Pieces → Diagram, so you can mix them with anything else.

- **App theme:** five light themes (Sage, Linen, Sky, Lilac, Paper), three dark ones (Forest, Midnight, Espresso), or Match system, which switches between Sage and Forest to follow your computer's light or dark mode.
- **Board colours:** match the app theme, or pick Tournament, Walnut, Ocean, Slate, Coral, Lilac, Ice or High contrast.
- **Pieces:** 16 styles in three groups.
  - **Standard:**
    - **Classic:** the standard chess symbols.
    - **Diagram:** classic printed-diagram pieces with thick outlines. White pieces have black detail lines and black pieces have white ones.
    - **Book diagram:** outlined white pieces, like a printed chess book.
    - **Shaded:** the classic symbols with a gradient and a soft shadow.
    - **Geometric:** flat shapes drawn for this app.
    - **Wood:** the geometric shapes in maple and walnut with a wood grain.
    - **Metal:** silver against gunmetal.
  - **High contrast:** designed to stay readable on any square.
    - **Max contrast:** pure white and pure black pieces, each with a thick outline in the opposite colour.
    - **Halo:** the classic symbols with a white sticker-style border.
    - **Badge:** each piece on its own tile, black on white or white on black.
    - **Signal:** yellow against blue, outlined in black and white.
  - **Playful:**
    - **Sketch:** pencil-like outlines, with hatched black pieces.
    - **Pixel:** 16×16 8-bit sprites.
    - **Neon:** glowing outlines, cyan against magenta. It looks best on a dark theme.
    - **Letters:** K, Q, R, B and N tokens, with dots for pawns.
    - **Shapes:** abstract tokens. The king is a cross, the queen a star, the rook a square and the bishop a diamond. The knight is an L, like its move, and pawns are dots.

- **Sound:** sounds for moves, captures, checks, castling and promotion, plus a chime for a solved puzzle, a buzz for a miss, a warning when 10 seconds are left, and start and end tones. They're generated in the browser, so there are no sound files. You can turn them on or off, set the volume and play samples under Appearance, and the speaker button at the top right mutes them during a run.

Changes apply immediately and are saved in `data/history.json`, so they carry over to any browser you use.

## Your data

- Every run, including each puzzle attempt (puzzle ID, rating, solved or missed, time taken, themes), is saved to `data/history.json`.
- The first time you start the app each day, it copies that file to `data/backups/history-YYYY-MM-DD.json`.
- The Progress tab has CSV export buttons, one for runs and one for every puzzle attempt, plus a full JSON backup.
- Days follow your computer's local time zone.

## What the Progress tab shows

- **Time played:** the total time you actually spent inside runs (3 min, 5 min and Survival), not how long the app was open. It's shown for the selected mode and range, with an all-modes, all-time total underneath. The daily table and the score-chart tooltip show time played per day too. A Survival run left open counts until it ends.
- **Daily score:** the best run and the average run per day, with ±1 standard error bars (a day with one run has no error bar). Runs you end early with "End run" aren't counted in scores, but their puzzles still count everywhere else.
- **Daily performance rating:** the puzzle rating you'd solve 50% of the time, fitted to that day's solves and misses. It uses the Elo logistic model P(solve) = 1 / (1 + 10^((r − R)/400)), estimated as a MAP with a weak normal prior (sd 400, centred on the mean puzzle rating that day) so that days where you solved everything or missed everything still get a finite estimate. Error bars come from the curvature at the optimum. Because it's measured under time pressure, it reads lower than an untimed puzzle rating.
- **Accuracy by puzzle rating:** your solve rate per 100-point rating band.
- **Themes:** your solve rate per Lichess theme (fork, pin, mate in 2, and so on), weakest first.

## About the puzzle ratings

The ratings are Lichess's own Glicko-2 ratings, each estimated from thousands of attempts. By default the builder keeps only puzzles with rating deviation ≤ 80, at least 300 plays, popularity ≥ 80, and a solution of up to 4 of your moves. It then samples up to 150 puzzles per 50-point band from 400 to 3000. You can change any of these settings; run `python build_puzzles.py --help` to see the options.

These ratings are on Lichess's scale, not Chess.com's.

## Files

```
start.bat            launcher for Windows
serve.py             local web server + history API (standard library only)
build_puzzles.py     builds app/puzzles.json from the Lichess CSV
app/                 the app (plain HTML/CSS/JavaScript, no dependencies)
  js/chess.js        move generation, check/mate, SAN
  js/board.js        interactive board
  js/rush.js         run logic and puzzle selection
  js/stats.js        daily stats, performance rating, CSV export
  js/charts.js       SVG charts
data/                your history and backups (created on first run)
tests/perft.test.mjs move-generator check: node tests/perft.test.mjs
```

Puzzle data comes from the [Lichess puzzle database](https://database.lichess.org/#puzzles), released under CC0.
