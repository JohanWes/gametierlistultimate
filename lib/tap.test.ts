import { describe, expect, it, vi } from 'vitest';

import { tapProps } from './tap';

/** Minimal React.TouchEvent stand-in carrying just the fields tapProps reads. */
function touch(x: number, y: number) {
  return {
    touches: [{ clientX: x, clientY: y }],
    preventDefault: vi.fn(),
  } as unknown as React.TouchEvent;
}

describe('tapProps', () => {
  it('fires on a stationary tap (start then end, no move)', () => {
    const handler = vi.fn();
    const props = tapProps(handler);

    props.onTouchStart(touch(100, 100));
    const end = touch(100, 100);
    props.onTouchEnd(end);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(end.preventDefault).toHaveBeenCalled();
  });

  it('ignores the tap when the finger scrolled past the threshold', () => {
    const handler = vi.fn();
    const props = tapProps(handler);

    props.onTouchStart(touch(100, 100));
    props.onTouchMove(touch(100, 140)); // 40px vertical — a scroll
    const end = touch(100, 140);
    props.onTouchEnd(end);

    expect(handler).not.toHaveBeenCalled();
    expect(end.preventDefault).not.toHaveBeenCalled(); // let the browser scroll
  });

  it('still taps through small finger jitter under the threshold', () => {
    const handler = vi.fn();
    const props = tapProps(handler);

    props.onTouchStart(touch(100, 100));
    props.onTouchMove(touch(104, 103)); // 5px — within slop
    props.onTouchEnd(touch(104, 103));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('fires on a bare touchEnd with no preceding start (defaults to not-moved)', () => {
    const handler = vi.fn();
    const props = tapProps(handler);

    props.onTouchEnd(touch(0, 0));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('fires on a mouse/keyboard click', () => {
    const handler = vi.fn();
    tapProps(handler).onClick();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
