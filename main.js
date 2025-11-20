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

// Save state to history
function saveState() {
  history.push({
    currentLetter: currentLetter,
    typedText: typedText
  });
}

// Get available letters for outer ring
function getOuterRingLetters() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const predicted = getPredictedLetters();
  const used = [currentLetter.toLowerCase(), ...predicted.map(l => l.toLowerCase())];
  return alphabet.split('').filter(letter => !used.includes(letter));
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
  updateDisplay();
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
  updateDisplay();
}

// Delete last character
function deleteLast() {
  if (history.length === 0) return;

  const lastState = history.pop();
  currentLetter = lastState.currentLetter;
  typedText = lastState.typedText;
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
  updateDisplay();
}

// Clear all input and reset rings to initial state
function clearAll() {
  typedText = '';
  history = [];
  currentLetter = 'a';
  isNumbersMode = false;
  initialFullRing = true;
  numbersBtn.classList.remove('active');
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

// Event listeners
numbersBtn.addEventListener('click', toggleNumbers);
shiftBtn.addEventListener('click', toggleShift);
deleteBtn.addEventListener('click', deleteLast);
spaceBtn.addEventListener('click', addSpace);
clearBtn.addEventListener('click', clearAll);

// Initial display
loadCounts();
updateDisplay();