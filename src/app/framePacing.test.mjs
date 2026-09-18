import test from 'node:test';
import assert from 'node:assert/strict';
import { installFramePacingGovernor } from './framePacing.js';

test('installFramePacingGovernor uncaps targetFrameRate for hardware VSync and cleans up', () => {
  const listeners = [];
  const fakeViewer = {
    targetFrameRate: 60,
    isDestroyed: () => false,
    scene: {
      primitives: {
        length: 1,
        get: () => ({ maximumScreenSpaceError: 16 }),
      },
      preRender: {
        addEventListener: (fn) => listeners.push(fn),
        removeEventListener: (fn) => {
          const idx = listeners.indexOf(fn);
          if (idx !== -1) listeners.splice(idx, 1);
        },
      },
    },
  };

  const uninstall = installFramePacingGovernor(fakeViewer);
  assert.equal(fakeViewer.targetFrameRate, undefined, 'targetFrameRate must be undefined to unlock VSync');
  assert.equal(listeners.length, 1, 'preRender listener must be installed');

  uninstall();
  assert.equal(listeners.length, 0, 'preRender listener must be removed on uninstall');
});

test('installFramePacingGovernor throws on invalid viewer', () => {
  assert.throws(() => installFramePacingGovernor(null), TypeError);
  assert.throws(() => installFramePacingGovernor({}), TypeError);
});
