// Space Adventure: a small, complete example world (text only, so it plays in
// the synth voice until lines are re-recorded).

export const SAMPLE_WORLD = {
  id: 'sample-space-adventure',
  version: 2,
  title: 'Space Adventure',
  start: 'cabin',
  items: {
    keycard: { text: 'a keycard' },
    spacesuit: { text: 'a spacesuit' },
  },
  scenes: {
    cabin: {
      name: 'the cabin',
      music: 'space',
      description: { text: 'You wake up in a narrow sleeping cabin on a rocket ship. A red light is flashing and an alarm is going off. There is a closet, a bunk, and a door. What do you do?' },
      options: [
        { id: 'look', phrase: { text: 'look around' }, also: ['search the room', 'check under the pillow'],
          result: { text: 'Under your pillow you find a keycard. It says BRIDGE.' },
          rules: 'gives keycard\nonce\nsound collect' },
        { id: 'closet', phrase: { text: 'open the closet' }, also: ['look in the closet'],
          result: { text: 'A spacesuit is hanging in the closet. You put it on. It is a little big.' },
          rules: 'gives spacesuit\nonce\nsound creak' },
        { id: 'sleep', phrase: { text: 'go back to sleep' }, also: ['lie down on the bunk'],
          result: { text: 'You try, but the alarm is much too loud.' }, rules: 'sound alert' },
        { id: 'door', phrase: { text: 'open the door' }, also: ['leave the cabin', 'go outside'],
          result: { text: 'The door slides open with a whoosh.' }, rules: 'sound whoosh\ngo corridor' },
      ],
    },
    corridor: {
      name: 'the corridor',
      music: 'space',
      description: { text: 'A long corridor. Emergency lights flicker. To the left is the bridge. To the right is the airlock. Behind you is your cabin.' },
      options: [
        { id: 'bridge', phrase: { text: 'go to the bridge' }, also: ['go left'],
          result: { text: 'You swipe the keycard. The bridge door hisses open.' },
          rules: "needs keycard\nelse The bridge door is locked. There's a slot for a keycard.\ngo bridge" },
        { id: 'airlock', phrase: { text: 'go to the airlock' }, also: ['go right'],
          result: { text: 'You hurry down the corridor.' }, rules: 'go airlock' },
        { id: 'back', phrase: { text: 'go back to the cabin' }, also: ['go back'],
          result: { text: 'You step back into your cabin.' }, rules: 'go cabin' },
      ],
    },
    bridge: {
      name: 'the bridge',
      music: 'space',
      description: { text: 'The bridge. Every screen is flashing: hull breach, evacuate. There is a big button labeled: unlock escape pod.' },
      options: [
        { id: 'button', phrase: { text: 'press the button' }, also: ['push the big button', 'unlock the escape pod'],
          result: { text: 'Clunk. Somewhere, a lock releases. The computer says: escape pod ready.' },
          rules: 'sets pod-unlocked\nsound beep' },
        { id: 'screens', phrase: { text: 'read the screens' }, also: ['look at the screens'],
          result: { text: 'The ship is losing air. You have a few minutes, at most.' }, rules: '' },
        { id: 'leave', phrase: { text: 'leave the bridge' }, also: ['go back to the corridor'],
          result: { text: 'You head back out.' }, rules: 'go corridor' },
      ],
    },
    airlock: {
      name: 'the airlock',
      music: 'night',
      description: { text: 'The airlock. Through a round window you can see the stars. A hatch leads to the escape pod.' },
      options: [
        { id: 'pod', phrase: { text: 'open the hatch' }, also: ['get in the escape pod', 'climb into the pod'],
          result: { text: 'The hatch swings open and you climb inside.' },
          rules: "needs pod-unlocked\nelse The hatch won't budge. Maybe it can be unlocked from the bridge.\ngo pod" },
        { id: 'window', phrase: { text: 'look out the window' }, also: ['look at the stars'],
          result: { text: 'Stars, everywhere. And a long way down to the planet below.' }, rules: '' },
        { id: 'back', phrase: { text: 'go back to the corridor' }, also: ['go back'],
          result: { text: 'You head back.' }, rules: 'go corridor' },
      ],
    },
    pod: {
      name: 'the escape pod',
      music: 'space',
      description: { text: 'You squeeze into the tiny escape pod. There is one seat and a big red launch lever.' },
      options: [
        { id: 'lever', phrase: { text: 'pull the lever' }, also: ['launch the pod', 'pull the red lever'],
          result: { text: 'Whoosh! The pod blasts away from the ship. You are safe.' },
          rules: 'needs spacesuit\nelse A warning light blinks: pilot must wear a spacesuit.\nsound flyby\nwin' },
        { id: 'out', phrase: { text: 'get out' }, also: ['leave the pod'],
          result: { text: 'You climb back out.' }, rules: 'go airlock' },
      ],
    },
  },
};
