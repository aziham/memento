/**
 * Terminal Colors
 *
 * ANSI color codes for terminal output.
 * Provides a clean, type-safe API for colorizing terminal text.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// ANSI Color Codes
// ═══════════════════════════════════════════════════════════════════════════════

export const colors = {
  // Reset
  reset: '\x1b[0m',

  // Modifiers
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Bright foreground colors
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m'
} as const;

export type ColorName = keyof typeof colors;

// ═══════════════════════════════════════════════════════════════════════════════
// Color Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Apply a color to text.
 */
export function colorize(text: string, color: ColorName): string {
  return `${colors[color]}${text}${colors.reset}`;
}

/**
 * Apply multiple styles to text.
 */
export function style(text: string, ...styles: ColorName[]): string {
  const prefix = styles.map((s) => colors[s]).join('');
  return `${prefix}${text}${colors.reset}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Gradient Utilities
// ════════════════════════════════════════════��══════════════════════════════════

/**
 * Apply a gradient effect to text lines.
 * Cycles through the provided colors for each line.
 */
export function applyGradient(lines: string[], gradientColors: ColorName[]): string[] {
  if (gradientColors.length === 0) return lines;

  return lines.map((line, i) => {
    const color = gradientColors[i % gradientColors.length] as ColorName;
    return `${colors[color]}${line}${colors.reset}`;
  });
}

/**
 * Apply a horizontal gradient to a single line.
 * Divides the line into segments and applies colors progressively.
 */
export function horizontalGradient(text: string, gradientColors: ColorName[]): string {
  if (gradientColors.length === 0) return text;

  const firstColor = gradientColors[0];
  if (firstColor === undefined) return text;
  if (gradientColors.length === 1) return colorize(text, firstColor);

  const segmentLength = Math.ceil(text.length / gradientColors.length);
  let result = '';

  for (let i = 0; i < gradientColors.length; i++) {
    const color = gradientColors[i] as ColorName;
    const start = i * segmentLength;
    const end = Math.min(start + segmentLength, text.length);
    const segment = text.slice(start, end);
    result += `${colors[color]}${segment}`;
  }

  return `${result}${colors.reset}`;
}

// ══════════════════════════════════════════════���════════════════════════════════
// Convenience Functions
// ═══════════════════════════════════════════════════════════════════════════════

export const c = {
  reset: (text: string) => colorize(text, 'reset'),
  dim: (text: string) => colorize(text, 'dim'),
  bright: (text: string) => colorize(text, 'bright'),

  // Standard colors
  red: (text: string) => colorize(text, 'red'),
  green: (text: string) => colorize(text, 'green'),
  yellow: (text: string) => colorize(text, 'yellow'),
  blue: (text: string) => colorize(text, 'blue'),
  magenta: (text: string) => colorize(text, 'magenta'),
  cyan: (text: string) => colorize(text, 'cyan'),
  white: (text: string) => colorize(text, 'white'),
  gray: (text: string) => colorize(text, 'gray'),

  // Bright colors
  brightRed: (text: string) => colorize(text, 'brightRed'),
  brightGreen: (text: string) => colorize(text, 'brightGreen'),
  brightYellow: (text: string) => colorize(text, 'brightYellow'),
  brightBlue: (text: string) => colorize(text, 'brightBlue'),
  brightMagenta: (text: string) => colorize(text, 'brightMagenta'),
  brightCyan: (text: string) => colorize(text, 'brightCyan'),
  brightWhite: (text: string) => colorize(text, 'brightWhite'),

  // Semantic colors
  success: (text: string) => colorize(text, 'brightGreen'),
  warning: (text: string) => colorize(text, 'yellow'),
  error: (text: string) => colorize(text, 'brightRed'),
  info: (text: string) => colorize(text, 'brightCyan')
} as const;
