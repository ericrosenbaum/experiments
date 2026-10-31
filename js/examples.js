// Two slice-of-life worlds: short scenes, lots of things to try, nothing to
// win or lose. Items and switches open up extra moments rather than gates, and
// any "needs" has an else that points somewhere to look.
//
// Options that share a phrase are variants: the first one whose needs are met
// plays (used here for "first time" vs. "again").

const o = (id, phrase, also, result, rules = '') => ({ id, phrase: { text: phrase }, also, result: { text: result }, rules });
const S = (name, music, description, options) => ({ name, music, description: { text: description }, options });

export const RAINY_SATURDAY = {
  id: 'example-rainy-saturday',
  version: 2,
  title: 'Rainy Saturday',
  start: 'kitchen',
  items: {
    pancake: { text: 'a pancake' },
    flashlight: { text: 'a flashlight' },
    'pirate-hat': { text: 'a pirate hat' },
    'sparkly-rock': { text: 'a sparkly rock' },
    'comic-book': { text: 'a comic book' },
  },
  scenes: {
    kitchen: S('the kitchen', 'cozy', 'Saturday morning. Rain on the window. The kitchen smells like toast. Biscuit the cat is watching you.', [
      o('pet', 'pet Biscuit', ['pet the cat', 'scratch her ears'], 'Biscuit purrs and bumps her head against your hand.', 'needs no biscuit-friend\nsets biscuit-friend\nsound meow'),
      o('pet-again', 'pet Biscuit', [], 'Biscuit flops over for belly rubs. Purr, purr, purr.', 'needs biscuit-friend'),
      o('pancakes', 'make pancakes', ['cook breakfast', 'flip a pancake'], 'You mix, pour, and flip. One lands on the ceiling. Most land in the pan.', 'gives pancake\nsound whoosh'),
      o('toast', 'eat the toast', ['have some toast'], 'Crunch. Perfectly buttery.', 'sound chomp'),
      o('window', 'look out the window', ['look outside', 'watch the rain'], 'Rain, rain, rain. A frog is sitting on the back step, looking right at you.', 'sound croak'),
      o('fridge', 'open the fridge', ['look in the fridge'], "Milk, jam, and a note from Mom: the flashlight is in the junk drawer, if you want to explore the attic."),
      o('drawer', 'open the junk drawer', ['look in the drawer'], 'Rubber bands, a birthday candle, and a flashlight. You take the flashlight.', 'needs no flashlight\ngives flashlight'),
      o('drawer-again', 'open the junk drawer', [], 'Just rubber bands and a birthday candle now.', 'needs flashlight'),
      o('radio', 'turn on the radio', ['listen to the radio', 'play some music'], 'The weather man says: rain, then more rain. Then a song comes on and you dance a little.'),
      o('living', 'go to the living room', ['go in the living room'], 'You pad down the hall in your socks.', 'go living-room'),
      o('yard', 'go outside', ['go to the backyard', 'go see the frog'], 'You pull on your boots and open the back door.', 'go backyard'),
    ]),
    'living-room': S('the living room', 'cozy', 'The living room. A piano, a blanket fort, and a ladder up to the attic.', [
      o('piano', 'play the piano', ['play a song'], "Plink, plonk. You play the only song you know. Biscuit's ears twitch."),
      o('fort', 'crawl into the blanket fort', ['go in the fort'], 'Dim and cozy. Someone left a comic book in here about a dog who goes to space.', 'gives comic-book'),
      o('read', 'read the comic', ['read the comic book'], 'The space dog lands on a planet made of cheese. You read it twice.', "needs comic-book\nelse You don't have anything to read. The blanket fort looks like a good reading spot."),
      o('nap', 'take a nap', ['lie on the couch', 'go to sleep'], 'You doze off for a minute and dream about a frog in a tiny raincoat.', 'sound snore'),
      o('photos', 'look at the photos', ['look at the pictures on the wall'], 'Grandpa as a kid, holding a giant fish. Mom with a very funny haircut.'),
      o('attic', 'climb up to the attic', ['go up the ladder', 'go to the attic'], 'The ladder creaks with every step.', "needs flashlight\nelse It's pitch dark up there. A flashlight would help. Maybe there's one in the kitchen.\nsound creak\ngo attic"),
      o('porch', 'go to the front porch', ['go out the front door'], 'You open the front door.', 'go porch'),
      o('kitchen', 'go to the kitchen', ['go back to the kitchen'], 'Back to the toasty kitchen.', 'go kitchen'),
    ]),
    attic: S('the attic', 'search', 'The attic. Dusty and quiet. Your flashlight finds boxes, an old trunk, and a round window.', [
      o('trunk', 'open the trunk', ['look in the trunk'], 'Old costumes! You put on a pirate hat. It fits perfectly.', 'gives pirate-hat\nsound creak'),
      o('boxes', 'look in the boxes', ['open a box'], "Holiday lights, and a box labeled Mom's rocks. One of them sparkles. You keep it.", 'gives sparkly-rock\nsound sparkle'),
      o('window', 'look out the round window', ['look out the window'], 'You can see the whole street from up here. The rain is getting lighter.'),
      o('listen', 'listen', ['be quiet', 'listen carefully'], 'Drip. Drip. Something is leaking in the corner. And, a tiny squeak?', 'sound drip'),
      o('squeak', 'find the squeak', ['look for the squeak', 'look for the mouse'], 'A mouse! It looks at you, twitches its whiskers, and scurries behind a box.', 'sound squeak'),
      o('ahoy', 'shout ahoy', ['say ahoy', 'talk like a pirate'], 'Ahoy! Your voice echoes. Downstairs, Biscuit meows back.', "needs pirate-hat\nelse You feel a little silly shouting ahoy without a pirate hat. Maybe there's one in the trunk.\nsound hey"),
      o('sneeze', 'blow the dust', ['blow on a box'], 'A big cloud of dust. Ah, ah, achoo!', 'sound sneeze'),
      o('down', 'go back down', ['climb down', 'go down the ladder'], 'Carefully, carefully, down the ladder.', 'go living-room'),
    ]),
    backyard: S('the backyard', 'settling', 'The backyard. Puddles everywhere. The frog is still on the step.', [
      o('frog', 'say hi to the frog', ['talk to the frog', 'hello frog'], 'Ribbit, says the frog. That is probably hello.', 'sound croak'),
      o('puddle', 'jump in a puddle', ['splash in the puddles', 'jump in the puddle'], 'Splash! Your socks are soaked. Worth it.', 'sound splash'),
      o('garden', 'look at the garden', ['check the garden'], 'Tomatoes, and a sunflower taller than you. A snail is climbing it very, very slowly.'),
      o('feed', 'give the frog a pancake', ['feed the frog'], 'The frog sniffs it and hops away. Frogs do not like pancakes. More for you.', "needs pancake\nelse The frog looks hungry. Maybe you could make it something in the kitchen?"),
      o('grass', 'lie on the grass', ['look at the sky'], 'Cold and wet. The clouds are moving fast. One looks like a cat.'),
      o('rain', 'catch raindrops', ['stick out your tongue'], 'You catch three on your tongue. They taste like sky.', 'sound drip'),
      o('inside', 'go inside', ['go back to the kitchen'], 'You kick off your muddy boots.', 'go kitchen'),
    ]),
    porch: S('the front porch', 'wonder', 'The front porch. The rain is stopping. A rainbow is starting over the street.', [
      o('rainbow', 'look at the rainbow', ['watch the rainbow'], 'All the colors. Even purple.', 'sound sparkle'),
      o('wave', 'wave at the neighbor', ['say hi to the neighbor'], 'Mrs. Patel waves back with her watering can. Who waters plants in the rain?', 'sound hey'),
      o('bell', 'ring the doorbell', ['press the doorbell'], 'Ding dong. Biscuit runs to the door to see who it is. It is you.', 'sound doorbell'),
      o('steps', 'sit on the steps', ['sit down'], 'You sit and listen. The birds are coming back out.', 'sound chirp'),
      o('hat', 'show off the pirate hat', ['show the neighbor my hat'], 'Mrs. Patel salutes. Aye aye, captain!', "needs pirate-hat\nelse You don't have anything to show off yet. What's up in the attic?\nsound laugh"),
      o('rock', 'show the sparkly rock', ['hold up the rock'], 'It catches the sun and throws a tiny rainbow of its own.', "needs sparkly-rock\nelse You don't have a rock. Mom keeps hers in the attic.\nsound sparkle"),
      o('inside', 'go inside', ['go back in'], 'Back into the house.', 'go living-room'),
    ]),
  },
};

