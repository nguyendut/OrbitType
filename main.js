// Adaptive prediction: session-learned bigrams with smoothing and fallbacks
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const CANDIDATES = (ALPHABET + ' ').split('');
const DEFAULT_STARTERS = ['t', 'a', 's', 'i', 'o', 'h'];
const DEFAULT_UNIGRAM_ORDER = 'etaoinshrdlcumwfgypbvkjxqz';
const STORAGE_KEY = 'circular_text_entry_counts_v1';

const counts = {
  bi: Object.create(null), // key: prev+next
  uni: Object.create(null) // key: char
};

function loadCounts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      counts.bi = Object.assign(Object.create(null), data.bi || {});
      counts.uni = Object.assign(Object.create(null), data.uni || {});
    }
  } catch (_) { }
}

function saveCounts() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
  } catch (_) { }
}

function observeChar(prevChar, nextChar) {
  const p = (prevChar || ' ').toLowerCase();
  const n = (nextChar || ' ').toLowerCase();
  counts.uni[n] = (counts.uni[n] || 0) + 1;
  const key = p + n;
  counts.bi[key] = (counts.bi[key] || 0) + 1;
  saveCounts();
}

// Application state
let currentLetter = 'a';
let typedText = '';
let history = [];
let isUppercase = false;
let isNumbersMode = false;
let initialFullRing = true; // show all letters in a big circle initially
let targetText = '';
let sessionStart = null;
let lastInputTime = null;
let sessionEnd = null;
const entryLog = [];

// Trial system state
let trialMode = false;
let currentTrialIndex = 0;
const trialSentences = [
  "She packed twelve blue pens in her small bag.",
  "Every bird sang sweet songs in the quiet dawn.",
  "They watched clouds drift across the golden sky.",
  "A clever mouse slipped past the sleepy cat.",
  "Green leaves danced gently in the warm breeze.",
  "He quickly wrote notes before the test began.",
  "The tall man wore boots made of soft leather.",
  "Old clocks ticked loudly in the silent room."
];
const allTrialLogs = [];

// Digits and symbols
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*().';

// Initialize SVG
const svg = document.getElementById('circleSvg');
const typedTextDisplay = document.getElementById('typedText');
const numbersBtn = document.getElementById('numbersBtn');
const shiftBtn = document.getElementById('shiftBtn');
const deleteBtn = document.getElementById('deleteBtn');
const spaceBtn = document.getElementById('spaceBtn');
const clearBtn = document.getElementById('clearBtn');
const periodBtn = document.getElementById('periodBtn');
const exportLogBtn = document.getElementById('exportLogBtn');
const targetInput = document.getElementById('targetInput');
const wpmValue = document.getElementById('wpmValue');
const msdValue = document.getElementById('msdValue');
const dropdownBtn = document.getElementById('dropdownBtn');
const dropdownMenu = document.getElementById('dropdownMenu');
const startTrialBtn = document.getElementById('startTrialBtn');
const nextTrialBtn = document.getElementById('nextTrialBtn');
const startOverBtn = document.getElementById('startOverBtn');
const trialInfo = document.getElementById('trialInfo');
const trialCounter = document.getElementById('trialCounter');

// Save state to history
function saveState() {
  history.push({
    currentLetter: currentLetter,
    typedText: typedText
  });
}

function logEvent(type, value) {
  entryLog.push({
    type,
    value,
    timestampMs: performance.now(),
    text: typedText
  });
}

// Track keystrokes to compute WPM and MSD
function recordInput(isTerminal = false) {
  const now = performance.now();
  if (typedText.length === 0) {
    sessionStart = null;
    lastInputTime = null;
    sessionEnd = null;
    updateMetrics();
    return;
  }

  if (!sessionStart) {
    sessionStart = now;
  }
  lastInputTime = now;
  if (isTerminal && !sessionEnd) {
    sessionEnd = now;
  }
  updateMetrics();
}

function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,       // deletion
        dp[i][j - 1] + 1,       // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

