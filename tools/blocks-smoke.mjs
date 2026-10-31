// Drive the blocks in headless Chromium: every behavior of every thing in
// every world draws as Blockly blocks; clicking a script runs it and its
// blocks glow; numbers, text and menus can be changed and the program follows;
// blocks can be dragged, deleted and undone; and every block in the palette
// can be dragged into a behavior, where it snaps in and the program still
// runs. Screenshots go to outdir.
// usage: node tools/blocks-smoke.mjs [url] [outdir] [chromium executable]
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { parse } from 'acorn';
import { codeToBlocks } from '../src/blocks/fromcode.js';
import { WORLDS } from '../src/world/worlds.js';

const url = (() => { const u = new URL(process.argv[2] ?? 'http://localhost:5173/'); if (!u.searchParams.has('fx')) u.searchParams.set('fx', 'low'); return u.href; })();
const out = process.argv[3] ?? '.';
mkdirSync(out, { recursive: true });
const exe = process.argv[4] ?? ['/opt/pw-browsers/chromium'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) { failed++; process.exitCode = 1; } };
const parses = (code) => { try { parse(code, { ecmaVersion: 'latest', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true }); return true; } catch { return false; } };
const countBlocks = (json) => {
  let n = 0;
  const walk = (b) => {
    if (!b) return;
    n++;
    for (const inp of Object.values(b.inputs ?? {})) walk(inp.block ?? inp.shadow); // Blockly keeps a covered shadow as state, not a block
    walk(b.next?.block);
  };
  for (const b of json.blocks.blocks) walk(b);
  return n;
};

const running = () => page.evaluate(() => window.__bb.session.running());
const waitRunning = (ms = 30000) => page.waitForFunction(() => { const r = window.__bb?.session?.running?.(); return r && r.every((p) => p.endsWith(':ok')); }, null, { timeout: ms });
const select = async (key) => { await page.evaluate((k) => window.__bb.app.select(window.__bb.world.actor(k)), key); await page.waitForTimeout(250); };
const errorLines = () => page.evaluate(() => [...document.querySelectorAll('#console-body .error')].map((e) => e.textContent));
// the view of a behavior of the selected thing (by its index in the list)
const VIEW = `(i) => { const a = window.__bb.app.selected; const b = window.__bb.session.behaviorsOf(a.key)[i]; return window.__bb.app.blockViews.get(a.key + ':' + b.id); }`;
const codeOf = (i) => page.evaluate((i) => window.__bb.session.behaviorsOf(window.__bb.app.selected.key)[i].code, i);
// screen rect of a block's own shape (not its children)
const rectOf = (i, pred) => page.evaluate(([i, VIEW, pred]) => {
  const v = eval(VIEW)(i);
  const b = v.ws.getAllBlocks(true).find(new Function('b', `return ${pred}`));
  if (!b) return null;
  b.getSvgRoot().scrollIntoView?.({ block: 'center' });
  const r = b.pathObject.svgPath.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
}, [i, VIEW, pred]);
// where a connection of a block is on screen
const connAt = (i, pred, input) => page.evaluate(async ([i, VIEW, pred, input]) => {
  const { Blockly } = await import('/src/blocks/blockly.js');
  const v = eval(VIEW)(i);
  const b = v.ws.getAllBlocks(true).find(new Function('b', `return ${pred}`));
  const c = input === 'NEXT' ? b.nextConnection : b.getInput(input).connection;
  b.getSvgRoot().scrollIntoView?.({ block: 'center' });
  v.ws.updateScreenCalculations(); // the card moved
  const p = Blockly.utils.svgMath.wsToScreenCoordinates(v.ws, new Blockly.utils.Coordinate(c.x, c.y));
  return { x: p.x, y: p.y };
}, [i, VIEW, pred, input]);
const waitCode = (i, test, ms = 6000) => page.waitForFunction(([i, test]) => new Function('c', `return ${test}`)(window.__bb.session.behaviorsOf(window.__bb.app.selected.key)[i].code), [i, test], { timeout: ms }).catch(() => {});
const settle = () => page.waitForFunction(() => !document.body.classList.contains('bb-dragging'), null, { timeout: 5000 }).then(() => page.waitForTimeout(700));
async function drag(from, to, steps = 10) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let k = 1; k <= steps; k++) await page.mouse.move(from.x + (to.x - from.x) * k / steps, from.y + (to.y - from.y) * k / steps);
  await page.mouse.up();
}