export const HARBOR_MORNING = {
  id: 'example-harbor-morning',
  version: 2,
  title: 'Harbor Morning',
  start: 'pier',
  items: {
    bottle: { text: 'a bottle with a note in it' },
    shell: { text: 'a spiral shell' },
    'cinnamon-roll': { text: 'a cinnamon roll' },
    spyglass: { text: 'a brass spyglass' },
  },
  scenes: {
    pier: S('the pier', 'journey', 'A wooden pier at sunrise. Seagulls. Fishing boats bumping together. Somewhere, someone is baking bread.', [
      o('gulls', 'watch the seagulls', ['look at the birds'], 'One seagull is clearly the boss. It is staring at your pocket.', 'sound seagull'),
      o('bell', "ring the ship's bell", ['ring the bell'], 'Clang! A fisherman laughs and rings his bell back.', 'sound bell'),
      o('fisher', 'talk to the fisherman', ['say hi to the fisherman'], "Morning! he says. Caught nothing but an old boot and a bottle. Want the bottle? He tosses it to you.", 'needs no bottle\ngives bottle'),
      o('fisher-again', 'talk to the fisherman', [], 'He tells you the boot is now his lucky boot.', 'needs bottle'),
      o('water', 'look in the water', ['look over the edge'], 'Little silver fish dart under the pier. A crab waves a claw at you.'),
      o('bottle', 'open the bottle', ['read the note'], "There's a note inside. It says: press the star on the lighthouse door.", "needs bottle\nelse You don't have a bottle. The fisherman might.\nsets read-note\nsound collect"),
      o('bakery', 'follow the smell of bread', ['go to the bakery'], 'You follow your nose up the hill.', 'go bakery'),
      o('beach', 'walk down to the beach', ['go to the beach'], 'Down the steps, onto the sand.', 'go beach'),
      o('lighthouse', 'walk to the lighthouse', ['go to the lighthouse'], 'You walk out along the rocks.', 'go lighthouse'),
    ]),
    bakery: S('the bakery', 'cozy', 'A tiny, warm bakery. Flour everywhere. The baker hums while she works.', [
      o('buy', 'buy a cinnamon roll', ['get a cinnamon roll', 'pay with a shell'], 'She trades you a warm cinnamon roll for your shell.', "needs shell\nelse The baker smiles. Today I'm taking seashells instead of money. Try the beach!\ntakes shell\ngives cinnamon-roll\nsound coin"),
      o('smell', 'smell the bread', ['sniff the air'], 'Rye, sourdough, and something with cardamom. You could stand here all day.'),
      o('knead', 'help knead the dough', ['help the baker'], 'Squish, push, fold. The baker says you are a natural.', 'sound squish'),
      o('ask', 'ask about the lighthouse', ['ask about the lighthouse keeper'], 'Old Tomas lives up there, she says. He loves sweets. Hint, hint.'),
      o('hum', 'listen to her humming', ['ask what song that is'], 'It is an old sea song about a whale who wanted to fly.'),
      o('eat', 'eat the cinnamon roll', ['take a bite'], 'You take one tiny bite. Hmm. Maybe save the rest for someone.', "needs cinnamon-roll\nelse You don't have one. Yet.\nsound chomp"),
      o('pier', 'go back to the pier', ['go back'], 'Back down the hill.', 'go pier'),
    ]),
    beach: S('the beach', 'deep', 'The beach. Cold sand. Waves coming in and going out.', [
      o('shells', 'look for shells', ['find a shell', 'collect shells'], 'You find a perfect spiral shell.', 'gives shell\nsound sparkle'),
      o('toes', 'dip your toes in', ['go in the water', 'touch the water'], 'Freezing! You yelp. A seagull laughs at you.', 'sound splash'),
      o('castle', 'build a sandcastle', ['make a sandcastle'], 'Towers, a moat, and a flag made of seaweed. A wave takes one tower. You build it back.'),
      o('listen', 'listen to the waves', ['close your eyes'], 'Shhh. Shhh. The ocean is telling everyone to be quiet.'),
      o('skip', 'skip a stone', ['throw a rock'], 'One, two, three, four skips!', 'sound whoosh'),
      o('chase', 'chase the seagull', ['chase the birds'], 'It flaps off, very offended.', 'sound squawk'),
      o('pier', 'go back to the pier', ['go up the steps'], 'You shake the sand out of your shoes.', 'go pier'),
      o('lighthouse', 'walk to the lighthouse', ['go to the lighthouse'], 'You hop from rock to rock.', 'go lighthouse'),
    ]),
    lighthouse: S('the lighthouse', 'search', 'The lighthouse. Tall and white, with a red door. Someone painted a little star on it.', [
      o('knock-again', 'knock on the door', [], 'Tomas waves you in. Come up any time!', 'needs met-tomas\ngo lamp-room'),
      o('knock', 'knock on the door', ['knock', 'go inside'], 'Old Tomas opens the door, sniffs, and grins. Is that cinnamon? Come up, come up! You give him the roll and climb the stairs.', "needs cinnamon-roll\nelse Footsteps, then a voice: I only open the door for people who bring something sweet.\ntakes cinnamon-roll\nsets met-tomas\nsound doorbell\ngo lamp-room"),
      o('star', 'press the star', ['touch the star'], 'Click! A tiny drawer slides out of the door. Inside is a brass spyglass.', "needs read-note\nneeds no spyglass\nelse It's a little painted star. Pretty.\ngives spyglass\nsound magic"),
      o('around', 'walk around the lighthouse', ['look at the back'], 'On the back wall, people have carved their names. Dozens of them, some very old.'),
      o('up', 'look up', ['look at the top'], 'It is so tall your neck hurts. A seagull is sitting on the very top.', 'sound seagull'),
      o('pier', 'go back to the pier', ['go back'], 'Back along the rocks.', 'go pier'),
      o('beach', 'go to the beach', ['walk to the beach'], 'Down to the sand.', 'go beach'),
    ]),
    'lamp-room': S('the lamp room', 'wonder', 'The top of the lighthouse. A giant glass lamp. Windows all around. You can see the whole harbor.', [
      o('talk', 'talk to Tomas', ['ask Tomas a question'], 'He tells you about the big storm, when this lamp kept twelve boats safe.'),
      o('lamp', 'look at the lamp', ['touch the lamp'], 'It is like a huge glass beehive. Tomas says you can see it thirty miles away.'),
      o('spyglass', 'look through the spyglass', ['use the spyglass', 'look out to sea'], 'Far out at sea, a whale comes up for air. Then another. Tomas gasps. I have not seen them in years!', "needs spyglass\nelse Tomas says there's a spyglass hidden somewhere around the lighthouse. Something about a star.\nsound gasp"),
      o('boats', 'wave at the boats', ['wave'], 'Tiny fishermen wave back. One rings a bell.', 'sound bell'),
      o('carve', 'carve your name', ['write my name'], 'Tomas hands you a nail. Later, on the back wall, you carve your name next to all the others.'),
      o('down', 'go back down', ['go downstairs', 'leave'], 'Round and round, down the stairs.', 'go lighthouse'),
    ]),
  },
};

export const EXAMPLES = [RAINY_SATURDAY, HARBOR_MORNING];
