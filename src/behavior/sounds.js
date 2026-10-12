// The sounds play() knows. Most are recordings from the Scratch sound library,
// fetched into public/sounds/<id>.mp3 by tools/sounds/fetch.mjs; the rest
// (no `from`) are synthesized in src/audio.js, where the library had nothing
// that fit (ding, crash) or its clip was too short to hear (pop, laser). Ids are one lowercase word so a
// kid can type them ("play vroom") and the offline compiler can match them.
//
//   from:  the sound's name in the Scratch library
//   rate:  playback rate baked into the file (0.7 = lower and slower)
//   max:   seconds to keep (long sounds are cut with a fade)
//   about: what it sounds like, for Claude
//   fits:  words for things it suits; a thing whose name or blurb has one of
//          these gets the sound suggested to Claude

export const SOUND_GROUPS = [
  ['Animals', [
    { id: 'moo', from: 'Moo', about: 'a cow mooing', fits: ['cow', 'bull', 'farm'] },
    { id: 'baa', from: 'Baa', about: 'a sheep', fits: ['sheep', 'lamb', 'goat'] },
    { id: 'meow', from: 'Meow', about: 'a cat', fits: ['cat', 'kitten'] },
    { id: 'woof', from: 'Dog1', about: 'a dog barking', fits: ['dog', 'puppy'] },
    { id: 'growl', from: 'Growl', about: 'an angry growl', fits: ['dog', 'wolf', 'bear', 'monster', 'dinosaur', 'dino'] },
    { id: 'roar', from: 'Growl', rate: 0.6, about: 'a big, deep roar', fits: ['dragon', 'dinosaur', 'dino', 'lion', 'monster', 'rex'] },
    { id: 'neigh', from: 'Whinny', about: 'a horse whinnying', fits: ['horse', 'pony', 'unicorn', 'knight'] },
    { id: 'gallop', from: 'Gallop', about: 'hooves galloping', fits: ['horse', 'pony', 'unicorn', 'knight'] },
    { id: 'snort', from: 'Snort', about: 'a snort', fits: ['horse', 'pig', 'bull'] },
    { id: 'chirp', from: 'Chirp', about: 'a little bird', fits: ['bird', 'chick'] },
    { id: 'squawk', from: 'Squawk', about: 'a loud bird squawk', fits: ['parrot', 'bird', 'chicken', 'hen'] },
    { id: 'quack', from: 'Duck', about: 'a duck', fits: ['duck'] },
    { id: 'rooster', from: 'Rooster', about: 'a rooster crowing', fits: ['rooster', 'chicken', 'hen', 'farm', 'farmer'] },
    { id: 'owl', from: 'Owl', about: 'an owl hooting', fits: ['owl'] },
    { id: 'croak', from: 'Croak', about: 'a frog', fits: ['frog', 'toad'] },
    { id: 'monkey', from: 'Chee Chee', about: 'a chattering monkey', fits: ['monkey', 'ape'] },
    { id: 'howl', from: 'Wolf Howl', max: 3, about: 'a wolf howling', fits: ['wolf', 'ghost'] },
    { id: 'squeak', from: 'Squeaks', max: 1.5, about: 'small squeaks', fits: ['mouse', 'hamster', 'rat'] },
    { id: 'cricket', from: 'Cricket', about: 'one cricket chirp', fits: ['bug', 'insect', 'cricket'] },
    { id: 'seagull', from: 'Seagulls', max: 2.5, about: 'seagulls', fits: ['seagull', 'beach', 'boat', 'ship'] },
  ]],
  ['Vehicles', [
    { id: 'honk', from: 'Car Horn', max: 1.2, about: 'a car horn', fits: ['car', 'truck', 'bus', 'taxi', 'van', 'tractor'] },
    { id: 'vroom', from: 'Car Vroom', about: 'an engine revving and speeding off', fits: ['car', 'race', 'racecar', 'kart', 'motorcycle', 'truck'] },
    { id: 'skid', from: 'Skid', about: 'tires skidding', fits: ['car', 'race', 'racecar', 'kart', 'truck'] },
    { id: 'whistle', from: 'Train Whistle', about: 'a steam train whistle', fits: ['train', 'locomotive', 'steam'] },
    { id: 'siren', from: 'Police Siren', about: 'a short police siren', fits: ['police', 'fire', 'ambulance'] },
    { id: 'bell', from: 'Ship Bell', max: 2, about: "a ship's bell", fits: ['ship', 'boat', 'pirate'] },
    { id: 'flyby', from: 'Space Flyby', about: 'something zooming past overhead', fits: ['spaceship', 'rocket', 'jet', 'plane', 'ufo', 'ship'] },
  ]],
  ['Games', [
    { id: 'coin', from: 'Coin', about: 'collecting a coin', fits: ['coin', 'hero'] },
    { id: 'collect', from: 'Collect', about: 'picking up a power-up', fits: ['hero', 'gem', 'star'] },
    { id: 'jump', from: 'Jump', about: 'a video-game jump', fits: ['hero', 'slime', 'ball'] },
    { id: 'pew', from: 'Pew', about: 'a blaster shot', fits: ['spaceship', 'robot', 'ufo', 'alien', 'blaster'] },
    { id: 'laser', about: 'a laser zap', fits: ['spaceship', 'robot', 'ufo', 'alien'] },
    { id: 'win', from: 'Win', about: 'a happy you-win jingle', fits: ['flag', 'goal'] },
    { id: 'lose', from: 'Lose', about: 'a sad game-over jingle', fits: [] },
    { id: 'oops', from: 'Oops', about: 'a goofy mistake sound', fits: [] },
    { id: 'alert', from: 'Alert', about: 'an alarm', fits: ['robot', 'alarm'] },
    { id: 'teleport', from: 'Teleport2', about: 'teleporting in or out', fits: ['alien', 'ufo', 'wizard', 'robot', 'astronaut'] },
    { id: 'beep', from: 'Computer Beep', about: 'a computer beep', fits: ['robot', 'computer', 'ufo'] },
    { id: 'boom', from: 'Boom Cloud', max: 2.5, about: 'a big explosion', fits: ['rocket', 'cannon', 'catapult', 'castle'] },
  ]],
  ['Cartoon', [
    { id: 'boing', from: 'Boing', about: 'a springy boing', fits: ['ball', 'slime', 'spring', 'trampoline'] },
    { id: 'bonk', from: 'Bonk', about: 'bumping your head', fits: [] },
    { id: 'whiz', from: 'Whiz', about: 'whizzing past fast', fits: [] },
    { id: 'slide', from: 'Slide Whistle', about: 'a slide whistle going up', fits: [] },
    { id: 'wobble', from: 'Wobble', about: 'a wobbly, dizzy sound', fits: ['slime', 'jelly'] },
    { id: 'squish', from: 'Squish Pop', about: 'a squishy pop', fits: ['slime', 'jelly'] },
    { id: 'squeaky', from: 'Squeaky Toy', about: 'a squeaky toy', fits: ['toy', 'duck'] },
    { id: 'scramble', from: 'Scrambling Feet', about: 'cartoon feet running away', fits: [] },
    { id: 'zoop', from: 'Zoop', about: 'a quick zoop', fits: ['alien', 'ufo'] },
    { id: 'drumroll', from: 'Drum Roll', about: 'a drum roll before something big', fits: [] },
    { id: 'tada', from: 'Tada', about: 'ta-da!', fits: ['wizard', 'magic'] },
    { id: 'dundun', from: 'Dun Dun Dunnn', about: 'dramatic dun dun dunnn', fits: ['monster', 'ghost', 'dragon'] },
  ]],
  ['Magic', [
    { id: 'magic', from: 'Magic Spell', about: 'casting a spell', fits: ['wizard', 'witch', 'magic', 'unicorn'] },
    { id: 'wand', from: 'Wand', about: 'a sparkly wand swish', fits: ['wizard', 'witch', 'fairy'] },
    { id: 'sparkle', from: 'Fairydust', about: 'twinkly fairy dust', fits: ['fairy', 'star', 'gem', 'unicorn'] },
  ]],
  ['People', [
    { id: 'yay', from: 'Goal Cheer', max: 2.5, about: 'a crowd cheering', fits: ['flag', 'goal', 'golf', 'golfer'] },
    { id: 'clap', from: 'Clapping', max: 2.5, about: 'clapping', fits: [] },
    { id: 'laugh', from: 'Laugh1', about: 'someone laughing', fits: ['clown', 'villager', 'farmer'] },
    { id: 'hey', from: 'Hey', about: 'someone shouting "hey!"', fits: ['knight', 'villager', 'farmer', 'astronaut', 'golfer'] },
    { id: 'scream', from: 'Scream1', about: 'a scream', fits: [] },
    { id: 'sneeze', from: 'Sneeze1', about: 'a sneeze', fits: [] },
    { id: 'chomp', from: 'Chomp', about: 'a big bite', fits: ['dinosaur', 'dino', 'monster', 'shark'] },
    { id: 'gasp', from: 'Crowd Gasp', about: 'a crowd gasping', fits: [] },
    { id: 'snore', from: 'Snoring', max: 2.5, about: 'snoring', fits: [] },
  ]],
  ['Things', [
    { id: 'pop', about: 'a small pop', fits: ['ball', 'bubble', 'balloon'] },
    { id: 'drum', from: 'Low Tom', about: 'a drum hit', fits: ['drum'] },
    { id: 'clang', from: 'Clang', about: 'metal clanging', fits: ['knight', 'sword', 'robot', 'castle', 'armor'] },
    { id: 'smash', from: 'Glass Breaking', max: 1.5, about: 'glass breaking', fits: ['window', 'house'] },
    { id: 'strike', from: 'Bowling Strike', about: 'bowling pins crashing down', fits: ['tower', 'ball', 'pins'] },
    { id: 'bounce', from: 'Basketball Bounce', about: 'a ball bouncing', fits: ['ball', 'basketball'] },
    { id: 'hit', from: 'Tennis Hit', about: 'whacking a ball', fits: ['ball', 'golf', 'golfer', 'bat'] },
    { id: 'referee', from: 'Referee Whistle', about: "a referee's whistle", fits: ['ball', 'goal', 'golf'] },
    { id: 'splash', from: 'Splash', about: 'a splash into water', fits: ['water', 'pool', 'boat', 'duck', 'fish'] },
    { id: 'drip', from: 'Water Drop 1', about: 'a water drop', fits: ['water'] },
    { id: 'whoosh', from: 'High Whoosh', about: 'a fast swoosh', fits: ['sword', 'arm', 'catapult', 'plane', 'jet'] },
    { id: 'doorbell', from: 'Doorbell', max: 2, about: 'a doorbell', fits: ['house', 'door'] },
    { id: 'creak', from: 'Door Creak', max: 2, about: 'a spooky creaking door', fits: ['house', 'door', 'castle', 'ghost'] },
    { id: 'gong', from: 'Bell Toll', max: 3, about: 'a big bell tolling', fits: ['castle', 'tower', 'clock', 'church'] },
    { id: 'ding', about: 'a bright ding', fits: [] },
    { id: 'crash', about: 'a noisy crash', fits: ['car', 'truck'] },
  ]],
];

export const SOUND_LIST = SOUND_GROUPS.flatMap(([, list]) => list);
export const SOUND_BY_ID = Object.fromEntries(SOUND_LIST.map((s) => [s.id, s]));
export const SOUNDS = SOUND_LIST.map((s) => s.id);

// Sounds that suit a thing, from words in its name, kind and blurb.
export function soundsFor(desc, limit = 6) {
  const words = new Set(`${desc.name ?? ''} ${desc.id ?? ''} ${desc.type ?? ''} ${desc.blurb ?? ''}`.toLowerCase().match(/[a-z]+/g) ?? []);
  const has = (w) => words.has(w) || words.has(`${w}s`) || words.has(`${w}es`);
  return SOUND_LIST.filter((s) => s.fits.some(has)).slice(0, limit).map((s) => s.id);
}