await page.goto(url);
await page.waitForFunction(() => window.__bb?.stage?.worldId, null, { timeout: 30000 });
await waitRunning();

// ---- 1. every behavior draws as blocks ---------------------------------------------------
const typesSeen = new Set();
let cards = 0;
for (const w of process.env.QUICK ? [] : WORLDS) { // QUICK=1 skips this part
  await page.selectOption('#world-select', w.id);
  await page.waitForTimeout(400);
  await waitRunning();
  const keys = await page.evaluate(() => [...window.__bb.session.behaviorMap().entries()].filter(([, l]) => l.length).map(([k]) => k).filter((k) => window.__bb.world.actor(k).alive));
  let worldOk = true;
  for (const key of keys) {
    await select(key);
    const got = await page.evaluate(() => {
      const a = window.__bb.app.selected;
      return window.__bb.session.behaviorsOf(a.key).map((b) => {
        const v = window.__bb.app.blockViews.get(`${a.key}:${b.id}`);
        const card = document.querySelector(`.behavior[data-bid="${b.id}"]`);
        return {
          code: b.code, collapsed: !!b.collapsed, n: v?.ws?.getAllBlocks(false).length ?? -1, types: v?.ws?.getAllBlocks(false).map((x) => x.type) ?? [],
          svg: !!card?.querySelector('.bk-view svg.blocklySvg'), error: !!card?.querySelector('.bk-error'), h: card?.querySelector('.bk-host')?.clientHeight ?? 0,
        };
      });
    });
    for (const g of got) {
      if (g.collapsed) continue;
      cards++;
      g.types.forEach((t) => typesSeen.add(t));
      const want = countBlocks(codeToBlocks(g.code).json);
      if (!(g.svg && !g.error && g.n === want && g.h > 20)) { worldOk = false; check(false, `${w.id}/${key}: drew ${g.n} of ${want} blocks (svg ${g.svg}, error ${g.error}, height ${g.h})`); }
    }
  }
  check(worldOk, `${w.id}: every behavior of ${keys.length} things draws as blocks`);
  if (keys.length) { await select(keys[0]); await page.screenshot({ path: `${out}/blocks-${w.id}.png` }); }
}
if (!process.env.QUICK) check(cards > 50, `${cards} behavior cards drawn, using ${typesSeen.size} kinds of block`);

// ---- 2. clicking a script runs it, and its blocks glow -----------------------------------
await page.selectOption('#world-select', 'space');
await page.waitForTimeout(400);
await waitRunning();
await select('rocket');
let r = await rectOf(0, "b.type === 'bb_onKey'");
await page.mouse.click(r.x + 12, r.bottom - 10);
await page.waitForFunction(() => document.querySelectorAll('.bb-lit').length > 0, null, { timeout: 5000 }).catch(() => {});
check(await page.evaluate(() => document.querySelectorAll('.bb-lit').length) >= 2, 'clicking the rocket’s script lights up its hat and the block running');
check((await page.evaluate(() => document.getElementById('bubbles').innerText)).includes('blast off'), 'and runs it: the rocket says "3, 2, 1, blast off!"');
await page.screenshot({ path: `${out}/blocks-running.png` });
await page.waitForFunction(() => document.querySelectorAll('.bb-lit').length === 0, null, { timeout: 15000 }).catch(() => {});
check(await page.evaluate(() => document.querySelectorAll('.bb-lit').length) === 0, 'the glow goes when the script ends');

