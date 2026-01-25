/**
 * Terminal Color Utility Tests
 *
 * Tests for ANSI color codes and styling functions.
 */

import { describe, expect, test } from 'bun:test';
import { applyGradient, c, colorize, colors, horizontalGradient, style } from '@/utils/colors';

// ═══════════════════════════════════════════════════════════════════════════════
// ANSI Code Constants
// ═══════════════════════════════════════════════════════════════════════════════

describe('colors constants', () => {
  test('reset code is correct', () => {
    expect(colors.reset).toBe('\x1b[0m');
  });

  test('dim modifier is correct', () => {
    expect(colors.dim).toBe('\x1b[2m');
  });

  test('bright modifier is correct', () => {
    expect(colors.bright).toBe('\x1b[1m');
  });

  test('standard colors are defined', () => {
    expect(colors.red).toBe('\x1b[31m');
    expect(colors.green).toBe('\x1b[32m');
    expect(colors.yellow).toBe('\x1b[33m');
    expect(colors.blue).toBe('\x1b[34m');
    expect(colors.magenta).toBe('\x1b[35m');
    expect(colors.cyan).toBe('\x1b[36m');
    expect(colors.white).toBe('\x1b[37m');
  });

  test('bright colors are defined', () => {
    expect(colors.brightRed).toBe('\x1b[91m');
    expect(colors.brightGreen).toBe('\x1b[92m');
    expect(colors.brightYellow).toBe('\x1b[93m');
    expect(colors.brightBlue).toBe('\x1b[94m');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Colorize Function
// ═══════════════════════════════════════════════════════════════════════════════

describe('colorize', () => {
  test('applies color with reset suffix', () => {
    const result = colorize('hello', 'red');
    expect(result).toBe('\x1b[31mhello\x1b[0m');
  });

  test('works with dim modifier', () => {
    const result = colorize('text', 'dim');
    expect(result).toBe('\x1b[2mtext\x1b[0m');
  });

  test('handles empty string', () => {
    const result = colorize('', 'green');
    expect(result).toBe('\x1b[32m\x1b[0m');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Style Function
// ═══════════════════════════════════════════════════════════════════════════════

describe('style', () => {
  test('applies single style', () => {
    const result = style('text', 'bright');
    expect(result).toBe('\x1b[1mtext\x1b[0m');
  });

  test('chains multiple styles', () => {
    const result = style('text', 'bright', 'red');
    expect(result).toBe('\x1b[1m\x1b[31mtext\x1b[0m');
  });

  test('handles no styles (edge case)', () => {
    const result = style('text');
    expect(result).toBe('text\x1b[0m');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Convenience Functions (c object)
// ═══════════════════════════════════════════════════════════════════════════════

describe('c convenience functions', () => {
  test('c.dim applies dim color', () => {
    expect(c.dim('text')).toBe('\x1b[2mtext\x1b[0m');
  });

  test('c.red applies red color', () => {
    expect(c.red('error')).toBe('\x1b[31merror\x1b[0m');
  });

  test('c.brightGreen applies bright green', () => {
    expect(c.brightGreen('success')).toBe('\x1b[92msuccess\x1b[0m');
  });

  test('semantic colors map correctly', () => {
    // success = brightGreen
    expect(c.success('ok')).toBe(c.brightGreen('ok'));
    // warning = yellow
    expect(c.warning('warn')).toBe(c.yellow('warn'));
    // error = brightRed
    expect(c.error('fail')).toBe(c.brightRed('fail'));
    // info = brightCyan
    expect(c.info('note')).toBe(c.brightCyan('note'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Gradient Functions
// ═══════════════════════════════════════════════════════════════════════════════

describe('applyGradient', () => {
  test('applies colors to each line cyclically', () => {
    const lines = ['line1', 'line2', 'line3'];
    const result = applyGradient(lines, ['red', 'green']);

    expect(result[0]).toContain(colors.red);
    expect(result[1]).toContain(colors.green);
    expect(result[2]).toContain(colors.red); // Cycles back
  });

  test('returns original lines for empty gradient', () => {
    const lines = ['line1', 'line2'];
    const result = applyGradient(lines, []);
    expect(result).toEqual(lines);
  });
});

describe('horizontalGradient', () => {
  test('applies single color for single-element gradient', () => {
    const result = horizontalGradient('hello', ['blue']);
    expect(result).toBe(colorize('hello', 'blue'));
  });

  test('splits text across colors', () => {
    const result = horizontalGradient('abcd', ['red', 'green']);

    // Should contain both colors
    expect(result).toContain(colors.red);
    expect(result).toContain(colors.green);
    expect(result).toContain(colors.reset);
  });

  test('returns original text for empty gradient', () => {
    const result = horizontalGradient('text', []);
    expect(result).toBe('text');
  });
});
