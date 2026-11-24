'use strict';

const fs = require('node:fs');
const vm = require('node:vm');

// Read the camera rails, the actual highland surface and both character gaits
// from the approved self-contained film. No WebGL context or network needed.
function loadSource(htmlPath) {
  const text = fs.readFileSync(htmlPath, 'utf8');
  const names = [1, 6, 12, 25, 26, 24];
  const modules = names.map(id => {
    const start = text.indexOf('const __howl_module_' + id + ' = (() => {');
    const end = text.indexOf('\n})();', start);
    if (start < 0 || end < 0) throw new Error('Original film module missing: ' + id);
    return text.slice(start, end + 6);
  });
  const common = { console };
  vm.runInNewContext(modules.join('\n') + [
    'globalThis.api = {',
    '  director: __howl_module_24.createDirection(__howl_module_6, "B"),',
    '  heightAt: __howl_module_6.heightAt,',
    '  turnip: __howl_module_12.sampleTurnipMotion,',
    '  fire: __howl_module_12.sampleFireMotion',
    '};',
  ].join('\n'), common, { filename: 'original-camera-and-character-rails.js' });
  return common.api;
}

module.exports = { loadSource };
