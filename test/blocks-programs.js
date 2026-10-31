// Programs written to cover every block in the lexicon and the odd shapes
// code can take (for the blocks tests, next to every premade program).
export const PROGRAMS = [
  // events, with and without arguments and parameters
  `onStart(async () => {
  say("Hi!", 3);
});
onKey("ArrowUp", () => drive(10));
onKeyUp("ArrowUp", () => drive(0));
whileKey("ArrowLeft", () => steer(90));
onTouch("red", async (what) => {
  say("I bumped " + what.name);
});
onTouch(async () => { jump(); });
onMessage("go", async () => {
  broadcast("went");
});
onClone(async () => {
  color("green");
});
every(2.5, async () => {
  play("pop");
});
onKey("r", reset);
async function reset() {
  await teleport(place(0, 0));
}`,
  // motion
  `onKey(" ", async () => {
  drive(7);
  steer(-30);
  rise(-2);
  speedUp(4);
  slowDown();
  stop();
  jump(9);
  push("left", 3);
  push();
  await move(5);
  await move(-3, 12);
  move(2);
  await turn(-90);
  await goTo(thing("tower"), 13);
  await goTo("tree");
  await face(place(3, -4));
  await teleport(thing("hero"));
});`,
  // parts, looks, sound, pen, world
  `onKey("a", async () => {
  part("left arm").spin(360);
  await part("head").turnTo(-45);
  part("arms").turnTo(90);
  await part("platform").slideTo(2.5);
  await part("tail").wiggle(4);
  part("tail").color("blue");
  color("random");
  say("Hello, friend!");
  show("RED  vs  BLUE\\n0 - 0");
  explode(8);
  play("vroom");
  penDown();
  penUp();
  penColor("orange");
  penSize(6);
  clearDrawing();
  spawn();
  spawn({});
  spawn({ color: "yellow", size: "1x1", at: "top" });
  spawn({color: "red", launch: 18});
  spawn({from: "throwing arm"});
  spawn({ shape: "flower", color: "pink", at: place(random(1, 5), 3) });
  await clone(null, "front");
  await clone("tree");
  clone(thing("rock"), place(2, 2));
  const copy = await clone();
  if (copy) say("I made " + copy.name);
  remove();
  gravity(0.3);
});`,
  // control
  `let n = 0;
forever(async () => {
  await wait(1);
  n++;
  n--;
  n += 2;
  n -= 1;
  n = n + 1;
  n = n - 3;
  n = n * 2;
  if (n > 10) {
    n = 0;
  }
  if (n === 3) say("three"); else if (n === 4) say("four"); else say("more");
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < i; j++) {
      if (j === 1) continue;
      if (j > 4) break;
      log(i * j);
    }
  }
  for (let k = 0; k < n + 1; k++) jump();
  while (n < 5 && !isClone()) {
    n += 1;
  }
  for (const c of ["red", "blue"]) {
    color(c);
    await wait(0.5);
  }
  await Promise.all([part("left arm").turnTo(90), part("right arm").turnTo(90), move(3)]);
});`,
  // sensing and operators
  `onKey("s", async () => {
  const seen = await look(15);
  const near = await nearest({color: "red", kind: "brick"});
  const anything = await nearest();
  if (await touching("tree") || await touching(null)) say("touching");
  const where = await position();
  say(\`I am at \${Math.round(where.x)}, \${Math.round(where.z)}!\`, 2);
  const what = await see(["food", "a friend"]);
  if (seen && is(seen, "ball") && near.distance < 5) jump();
  const pick = random(1, 6) % 2 === 0 ? "even" : "odd";
  say(pick + " " + (anything ? anything.kind : "nothing"));
  const t = thing("tower");
  const t2 = thing(["a", "b"][random(0, 1)]);
  let x = Math.min(10, Math.max(1, -n)) / 2 - 1;
  x = (x + 1) * (x - 1) / (2 + x);
  x = Math.abs(x) + Math.sqrt(4) + Math.floor(1.5) + Math.ceil(0.2) + Math.sin(1) + Math.cos(0) + Math.random();
  const bars = "▮".repeat(3) + "▯".repeat(10 - 3);
  if (bars.includes("▮") && bars.length > 2 && !false && true) log(what, null);
  const list = [1, 2, 3];
  say(list[0] + list.length);
  if (x >= 1 || x <= -1 || x !== 0 || x != 2 || x == 3) say("x");
});
let n = 1;`,
  // variables, lists and my blocks
  `// The score.
let score = 0;
let best;
const names = ["Ann", "Bo"];
function add(points) {
  score = score + points;
  return score;
}
async function cheer(times, word) {
  for (let i = 0; i < times; i++) {
    say(word, 1);
    await wait(1);
  }
}
const double = (x) => x * 2;
const later = async () => {
  await wait(2);
  return "done";
};
onKey("p", async () => {
  add(1); // count it
  const total = add(double(2));
  best = total;
  await cheer(2, names[1]);
  cheer(1, "go");
  log(await later());
  if (best > 3) {
    return;
  }
  log("no return");
});`,
  // things blocks can't say: kept as JavaScript in gray blocks
  `let a = { x: 1 };
a.x = 2;
const { x } = a;
onKey("q", async () => {
  do {
    a.x--;
  } while (a.x > 0);
  try {
    log(undefined ?? 1);
  } catch (err) {
    log(err.message);
  }
  outer: for (let i = 0; i < 2; i++) {
    for (;;) break outer;
  }
  await Promise.all([1, 2].map((v) => wait(v)));
  label();
  return;
  log("never");
});
function label() { log(\`line one
line two\`); }`,
  // events registered inside other scripts
  `for (let i = 0; i < 3; i++) {
  const power = i + 1;
  onMessage("whack " + power, () => whack(power));
}
function whack(p) {
  push("forward", p);
}
onStart(async () => {
  forever(async () => {
    await move(1);
  });
});
onKey(" ", async () => {
  every(1, async () => {
    jump();
  });
  onTouch(thing("ball"), async (b) => {
    say(b.name);
  });
  forever(() => turn(10));
});`,
  // empty scripts, comments everywhere
  `// starts here
onStart(() => {});
onKey("x", async () => {
  // nothing yet
});
/* a block
   comment */
let ready = true; // trailing
// the end`,
];
