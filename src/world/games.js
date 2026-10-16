// Behaviors for games like Calvinball, shared by the Calvinball world and the
// library's game pieces (goals, a scoreboard, a ball, team players).
// Every rule of the game is one of these behaviors, so changing the game is
// changing a behavior. Things talk with messages: a net tells
// everyone "red scores" or "blue scores"; the scoreboard and the ball listen.
export const SCOREBOARD = {
  title: 'Keep Score',
  keys: { r: 'new game' },
  text: 'Keep the score on the screen: a point for Red when it hears "red scores", a point for Blue when it hears "blue scores". The first to 5 wins. R starts a new game.',
  summary: [
    'At the start: show the score, 0 - 0',
    'When it hears "red scores" or "blue scores": add a point, cheer, and show the new score',
    'When a team gets to 5: show who won and tell everyone "game over"',
    'When R is pressed: tell everyone "new game", and start again at 0 - 0',
  ],
  code: `// The scoreboard keeps the score. Anything can score a point by telling
// everyone "red scores" or "blue scores".
const winningScore = 5;
let red = 0;
let blue = 0;
let over = false;

function showScore() {
  show("RED  vs  BLUE\\n" + red + " - " + blue);
}

async function point(team) {
  play("yay");
  if (red >= winningScore || blue >= winningScore) {
    over = true;
    play("tada");
    show(team + " WINS!\\n" + red + " - " + blue);
    broadcast("game over");
    return;
  }
  show(team + " SCORES!\\n" + red + " - " + blue);
  await wait(2);
  if (!over) showScore();
}

onMessage("red scores", () => {
  if (over) return;
  red = red + 1;
  point("RED");
});
onMessage("blue scores", () => {
  if (over) return;
  blue = blue + 1;
  point("BLUE");
});

onMessage("new game", () => {
  red = 0;
  blue = 0;
  over = false;
  play("referee");
  showScore();
});
onKey("r", () => broadcast("new game"));

onStart(showScore);`,
};

// The ball. home: the spot it goes back to for a kickoff, as code (the middle
// of the world unless given); "start" means wherever it was when it started.
const HOME = `let home = null;
onStart(async () => {
  const p = await position();
  home = place(p.x, p.z);
});
`;
export function ballBehavior({ home = 'place(0, 0)' } = {}) {
  const start = home === 'start';
  const spot = start ? 'home' : home;
  return {
    title: 'Kick and Kickoff',
    keys: { r: 'back to the middle' },
    text: `When it hears "kick", fly away from whoever is closest. After a goal, wait 2 seconds and go back to ${start ? 'where it started' : 'the middle'}. R puts it back.`,
    summary: [
      'When it hears "kick": fly away from the closest player or car',
      `When it hears "red scores" or "blue scores": wait 2 seconds, then back to ${start ? 'where it started' : 'the middle'}`,
      `When it hears "new game", or R is pressed: back to ${start ? 'where it started' : 'the middle'}`,
    ],
    code: `// The ball. A kick sends it flying away from the kicker; after a goal it
// goes back to ${start ? 'where it started' : 'the middle'} for the kickoff.
const kickPower = 8;
${start ? HOME : ''}
onMessage("kick", async () => {
  const kicker = await nearest("model");
  if (!kicker || kicker.distance > 6) return;
  play("hit");
  // away from the kicker: split it into a forward/back push and a left/right push
  const away = (kicker.direction + 180) / 57.3; // 57.3 turns degrees into the angle units sin and cos use
  shove(Math.cos(away) * kickPower, "forward", "backward");
  shove(Math.sin(away) * kickPower, "left", "right");
  push("up", 2);
});
function shove(amount, plus, minus) {
  if (Math.abs(amount) >= 0.5) push(amount > 0 ? plus : minus, Math.abs(amount));
}

async function kickoff() {
  await wait(2);
  await teleport(${spot});
}
onMessage("red scores", kickoff);
onMessage("blue scores", kickoff);
onMessage("new game", () => teleport(${spot}));
onKey("r", () => teleport(${spot}));`,
  };
}

// Space kicks: if a ball is close, tell it "kick" (it works out which way to fly).
// ball: which ball, as code (a thing reference, or "ball" for any ball).
export function kick(ball = 'thing("ball")') {
  return {
    title: 'Kick',
    keys: { ' ': 'kick' },
    text: 'When I press space, swing the right arm, and if the ball is close, tell everyone "kick".',
    summary: ['When space is pressed: swing the right arm, and if the ball is close, tell everyone "kick"'],
    code: `onKey(" ", async () => {
  const ball = await nearest(${ball});
  if (ball && ball.distance < 5) broadcast("kick");
  await part("right arm").turnTo(100);
  await part("right arm").turnTo(0);
});`,
  };
}
export const KICK = kick();

// Running with the arrow keys, for a player.
export const RUN = { title: 'Run with Arrows', text: 'When I press the up arrow, drive forward fast. When I press the down arrow, drive backward fast. While I hold left, turn left very fast. While I hold right, turn right very fast.' };

// A goal's net: when the ball rolls in, the other team scores.
export const goalFor = (team, net, ball = 'thing("ball")') => ({
  title: `Goal for ${team === 'red' ? 'Red' : 'Blue'}`,
  text: `When the ball rolls into the ${net} net, tell everyone "${team} scores".`,
  summary: [`When the Ball rolls in: tell everyone "${team} scores" (once, then wait 3 seconds)`],
  code: `// The ball is in ${net === 'red' ? "Red's" : "Blue's"} goal, so ${team === 'red' ? 'Red' : 'Blue'} gets a point.
let ready = true;
onTouch(${ball}, async () => {
  if (!ready) return;
  ready = false;
  play("referee");
  broadcast("${team} scores");
  await wait(3);
  ready = true;
});`,
});