// ---- 3. changing a number, a menu and a key ---------------------------------------------
await page.selectOption('#world-select', 'playground');
await page.waitForTimeout(400);
await waitRunning();
await select('racecar');
r = await rectOf(0, "b.type === 'bb_num' && b.getFieldValue('NUM') == 150");
await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
await page.waitForFunction(() => document.activeElement?.classList.contains('blocklyHtmlInput'), null, { timeout: 5000 });
await page.keyboard.press('Control+A');
await page.keyboard.type('90');
await page.keyboard.press('Enter');
await waitCode(0, "c.includes('steer(90)')");
check((await codeOf(0)).includes('steer(90)') && !(await codeOf(0)).includes('steer(150)'), 'typing 90 into a number changes the code: steer(90)');
await waitRunning();
check((await running()).every((p) => p.endsWith(':ok')), 'and the program restarts and runs');
// a key menu
r = await rectOf(0, "b.type === 'bb_onKey'");
const keyField = await page.evaluate(([VIEW]) => {
  const v = eval(VIEW)(0);
  const hat = v.ws.getTopBlocks(true).find((b) => b.type === 'bb_onKey');
  const r = hat.getField('KEY').getSvgRoot().getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, [VIEW]);
await page.mouse.click(keyField.x, keyField.y);
await page.waitForSelector('.blocklyDropDownDiv .blocklyMenuItem', { timeout: 3000 });
check((await page.locator('.blocklyDropDownDiv .blocklyMenuItem').count()) > 30, 'the key menu lists the keys');
await page.locator('.blocklyDropDownDiv .blocklyMenuItem', { hasText: /^a$/ }).first().click();
await waitCode(0, `c.startsWith('onKey("a"')`);
check((await codeOf(0)).startsWith('onKey("a"'), 'picking "a" from the key menu changes the code: onKey("a", ...)');
// a menu slot: the conveyor in the machine shop has parts
await page.keyboard.press('Control+z').catch(() => {});

// ---- 4. the palette -----------------------------------------------------------------------
check(await page.isHidden('#palette'), 'the palette starts closed');
await page.click('#btn-blocks');
await page.waitForTimeout(800);
check(await page.isVisible('#palette'), 'the Blocks button opens the palette');
await page.waitForFunction(() => !document.getElementById('palette').getAnimations().length, null, { timeout: 5000 });
const pbox = await page.locator('#palette').boundingBox();
const ibox = await page.locator('#inspector').boundingBox();
check(pbox.x + pbox.width <= ibox.x + 1, 'it opens to the left of the inspector');
const cats = await page.$$eval('.pal-cats button', (b) => b.map((x) => x.dataset.cat));
check(cats.length === 14, `it has ${cats.length} categories: ${cats.join(', ')}`);
let catsOk = true;
for (const c of cats) {
  await page.click(`.pal-cats button[data-cat="${c}"]`);
  await page.waitForTimeout(150);
  const at = await page.evaluate((c) => {
    const el = document.querySelector(`.pal-label-${c}`);
    const host = document.querySelector('.pal-flyout').getBoundingClientRect();
    const r = el?.getBoundingClientRect();
    return r ? r.top - host.top : null;
  }, c);
  if (at == null || at < -4 || at > 60) { catsOk = false; check(false, `clicking ${c} shows its blocks (label at ${at})`); }
}
check(catsOk, 'clicking each category scrolls to its blocks');
const palette = await page.evaluate(() => {
  const seen = {};
  return window.__bb.app.palette.flyout.getWorkspace().getTopBlocks(true).map((b) => ({
    nth: (seen[b.type] = (seen[b.type] ?? -1) + 1), type: b.type, out: !!b.outputConnection, bool: b.outputConnection?.getCheck()?.includes('Boolean') ?? false, hat: !b.outputConnection && !b.previousConnection,
  }));
});
check(palette.length > 100, `the palette holds ${palette.length} blocks`);
await page.screenshot({ path: `${out}/blocks-palette.png` });

// screen point to grab a palette block by (scrolled into view)
const grabPoint = (pb) => page.evaluate(([type, nth]) => {
  const p = window.__bb.app.palette;
  const fws = p.flyout.getWorkspace();
  const b = fws.getTopBlocks(true).filter((x) => x.type === type)[nth];
  const xy = b.getRelativeToSurfaceXY();
  fws.scrollbar.setY(Math.max(0, xy.y * fws.scale - 120));
  const r = b.pathObject.svgPath.getBoundingClientRect();
  const field = b.inputList.flatMap((i) => i.fieldRow).find((f) => f.getText?.() && !f.isClickable?.());
  return { x: r.left + 5, y: r.top + Math.min(r.height / 2, 14), w: r.width, h: r.height, field: !!field };
}, [pb.type, pb.nth]);

// ---- 5. a new behavior from blocks ------------------------------------------------------
const before = (await page.evaluate(() => window.__bb.session.behaviorsOf('racecar').length));
await page.locator('.bk-new').scrollIntoViewIfNeeded();
const onKey = palette.find((b) => b.type === 'bb_onKey');
let from = await grabPoint(onKey);
let zone = await page.locator('.bk-new').boundingBox();
await drag(from, { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 });
await settle();
const n = await page.evaluate(() => window.__bb.session.behaviorsOf('racecar').length);
check(n === before + 1, 'dropping "when key pressed" on "new behavior" makes a new behavior');
const T = n - 1; // the test behavior
check((await codeOf(T)).startsWith('onKey(" ", async () => {'), `its code: ${(await codeOf(T)).split('\n')[0]}`);
// its key: x, a key nothing presses
let kf = await page.evaluate(([VIEW, T]) => {
  const v = eval(VIEW)(T);
  const f = v.ws.getTopBlocks(true)[0].getField('KEY').getSvgRoot();
  f.scrollIntoView({ block: 'center' });
  const r = f.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, [VIEW, T]);
await page.mouse.click(kf.x, kf.y);
await page.waitForSelector('.blocklyDropDownDiv .blocklyMenuItem');
await page.locator('.blocklyDropDownDiv .blocklyMenuItem', { hasText: /^x$/ }).first().click();
await waitCode(T, `c.startsWith('onKey("x"')`);
check((await codeOf(T)).startsWith('onKey("x"'), 'its key changed to x');
// scaffold: say [Hello!] for 2 seconds, then if <> then
const dropUnder = async (type, pred, input) => {
  const f = await grabPoint(palette.find((p) => p.type === type));
  const c = await connAt(T, pred, input);
  await drag(f, { x: c.x + 6, y: c.y + 6 });
  await settle();
};
await dropUnder('bb_say', "b.type === 'bb_onKey'", 'NEXT');
await dropUnder('bb_if', "b.type === 'bb_say'", 'NEXT');
const scaffold = await codeOf(T);
check(scaffold === 'onKey("x", async () => {\n  say("Hello!", 2);\n  if (false) {\n  }\n});\n', `the blocks snap together under the hat:\n${scaffold}`);
await page.screenshot({ path: `${out}/blocks-scaffold.png` });

// ---- 6. every block in the palette, dragged into the behavior ---------------------------
const undoTo = async (code) => {
  for (let k = 0; k < 4 && (await codeOf(T)) !== code; k++) {
    const before = await codeOf(T);
    await page.evaluate(([VIEW, T]) => eval(VIEW)(T).ws.undo(false), [VIEW, T]);
    await page.waitForFunction(([T, before]) => window.__bb.session.behaviorsOf(window.__bb.app.selected.key)[T].code !== before, [T, before], { timeout: 4000 }).catch(() => {});
  }
  return (await codeOf(T)) === code;
};
const results = [];
for (const b of palette) {
  if (b.type === 'bb_onKey' && results.some((x) => x.type === 'bb_onKey')) continue;
  const errs0 = (await errorLines()).length;
  const before = await page.evaluate(([VIEW, T, type]) => eval(VIEW)(T).ws.getAllBlocks(false).filter((x) => x.type === type && !x.isShadow()).length, [VIEW, T, b.type]);
  let target, where;
  if (b.hat) {
    const host = await page.evaluate(([VIEW, T]) => { const v = eval(VIEW)(T); const r = v.el.getBoundingClientRect(); return { x: r.left + 60, y: r.bottom - 14 }; }, [VIEW, T]);
    target = host; where = 'loose';
  } else if (b.out) {
    target = await connAt(T, b.bool ? "b.type === 'bb_if'" : "b.type === 'bb_say'", b.bool ? 'C' : 'T');
    target = { x: target.x + 4, y: target.y + 2 }; where = b.bool ? 'if' : 'say';
  } else {
    target = await connAt(T, "b.type === 'bb_if'", 'DO');
    target = { x: target.x + 6, y: target.y + 6 }; where = 'if';
  }
  const f = await grabPoint(b);
  await drag(f, target);
  await settle();
  await page.waitForFunction(([T, code]) => window.__bb.session.behaviorsOf(window.__bb.app.selected.key)[T].code !== code, [T, scaffold], { timeout: 4000 }).catch(() => {});
  const res = await page.evaluate(([VIEW, T, type, where, before]) => {
    const v = eval(VIEW)(T);
    const all = v.ws.getAllBlocks(false);
    const added = all.filter((x) => x.type === type && !x.isShadow());
    const parentOk = added.some((x) => {
      const p = x.getParent();
      if (where === 'loose') return !p;
      return p && p.type === (where === 'if' ? 'bb_if' : 'bb_say');
    });
    return { grew: added.length > before, parentOk };
  }, [VIEW, T, b.type, where, before]);
  const code = await codeOf(T);
  await page.waitForTimeout(300);
  const run = await running();
  const errs = (await errorLines()).slice(errs0);
  const ok = res.grew && res.parentOk && parses(code) && code !== scaffold && run.every((p) => p.endsWith(':ok')) && !errs.length;
  results.push({ type: b.type, ok });
  if (!ok) check(false, `${b.type} → ${where}: added ${res.grew}, in place ${res.parentOk}, parses ${parses(code)}, errors ${errs.join(' | ')}\n${code}`);
  const back = await undoTo(scaffold);
  if (!back) {
    check(false, `undo after ${b.type} gets back to the scaffold:\n${await codeOf(T)}`);
    break;
  }
}
check(results.length >= palette.length - 1 && results.every((x) => x.ok), `all ${results.length} palette blocks drop into place, write code that parses and runs, and undo cleanly`);

// ---- 7. editing text, deleting, moving, undoing with keys --------------------------------
r = await rectOf(T, "b.type === 'bb_text' && b.getFieldValue('TEXT') === 'Hello!'");
await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
await page.waitForFunction(() => document.activeElement?.classList.contains('blocklyHtmlInput'), null, { timeout: 5000 });
await page.keyboard.press('Control+A');
await page.keyboard.type('Vroom "fast"!');
await page.keyboard.press('Enter');
await waitCode(T, "c.includes('Vroom')");
check((await codeOf(T)).includes('say("Vroom \\"fast\\"!", 2);'), 'typing text with quotes writes a proper string');
// drag "say" (and what's under it) away from the hat: it becomes loose code that runs at the start
r = await rectOf(T, "b.type === 'bb_say'");
const sayFrom = { x: r.x + 8, y: r.y + r.h / 2 };
await drag(sayFrom, { x: sayFrom.x + 30, y: sayFrom.y + 160 });
await settle();
await waitCode(T, `c.startsWith('onKey("x", async () => {\\n});')`);
let code = await codeOf(T);
check(code.startsWith('onKey("x", async () => {\n});') && code.includes('\nsay("Vroom'), `dragging blocks off the hat leaves them loose:\n${code}`);
await page.keyboard.press('Control+z');
await waitCode(T, `c.startsWith('onKey("x", async () => {\\n  say(')`);
code = await codeOf(T);
check(code.startsWith('onKey("x", async () => {\n  say('), 'Ctrl+Z puts them back');
// select the if block and press Delete
r = await rectOf(T, "b.type === 'bb_if'");
await page.mouse.click(r.x + 8, r.y + 8);
await page.waitForTimeout(200);
await page.keyboard.press('Delete');
await waitCode(T, "!c.includes('if (')");
code = await codeOf(T);
check(!code.includes('if (') && code.includes('say('), 'selecting a block and pressing Delete removes it');
// a right-click menu
r = await rectOf(T, "b.type === 'bb_say'");
await page.mouse.click(r.x + 8, r.y + 8, { button: 'right' });
await page.waitForTimeout(300);
const menu = await page.$$eval('.blocklyContextMenu .blocklyMenuItem', (m) => m.map((x) => x.textContent));
check(menu.some((t) => /Duplicate/i.test(t)) && menu.some((t) => /Delete/i.test(t)) && !menu.some((t) => /Inputs|Collapse|Disable|Comment/i.test(t)), `right-clicking a block offers: ${menu.join(', ')}`);
await page.keyboard.press('Escape');
// "and keep going": a block that takes time can be set not to wait
await dropUnder('bb_wait', "b.type === 'bb_say'", 'NEXT');
r = await rectOf(T, "b.type === 'bb_wait'");
await page.mouse.click(r.x + 8, r.y + 8, { button: 'right' });
await page.waitForTimeout(300);
await page.locator('.blocklyContextMenu .blocklyMenuItem', { hasText: 'keep going' }).first().click();
await waitCode(T, "c.includes('\\n  wait(1);')");
code = await codeOf(T);
check(code.includes('\n  wait(1);') && !code.includes('await wait'), `"Don't wait for it" drops the await: ${code.split('\n')[2]}`);

// ---- 8. the code view still works, and the blocks follow typed code ----------------------
await page.evaluate((T) => document.querySelectorAll('.behavior')[T].querySelector('.code').click(), T);
await page.waitForSelector('.code-edit textarea');
await page.evaluate(() => {
  const ta = document.querySelector('.code-edit textarea');
  ta.value = 'onKey("x", async () => {\n  jump(7);\n});\n';
  ta.dispatchEvent(new Event('input'));
  ta.closest('.behavior').querySelector('.run').click();
});
await waitCode(T, "c.includes('jump(7)')");
await page.evaluate((T) => document.querySelectorAll('.behavior')[T].querySelector('.code').click(), T);
await page.waitForTimeout(500);
const types = await page.evaluate(([VIEW, T]) => eval(VIEW)(T).ws.getAllBlocks(true).map((b) => b.type).join(' '), [VIEW, T]);
check(types === 'bb_onKey bb_jump bb_num', `code typed in the code view shows as blocks: ${types}`);

// ---- 9. closing the palette; a phone ---------------------------------------------------------
await page.click('#btn-blocks');
await page.waitForTimeout(300);
check(await page.isHidden('#palette') && !(await page.$('.bk-new')), 'the Blocks button closes the palette again');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
await page.evaluate(() => window.__bb.app.sheet?.open?.('full'));
await page.waitForTimeout(400);
await page.click('#btn-blocks');
await page.waitForTimeout(600);
await page.waitForFunction(() => !document.getElementById('palette').getAnimations().length, null, { timeout: 5000 });
const pb = await page.locator('#palette').boundingBox();
const sb = await page.locator('#inspector').boundingBox();
check(pb && pb.width > 300 && pb.x >= 0 && pb.x + pb.width <= 390 && pb.y + pb.height <= sb.y + 1 && pb.height > 150, `on a phone the palette fits above the half-open sheet (${JSON.stringify(pb)})`);
await page.screenshot({ path: `${out}/blocks-phone.png` });

const bad = errors.filter((e) => !/deprecated parameters|favicon/.test(e));
check(!bad.length, `no page errors${bad.length ? `: ${bad.slice(0, 5).join(' | ')}` : ''}`);
console.log(failed ? `${failed} checks failed` : 'blocks smoke: all checks passed');
await browser.close();
