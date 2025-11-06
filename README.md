# Circular Text Entry

A simple browser app (HTML/CSS/JS) that renders a circular text entry system using SVG. The center shows the current letter, the middle ring shows 5 predicted next letters, and the outer ring shows the remaining letters. Buttons allow toggling numbers/symbols, shifting case, deleting, and inserting spaces.

## Run Locally

- Open `index.html` in any modern browser. No build or server required.

## Features

- Center letter display (default `a`).
- Middle ring: top 6 predicted next letters (adaptive predictor).
- Outer ring: remaining 21 letters, or digits/symbols when Numbers mode is active.
- Click letters/chars to add to the typed text and update predictions.
- Left controls: `Numbers` to toggle digits/symbols, `Shift` to toggle case.
- Right controls: `Delete` to undo (history stack), `Space` to add a space and reset predictions, `Clear` to erase all input and return to the initial single-ring layout.
- Pure SVG rendering for circles and text.

## Controls

- **Numbers**: toggles outer ring between letters and `0-9` plus `!@#$%^&*()`.
- **Shift**: toggles typed letters between lowercase and UPPERCASE.
- **Delete**: reverts to the previous state using a history stack.
- **Space**: inserts a space and resets the current letter to `a`.

## Files

- `index.html` — App markup and SVG container.
- `styles.css` — Layout, theme, and interaction styles.
- `main.js` — Logic for predictions, rendering, interactions, and history.

## Prediction Logic

The app uses an adaptive, session-learned bigram predictor:

- Maintains bigram and unigram counts from what you type (persisted in `localStorage`).
- Scores each letter by `P ≈ count(prev→letter) + 0.1 * count(letter)` and picks top 5.
- Fallbacks:
  - After a space, use common starters `["t","a","s","i","o"]` if no data.
  - Otherwise, fallback to English unigram order (`etaoin...`).

This avoids a fixed table and improves as you type. No network calls or backend required.

## Notes

- Runs entirely client-side.
- Tested on latest Chrome and Safari.
- Feel free to tweak radii, fonts, and the `NEXT` map to suit your needs.