function computeWpm() {
  if (!sessionStart || !lastInputTime || typedText.length === 0) return null;
  const endTime = sessionEnd || lastInputTime;
  const elapsedMinutes = (endTime - sessionStart) / 60000;
  if (elapsedMinutes <= 0) return null;
  return (typedText.length / 5) / elapsedMinutes;
}

function updateMetrics() {
  const wpm = computeWpm();
  wpmValue.textContent = wpm ? wpm.toFixed(1) : '--';

  const msd = computeMsd();
  msdValue.textContent = msd !== null ? String(msd) : '--';
}

function handleTargetChange(event) {
  targetText = event.target.value;
  updateMetrics();
}

function resetShiftAfterInput() {
  if (isUppercase) {
    isUppercase = false;
    shiftBtn.classList.remove('active');
  }
}

function computeMsd() {
  if (!targetText) return null;
  return levenshteinDistance(targetText, typedText);
}

function computeMsdForText(text) {
  if (!targetText) return null;
  return levenshteinDistance(targetText, text);
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function exportLog() {
  const wpm = computeWpm();
  const msd = computeMsd();
  const rows = [];
  rows.push(['target_phrase', targetText || '']);
  rows.push(['wpm', wpm ? wpm.toFixed(2) : '']);
  rows.push(['msd', msd !== null ? msd : '']);
  rows.push([]);
  rows.push(['index', 'type', 'value', 'timestamp_s', 'text_after', 'msd']);

  const start = sessionStart ?? (entryLog[0] ? entryLog[0].timestampMs : 0);
  const initialMsd = computeMsdForText('');
  rows.push([
    0,
    'start',
    '',
    '0.000',
    '',
    initialMsd !== null ? initialMsd : ''
  ]);

  entryLog.forEach((entry, idx) => {
    const tsSeconds = start ? (entry.timestampMs - start) / 1000 : entry.timestampMs / 1000;
    const msdEntry = computeMsdForText(entry.text);
    rows.push([
      idx + 1,
      entry.type,
      entry.value,
      tsSeconds.toFixed(3),
      entry.text,
      msdEntry !== null ? msdEntry : ''
    ]);
  });

  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safeTarget = (targetText || 'target').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'target';
  const a = document.createElement('a');
  a.href = url;
  a.download = `entry-log-${safeTarget}-${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Get available letters for outer ring
function getOuterRingLetters() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  // Return all letters, regardless of whether they're in the middle ring or center
  return alphabet.split('');
}

// Get predicted letters based on current letter (adaptive)
function getPredictedLetters() {
  const prev = currentLetter.toLowerCase();
  const k = 6;
  const allowSpace = /[a-z]/.test(prev) || /[\.,!\?;:]/.test(prev);

  // Score letters (exclude space here; add it explicitly if allowed)
  const options = [];
  for (const c of ALPHABET) {
    const bi = counts.bi[(prev || ' ') + c] || 0;
    const uni = counts.uni[c] || 0;
    const score = bi + 0.1 * uni; // simple smoothing
    options.push({ c, score });
  }

  const allZero = options.every(o => o.score === 0);
  if (allZero) {
    if (prev === ' ') return DEFAULT_STARTERS.slice(0, k);
    let base = DEFAULT_UNIGRAM_ORDER.split('');
    // Ensure duplicate allowed: make sure prev is present and preferred
    if (ALPHABET.includes(prev) && !base.includes(prev)) base.unshift(prev);
    if (ALPHABET.includes(prev) && base[0] !== prev) {
      base = [prev, ...base.filter(ch => ch !== prev)];
    }
    // Take top by fallback order, then sort alphabetically for stable positions
    const take = allowSpace ? k - 1 : k;
    let letters = base.slice(0, take);
    letters = Array.from(new Set(letters)).filter(ch => ALPHABET.includes(ch));
    letters.sort();
    return allowSpace ? [' ', ...letters] : letters;
  }

  // Score-based selection, then alphabetical display
  const take = allowSpace ? k - 1 : k;
  let letters = options
    .sort((a, b) => b.score - a.score)
    .slice(0, take)
    .map(o => o.c);

  // Guarantee duplicate letter option: include prev if alphabetic and missing
  if (ALPHABET.includes(prev) && !letters.includes(prev)) {
    letters = [prev, ...letters.filter(c => c !== prev)];
    letters = letters.slice(0, take);
  }

  letters = Array.from(new Set(letters)).filter(ch => ALPHABET.includes(ch));
  letters.sort();
  return allowSpace ? [' ', ...letters] : letters;
}

// Update the display
function updateDisplay() {
  // Clear SVG
  svg.innerHTML = '';

  const centerX = 400;
  const centerY = 400;

  // Helpers for slices
  function polarToCartesian(cx, cy, r, angle) {
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }

  function donutSlicePath(cx, cy, rInner, rOuter, startA, endA) {
    const largeArc = endA - startA > Math.PI ? 1 : 0;
    const p1 = polarToCartesian(cx, cy, rOuter, startA);
    const p2 = polarToCartesian(cx, cy, rOuter, endA);
    const p3 = polarToCartesian(cx, cy, rInner, endA);
    const p4 = polarToCartesian(cx, cy, rInner, startA);
    return [
      `M ${p1.x} ${p1.y}`,
      `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
      `L ${p3.x} ${p3.y}`,
      `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
      'Z'
    ].join(' ');
  }

  // Initial state: show a single big ring with all letters as slices
  if (initialFullRing && typedText === '') {
    const rOuter = 360;
    const rInner = 280;
    
    if (isNumbersMode) {
      // Show digits and symbols in numbers mode
      const allChars = (DIGITS + SYMBOLS).split('');
      const n = allChars.length;
      allChars.forEach((char, i) => {
        const startA = (i / n) * 2 * Math.PI - Math.PI / 2;
        const endA = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', donutSlicePath(centerX, centerY, rInner, rOuter, startA, endA));
        path.setAttribute('class', 'slice');
        path.addEventListener('click', () => selectChar(char));
        svg.appendChild(path);

        const midA = (startA + endA) / 2;
        const rx = (rInner + rOuter) / 2;
        const p = polarToCartesian(centerX, centerY, rx, midA);
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', p.x);
        text.setAttribute('y', p.y);
        text.setAttribute('class', 'letter-text');
        text.setAttribute('font-size', '20');
        text.textContent = char;
        svg.appendChild(text);
      });
    } else {
      // Show letters in normal mode
      const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
      const n = letters.length;
      letters.forEach((letter, i) => {
        const startA = (i / n) * 2 * Math.PI - Math.PI / 2;
        const endA = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', donutSlicePath(centerX, centerY, rInner, rOuter, startA, endA));
        path.setAttribute('class', 'slice');
        path.addEventListener('click', () => selectLetter(letter));
        svg.appendChild(path);

        const midA = (startA + endA) / 2;
        const rx = (rInner + rOuter) / 2;
        const p = polarToCartesian(centerX, centerY, rx, midA);
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', p.x);
        text.setAttribute('y', p.y);
        text.setAttribute('class', 'letter-text');
        text.textContent = isUppercase ? letter.toUpperCase() : letter;
        svg.appendChild(text);
      });
    }

    typedTextDisplay.textContent = typedText || 'Start typing...';
    return;
  }

  // Draw center circle and letter
  const centerRadius = 80;
  const centerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  centerCircle.setAttribute('cx', centerX);
  centerCircle.setAttribute('cy', centerY);
  centerCircle.setAttribute('r', centerRadius);
  centerCircle.setAttribute('class', 'circle-ring');
  centerCircle.setAttribute('fill', 'rgba(255, 255, 255, 0.2)');
  centerCircle.setAttribute('stroke', 'white');
  centerCircle.setAttribute('stroke-width', '3');
  svg.appendChild(centerCircle);

  const centerText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  centerText.setAttribute('x', centerX);
  centerText.setAttribute('y', centerY);
  centerText.setAttribute('class', 'center-letter');
  const centerDisplay = currentLetter === ' ' ? '␣' : (isUppercase ? currentLetter.toUpperCase() : currentLetter);
  centerText.textContent = centerDisplay;
  svg.appendChild(centerText);

  // Draw middle ring (predictions) as 5 equal slices
  const predicted = getPredictedLetters();
  const middleCount = Math.max(1, predicted.length);
  const midInner = 150;
  const midOuter = 220;
  predicted.forEach((letter, index) => {
    const startA = (index / middleCount) * 2 * Math.PI - Math.PI / 2;
    const endA = ((index + 1) / middleCount) * 2 * Math.PI - Math.PI / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', donutSlicePath(centerX, centerY, midInner, midOuter, startA, endA));
    path.setAttribute('class', 'slice');
    path.addEventListener('click', () => selectLetter(letter));
    svg.appendChild(path);

    const midA = (startA + endA) / 2;
    const rx = (midInner + midOuter) / 2;
    const p = polarToCartesian(centerX, centerY, rx, midA);
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', p.x);
    text.setAttribute('y', p.y);
    text.setAttribute('class', 'letter-text');
    const display = letter === ' ' ? '␣' : (isUppercase ? letter.toUpperCase() : letter);
    text.textContent = display;
    svg.appendChild(text);
  });

  // Draw outer ring (remaining letters) as slices
  if (isNumbersMode) {
    // Show digits and symbols
    const allChars = (DIGITS + SYMBOLS).split('');
    const outerCount = allChars.length;
    const outInner = 250;
    const outOuter = 360;
    allChars.forEach((char, index) => {
      const startA = (index / outerCount) * 2 * Math.PI - Math.PI / 2;
      const endA = ((index + 1) / outerCount) * 2 * Math.PI - Math.PI / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', donutSlicePath(centerX, centerY, outInner, outOuter, startA, endA));
      path.setAttribute('class', 'slice');
      path.addEventListener('click', () => selectChar(char));
      svg.appendChild(path);

      const midA = (startA + endA) / 2;
      const rx = (outInner + outOuter) / 2;
      const p = polarToCartesian(centerX, centerY, rx, midA);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', p.x);
      text.setAttribute('y', p.y);
      text.setAttribute('class', 'letter-text');
      text.setAttribute('font-size', '20');
      text.textContent = char;
      svg.appendChild(text);
    });
  } else {
    const outerLetters = getOuterRingLetters();
    const outerCount = outerLetters.length;
    const outInner = 250;
    const outOuter = 360;
    outerLetters.forEach((letter, index) => {
      const startA = (index / outerCount) * 2 * Math.PI - Math.PI / 2;
      const endA = ((index + 1) / outerCount) * 2 * Math.PI - Math.PI / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', donutSlicePath(centerX, centerY, outInner, outOuter, startA, endA));
      path.setAttribute('class', 'slice');
      path.addEventListener('click', () => selectLetter(letter));
      svg.appendChild(path);

      const midA = (startA + endA) / 2;
      const rx = (outInner + outOuter) / 2;
      const p = polarToCartesian(centerX, centerY, rx, midA);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', p.x);
      text.setAttribute('y', p.y);
      text.setAttribute('class', 'letter-text');
      const display = letter === ' ' ? '␣' : (isUppercase ? letter.toUpperCase() : letter);
      text.textContent = display;
      svg.appendChild(text);
    });
  }

  // Update typed text display
  typedTextDisplay.textContent = typedText || 'Start typing...';
}

// Select a letter (from predictions or outer ring)
function selectLetter(letter) {
  saveState();
  const letterToAdd = isUppercase ? letter.toUpperCase() : letter;
  const prevChar = typedText.length ? typedText[typedText.length - 1] : ' ';
  typedText += letterToAdd;
  observeChar(prevChar, letter);
  currentLetter = letter.toLowerCase();
  initialFullRing = false;
  logEvent('insert', letterToAdd);
  resetShiftAfterInput();
  recordInput();
  updateDisplay();
  checkTrialCompletion();
}

// Select a character (digits/symbols)
function selectChar(char) {
  saveState();
  const prevChar = typedText.length ? typedText[typedText.length - 1] : ' ';
  typedText += char;
  if (ALPHABET.includes(char.toLowerCase()) || char === ' ') {
    observeChar(prevChar, char);
  } else {
    counts.uni[char] = (counts.uni[char] || 0) + 1;
    saveCounts();
  }
  initialFullRing = false;
  logEvent('insert', char);
  resetShiftAfterInput();
  recordInput(char === '.');
  updateDisplay();
  checkTrialCompletion();
}

// Delete last character
function deleteLast() {
  if (history.length === 0) return;

  const removedChar = typedText.slice(-1);
  const lastState = history.pop();
  currentLetter = lastState.currentLetter;
  typedText = lastState.typedText;
  sessionEnd = null;
  logEvent('delete', removedChar);
  recordInput();
  updateDisplay();
}

// Add space
function addSpace() {
  saveState();
  const prevChar = typedText.length ? typedText[typedText.length - 1] : ' ';
  typedText += ' ';
  // Reset to default after space
  currentLetter = ' ';
  observeChar(prevChar, ' ');
  initialFullRing = false;
  logEvent('insert', ' ');
  resetShiftAfterInput();
  recordInput();
  updateDisplay();
  checkTrialCompletion();
}

function addPeriod() {
  selectChar('.');
}

// Clear all input and reset rings to initial state
function clearAll() {
  typedText = '';
  history = [];
  currentLetter = 'a';
  isNumbersMode = false;
  isUppercase = false;
  initialFullRing = true;
  numbersBtn.classList.remove('active');
  shiftBtn.classList.remove('active');
  entryLog.length = 0;
  sessionStart = null;
  lastInputTime = null;
  sessionEnd = null;
  recordInput();
  updateDisplay();
}

// Toggle numbers mode
function toggleNumbers() {
  isNumbersMode = !isNumbersMode;
  numbersBtn.textContent = isNumbersMode ? 'Letters' : '123/?.$%';
  updateDisplay();
}

// Toggle case
function toggleShift() {
  isUppercase = !isUppercase;
  shiftBtn.classList.toggle('active', isUppercase);
  updateDisplay();
}

// Trial system functions
function startTrial() {
  trialMode = true;
  currentTrialIndex = 0;
  allTrialLogs.length = 0;
  loadTrialSentence();
  startTrialBtn.style.display = 'none';
  trialInfo.style.display = 'flex';
  nextTrialBtn.disabled = false;
  nextTrialBtn.style.display = 'inline-block';
  nextTrialBtn.textContent = 'Next Trial';
  startOverBtn.style.display = 'none';
  updateTrialCounter();
}

function loadTrialSentence() {
  clearAll();
  targetText = trialSentences[currentTrialIndex];
  targetInput.value = targetText;
  updateMetrics();
}

function updateTrialCounter() {
  trialCounter.textContent = `Trial ${currentTrialIndex + 1} of ${trialSentences.length}`;
}

function checkTrialCompletion() {
  if (!trialMode) return;

  // Check if typed text matches target exactly
  if (typedText === targetText) {
    // Save this trial's log
    const trialData = {
      trialNumber: currentTrialIndex + 1,
      targetText: targetText,
      wpm: computeWpm(),
      msd: computeMsd(),
      log: entryLog.slice()
    };
    allTrialLogs.push(trialData);

    // All trials complete
    if (currentTrialIndex >= trialSentences.length - 1) {
      trialCounter.textContent = 'All trials complete!';
      nextTrialBtn.style.display = 'none';
      startOverBtn.style.display = 'inline-block';
      exportAllTrials();
    }
  }
}

function nextTrial() {
  // If on last trial and button says "Finish", export all results
  if (currentTrialIndex >= trialSentences.length - 1 && nextTrialBtn.textContent === 'Finish') {
    // Save final trial data if not already saved
    if (typedText.length > 0 && allTrialLogs.length <= currentTrialIndex) {
      const trialData = {
        trialNumber: currentTrialIndex + 1,
        targetText: targetText,
        wpm: computeWpm(),
        msd: computeMsd(),
        log: entryLog.slice()
      };
      allTrialLogs.push(trialData);
    }
    trialCounter.textContent = 'All trials complete!';
    nextTrialBtn.style.display = 'none';
    startOverBtn.style.display = 'inline-block';
    exportAllTrials();
    return;
  }

  // Save current trial data before moving to next
  if (typedText.length > 0) {
    const trialData = {
      trialNumber: currentTrialIndex + 1,
      targetText: targetText,
      wpm: computeWpm(),
      msd: computeMsd(),
      log: entryLog.slice()
    };
    // Only add if not already added (by checkTrialCompletion)
    if (allTrialLogs.length <= currentTrialIndex) {
      allTrialLogs.push(trialData);
    }
  }

  currentTrialIndex++;
  if (currentTrialIndex < trialSentences.length) {
    loadTrialSentence();
    updateTrialCounter();

    // Update button text if now on last trial
    if (currentTrialIndex >= trialSentences.length - 1) {
      nextTrialBtn.textContent = 'Finish';
    } else {
      nextTrialBtn.textContent = 'Next Trial';
    }
  }
}

function startOver() {
  startTrial();
}

function exportAllTrials() {
  const rows = [];
  rows.push(['Trial System Results']);
  rows.push(['Total Trials', trialSentences.length]);
  rows.push([]);

  allTrialLogs.forEach((trial) => {
    rows.push([`Trial ${trial.trialNumber}`]);
    rows.push(['Target', trial.targetText]);
    rows.push(['WPM', trial.wpm ? trial.wpm.toFixed(2) : '']);
    rows.push(['MSD', trial.msd !== null ? trial.msd : '']);
    rows.push([]);
    rows.push(['index', 'type', 'value', 'timestamp_s', 'text_after', 'msd']);

    const start = trial.log[0] ? trial.log[0].timestampMs : 0;
    trial.log.forEach((entry, idx) => {
      const tsSeconds = (entry.timestampMs - start) / 1000;
      const msdEntry = computeMsdForText(entry.text);
      rows.push([
        idx + 1,
        entry.type,
        entry.value,
        tsSeconds.toFixed(3),
        entry.text,
        msdEntry !== null ? msdEntry : ''
      ]);
    });
    rows.push([]);
  });

  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const a = document.createElement('a');
  a.href = url;
  a.download = `trial-results-${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Event listeners
numbersBtn.addEventListener('click', toggleNumbers);
shiftBtn.addEventListener('click', toggleShift);
deleteBtn.addEventListener('click', deleteLast);
spaceBtn.addEventListener('click', addSpace);
clearBtn.addEventListener('click', clearAll);
targetInput.addEventListener('input', handleTargetChange);
exportLogBtn.addEventListener('click', exportLog);
periodBtn.addEventListener('click', addPeriod);
dropdownBtn.addEventListener('click', toggleDropdown);
startTrialBtn.addEventListener('click', startTrial);
nextTrialBtn.addEventListener('click', nextTrial);
startOverBtn.addEventListener('click', startOver);

// Load sentences from JSON and populate dropdown menu
async function loadSentences() {
  try {
    const response = await fetch('sentences.json');
    const sentences = await response.json();
    
    // Clear existing items
    dropdownMenu.innerHTML = '';
    
    // Add each sentence as a dropdown item
    sentences.forEach(sentence => {
      const item = document.createElement('div');
      item.className = 'dropdown-menu-item';
      item.textContent = sentence;
      item.addEventListener('click', () => {
        targetInput.value = sentence;
        targetText = sentence;
        updateMetrics();
        dropdownMenu.classList.remove('show');
      });
      dropdownMenu.appendChild(item);
    });
  } catch (error) {
    console.error('Error loading sentences:', error);
  }
}

// Toggle dropdown menu
function toggleDropdown() {
  dropdownMenu.classList.toggle('show');
}

// Close dropdown when clicking outside
document.addEventListener('click', (event) => {
  const inputContainer = targetInput.closest('.input-with-dropdown');
  if (!inputContainer.contains(event.target)) {
    dropdownMenu.classList.remove('show');
  }
});

// Initial display
loadCounts();
loadSentences();
updateDisplay();
updateMetrics();

// Expose log for debugging/export
window.getEntryLog = () => entryLog.slice();
