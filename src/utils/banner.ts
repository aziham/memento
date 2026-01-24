/**
 * ASCII Banner
 *
 * Generates the MEMENTO ASCII art banner with white borders and gray-shaded fill.
 */

import { type ColorName, colors } from './colors';

// ═══════════════════════════════════════════════════════════════════════════════
// ASCII Art
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * MEMENTO ASCII art in block style.
 * Each line is a separate string for gradient application.
 */
const MEMENTO_ASCII = [
  '███╗   ███╗███████╗███╗   ███╗███████╗███╗   ██╗████████╗ ██████╗ ',
  '████╗ ████║██╔════╝████╗ ████║██╔════╝████╗  ██║╚══██╔══╝██╔═══██╗',
  '██╔████╔██║█████╗  ██╔████╔██║█████╗  ██╔██╗ ██║   ██║   ██║   ██║',
  '██║╚██╔╝██║██╔══╝  ██║╚██╔╝██║██╔══╝  ██║╚██╗██║   ██║   ██║   ██║',
  '██║ ╚═╝ ██║███████╗██║ ╚═╝ ██║███████╗██║ ╚████║   ██║   ╚██████╔╝',
  '╚═╝     ╚═╝╚══════╝╚═╝     ╚═╝╚══════╝╚═╝  ╚═══╝   ╚═╝    ╚═════╝ '
];

const TAGLINE = 'Memory that thinks, not just remembers';

// ═══════════════════════════════════════════════════════════════════════════════
// Banner Configuration
// ═══════════════════════════════════════════════════════════════════════════════

/** Box drawing characters */
const BOX = {
  topLeft: '╔',
  topRight: '╗',
  bottomLeft: '╚',
  bottomRight: '╝',
  horizontal: '═',
  vertical: '║'
} as const;

/** Border color (white) */
const BORDER_COLOR: ColorName = 'white';

/** Fill color for the block characters (single gray shade) */
const FILL_COLOR: ColorName = 'dim';

/** Banner dimensions */
const BANNER_WIDTH = 80;
const CONTENT_WIDTH = BANNER_WIDTH - 4; // Account for borders and padding

// ═══════════════════════════════════════════════════════════════════════════════
// Character Classification
// ═══════════════════════════════════════════════════════════════════════════════

/** Border/outline characters that should be white */
const BORDER_CHARS = new Set(['╔', '╗', '╚', '╝', '═', '║', '╠', '╣', '╦', '╩', '╬']);

/** Fill/block characters that should be gray shades */
const FILL_CHARS = new Set(['█', '▀', '▄', '▌', '▐', '░', '▒', '▓']);

/**
 * Determine if a character is a border character.
 */
function isBorderChar(char: string): boolean {
  return BORDER_CHARS.has(char);
}

/**
 * Determine if a character is a fill character.
 */
function isFillChar(char: string): boolean {
  return FILL_CHARS.has(char);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Banner Generation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Center text within a given width.
 */
function centerText(text: string, width: number): string {
  const visibleLength = text.length - countColorCodes(text);
  const padding = Math.max(0, width - visibleLength);
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
}

/**
 * Create a bordered line with content.
 */
function borderedLine(content: string): string {
  const border = colors[BORDER_COLOR];
  return `${border}${BOX.vertical}${colors.reset} ${content} ${border}${BOX.vertical}${colors.reset}`;
}

/**
 * Create a horizontal border line.
 */
function horizontalBorder(left: string, right: string): string {
  const border = colors[BORDER_COLOR];
  const line = BOX.horizontal.repeat(BANNER_WIDTH - 2);
  return `${border}${left}${line}${right}${colors.reset}`;
}

/**
 * Apply dual coloring to an ASCII art line.
 * Border characters get white, fill characters get the specified gray shade.
 */
function colorizeArtLine(line: string, fillColor: ColorName): string {
  let result = '';
  let currentColor: 'border' | 'fill' | 'none' = 'none';

  for (const char of line) {
    if (isBorderChar(char)) {
      if (currentColor !== 'border') {
        result += colors[BORDER_COLOR];
        currentColor = 'border';
      }
      result += char;
    } else if (isFillChar(char)) {
      if (currentColor !== 'fill') {
        result += colors[fillColor];
        currentColor = 'fill';
      }
      result += char;
    } else {
      if (currentColor !== 'none') {
        result += colors.reset;
        currentColor = 'none';
      }
      result += char;
    }
  }

  // Reset at end if needed
  if (currentColor !== 'none') {
    result += colors.reset;
  }

  return result;
}

/**
 * Generate the complete banner with box border and gradient ASCII art.
 */
export function generateBanner(): string {
  const lines: string[] = [];

  // Top border
  lines.push(horizontalBorder(BOX.topLeft, BOX.topRight));

  // Empty line
  lines.push(borderedLine(' '.repeat(CONTENT_WIDTH)));

  // ASCII art with dual coloring (white borders, gray fill)
  for (let i = 0; i < MEMENTO_ASCII.length; i++) {
    const artLine = MEMENTO_ASCII[i];
    if (!artLine) continue;

    const coloredLine = colorizeArtLine(artLine, FILL_COLOR);
    const centered = centerText(coloredLine, CONTENT_WIDTH);
    lines.push(borderedLine(padToWidth(centered, CONTENT_WIDTH)));
  }

  // Empty line
  lines.push(borderedLine(' '.repeat(CONTENT_WIDTH)));

  // Tagline (dim)
  const tagline = `${colors.dim}${centerText(TAGLINE, CONTENT_WIDTH)}${colors.reset}`;
  lines.push(borderedLine(padToWidth(tagline, CONTENT_WIDTH)));

  // Empty line
  lines.push(borderedLine(' '.repeat(CONTENT_WIDTH)));

  // Bottom border
  lines.push(horizontalBorder(BOX.bottomLeft, BOX.bottomRight));

  return lines.join('\n');
}

/**
 * Count ANSI color code characters in a string.
 * Used to calculate actual visible width.
 */
function countColorCodes(text: string): number {
  // Match ANSI escape sequences: ESC [ ... m
  // Using String.fromCharCode(27) to avoid literal escape character in regex
  const escapeChar = String.fromCharCode(27);
  const ansiRegex = new RegExp(`${escapeChar}\\[[0-9;]*m`, 'g');
  const matches = text.match(ansiRegex);
  return matches ? matches.reduce((sum, m) => sum + m.length, 0) : 0;
}

/**
 * Pad text to a specific visible width, accounting for color codes.
 */
function padToWidth(text: string, width: number): string {
  const visibleLength = text.length - countColorCodes(text);
  const padding = Math.max(0, width - visibleLength);
  return text + ' '.repeat(padding);
}

/**
 * Display the banner to the console.
 */
export function displayBanner(): void {
  console.log(generateBanner());
}
