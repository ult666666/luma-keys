// Run against the real renderer in the isolated hand lab, not a fake GPU:
//   const { checkHandShadowUpdates } = await import('/scripts/hand-shadow-checks.mjs');
//   await checkHandShadowUpdates(window.hands3d);
// Exercise both default half-resolution shadows and ?shadowRes=1.
export async function checkHandShadowUpdates(hands, { warm = true } = {}) {
  const checks = [];
  const assert = (condition, message) => {
    if (!condition) throw new Error(`Hand shadows: ${message}`);
  };
  const view = hands.view;
  assert(view && Object.values(hands.hands).some(h => h.frame), 'start with a posed hand');
  const geometry = {
    keyWidth: view.u, keysHeight: view.h, bedHeight: view.bed,
    stripLeftPx: view.left, viewportWidthPx: view.width, topPx: view.top,
    dpr: view.dpr, elevation: view.deg, squash: view.squash,
  };
  const frames = Object.fromEntries(Object.entries(hands.hands).map(([name, h]) =>
    [name, h.frame ? structuredClone(h.frame.motion || h.frame) : null]));
  const alphas = Object.fromEntries(Object.entries(hands.hands).map(([name, h]) => [name, h.alpha]));
  const dims = Object.fromEntries(Object.entries(hands.hands).map(([name, h]) => [name, h.dim]));
  const ink = structuredClone(hands.ink);
  const receiver = hands.scene.children.find(object => object.isMesh && !object.isSkinnedMesh);
  assert(receiver?.geometry, 'shadow receiver exists');
  const position = receiver.geometry.getAttribute('position');
  const originalRender = hands.renderer.render;
  let lastCasterStrengths = null;
  hands.renderer.render = function (...args) {
    const cast = receiver.material.uniforms?.uCastB?.value;
    if (cast) lastCasterStrengths = cast.map(value => value.w);
    return originalRender.apply(this, args);
  };
  const build = (name, expected, act) => {
    const before = hands.shadowBuilds;
    act();
    assert(hands.shadowBuilds === before + expected,
      `${name}: expected ${expected} builds, got ${hands.shadowBuilds - before}`);
    checks.push({ name, builds: expected });
  };
  try {
    hands.render();
    const originalContacts = JSON.stringify(hands.diagnostics());
    const originalVertices = Array.from(position.array);
    build('pose and opacity coalesce before drawing', 1, () => {
      const before = hands.shadowBuilds;
      hands.setPoses(frames);
      hands.setOpacity(alphas, dims);
      assert(hands.shadowBuilds === before, 'mutations must defer work until drawing');
      hands.render();
    });
    assert(JSON.stringify(hands.diagnostics()) === originalContacts, 'held contacts must stay identical');
    assert(position.array.every((n, i) => n === originalVertices[i]), 'same pose retains receiver vertices');

    build('unchanged redraw reuses shadow geometry', 0, () => hands.render());
    build('latest opacity is applied once', 1, () => {
      hands.setOpacity({ left: 0.3, right: 0.3 });
      hands.setOpacity({ left: 0.7, right: 0.7 });
      hands.render();
    });
    assert(lastCasterStrengths?.some(n => Math.abs(n - 0.7) < 1e-9), 'casters must use the latest opacity');
    build('skin dimming leaves shadow geometry reusable', 0, () => {
      hands.setOpacity({ left: 0.7, right: 0.7 }, { left: 1, right: 1 });
      hands.render();
    });
    assert(Object.values(hands.hands).every(h => h.uniforms.uDim.value === 1), 'skin dim updates');
    build('resized key surfaces invalidate shadow geometry', 1, () => {
      hands.setKeyboardGeometry({ ...geometry, viewportWidthPx: geometry.viewportWidthPx - 1 });
      hands.render();
    });
    build('room colour and teaching ink do not rebuild geometry', 0, () => {
      hands.setRoom({ shadow: [90, 80, 110] });
      hands.setInk({ left: { rgb: [90, 160, 210] }, right: { rgb: [220, 150, 80] } });
      hands.render();
    });
    assert(hands.ink.left.rgb.join(',') === '90,160,210', 'teaching ink updates');
    build('removing hands clears their shadow receivers', 1, () => {
      hands.setPoses(null);
      hands.render();
    });
    assert(receiver.geometry.drawRange.count === 0, 'no stale hand shadow quads');

    // A failed build must retry rather than drawing stale geometry forever.
    hands.setPoses(frames);
    const originalRange = position.addUpdateRange;
    const beforeFailure = hands.shadowBuilds;
    try {
      position.addUpdateRange = () => { throw new Error('shadow-build-check'); };
      let failed = false;
      try { hands.render(); } catch (error) { failed = error.message === 'shadow-build-check'; }
      assert(failed && hands.shadowBuilds === beforeFailure, 'failed build stays pending');
    } finally {
      position.addUpdateRange = originalRange;
    }
    build('failed shadow build retries on next draw', 1, () => hands.render());

    if (warm) {
      const beforeWarm = hands.shadowBuilds;
      assert(await hands.warm({ step: async () => {} }), 'renderer warm-up completes');
      assert(hands.shadowBuilds === beforeWarm + 1, 'warm-up builds once before its direct draw');
      checks.push({ name: 'direct warm-up drawing refreshes shadows', builds: 1 });
      build('warm-up cleanup clears reference shadows', 1, () => hands.render());
      assert(receiver.geometry.drawRange.count === 0, 'warm-up leaves no reference shadow');
    }
    return { passed: true, checks, shadowBuilds: hands.shadowBuilds };
  } finally {
    hands.renderer.render = originalRender;
    hands.setKeyboardGeometry(geometry);
    hands.setPoses(frames);
    hands.setOpacity(alphas, dims);
    hands.setRoom();
    hands.setInk(ink);
    hands.render();
  }
}
