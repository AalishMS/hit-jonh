/**
 * Jonh's context lines: what he says when the situation is specific (a streak of misses, the
 * third hit in a row, a particular garden, a particular hat, a particular bit of his property).
 * Pure data, no Phaser. Tone (SPEC §10): ordinary, stubborn, dry, mildly annoyed, convinced the
 * next spot will be peaceful. Slapstick only; never injury.
 */

/** Said after several misses in a row (SPEC §10.1 "Several consecutive misses"). */
export const MISS_STREAK_LINES: readonly string[] = [
  'Take your time. Apparently you need it.',
  'I could finish the crossword at this rate.',
  'Shall I put the kettle on while you practise?',
  'Most relaxing afternoon in weeks, this.',
  'Do you need a bigger cannon, or a smaller me?',
  'I have read this page four times now.',
];

/** A hit on the very first shot. */
export const FIRST_SHOT_LINES: readonly string[] = [
  'Not even a warning shot?',
  'First go? Unbelievable.',
  'Straight in. How rude.',
  'I had barely turned the page.',
];

/** Third (or later) hit in a row. */
export const HIT_STREAK_LINES: readonly string[] = [
  "That's three. I'm keeping a list.",
  "Again? I've only just sat down.",
  'Is this going to be a regular thing?',
  "I'm starting to take this personally.",
  'Same time tomorrow, I suppose.',
];

/** Strong body hits (he goes flying). */
export const STRONG_HIT_LINES: readonly string[] = [
  'I felt that in my cardigan.',
  "Splendid. Now I'm horizontal.",
  "Right. That's the crossword ruined.",
  'My tea went one way. I went the other.',
  'Ow. In a dignified sort of way.',
];

/** Ricochet (trick) body hits. */
export const TRICK_HIT_LINES: readonly string[] = [
  'Bounced it? Of course you did.',
  "That's not fair. That's geometry.",
  'Show-off.',
  'Round the houses, was it?',
];

/** Hat-only hits, by the hat he was wearing. */
export const HAT_LINES: Readonly<Record<string, readonly string[]>> = {
  boater: ['Not the boater!', 'That boater was nearly new.'],
  bowler: ["That bowler was my grandfather's.", 'Mind the bowler, please.'],
  fez: ['Not the fez!', 'I was rather fond of that fez.'],
  party: ["Party's over, apparently.", 'It was a surprise party hat. Surprise.'],
  propeller: ['It still had lift in it.', 'Do you know how hard those are to wind?'],
  chef: ['Too many cooks, clearly.', 'That toque was for best.'],
  viking: ['Even the Vikings knocked first.', 'My helmet! The horns!'],
  crown: ["That's treason, that is.", 'Heavy is the head. Lighter now.'],
};

/**
 * Obstacle complaints, matched in order by obstacle id fragment or material. A shot that touched
 * his property and missed him gets one of these.
 */
export const OBSTACLE_LINES: ReadonlyArray<{ match: { id?: string; material?: string }; lines: readonly string[] }> = [
  { match: { id: 'fence' }, lines: ['That was my good fence.', 'The fence was minding its own business.'] },
  { match: { id: 'shed' }, lines: ['Not the shed! My tools are in there.', 'That shed took me three weekends.'] },
  { match: { id: 'planter' }, lines: ['My petunias!', 'Those planters were symmetrical.'] },
  { match: { id: 'awning' }, lines: ['Not the awning!', 'That awning keeps the sun off my sandwiches.'] },
  { match: { id: 'billboard' }, lines: ['Mind the advertising.', "That billboard isn't even mine."] },
  { match: { id: 'carport' }, lines: ['Mind the carport.', 'That carport is load-bearing, probably.'] },
  { match: { id: 'silo' }, lines: ['You hit a silo. From there. Somehow.'] },
  { match: { material: 'trampoline' }, lines: ['That trampoline is for the grandchildren.', 'Boing. Very mature.'] },
  { match: { material: 'rubber' }, lines: ['Boing. Very mature.', 'The rubber ceiling was a bargain.'] },
  { match: { material: 'leaves' }, lines: ['Leave the apple tree out of this.', "You've bruised the apples."] },
  { match: { material: 'rock' }, lines: ["You've chipped the scenery.", 'That rock was here first.'] },
  { match: { material: 'concrete' }, lines: ['Mind the brickwork.', 'That wall has stood for forty years.'] },
  { match: { material: 'wood' }, lines: ['Mind the woodwork.', 'Splinters. Lovely.'] },
];

/** Per-garden flavour: `arrival` when he settles in, `miss` mixed into miss lines, `hit` into hit lines. */
export const MAP_LINES: Readonly<Record<string, { arrival: readonly string[]; miss: readonly string[]; hit: readonly string[] }>> = {
  backyard: {
    arrival: ['Much quieter here.', 'Lovely day for the garden.', 'Finally, the crossword.'],
    miss: ['The apple tree thanks you.', 'Lovely day for it.'],
    hit: ['In my own garden, too.'],
  },
  fence: {
    arrival: ['Good fences make good neighbours.', 'Nobody gets over this fence.', 'Much quieter here.'],
    miss: ['Good fences make good neighbours.', "The fence is doing its job, isn't it?"],
    hit: ['Over the fence? Cheek.'],
  },
  rooftop: {
    arrival: ['Nobody bothers you on a roof.', 'Lunch with a view.', 'Much quieter up here.'],
    miss: ['The pigeons are more accurate than you.', 'Mind the guttering.'],
    hit: ['On my lunch break!', 'You followed me up a building.'],
  },
  rubber: {
    arrival: ['Nothing gets past the wall.', 'Safe in the sandpit.'],
    miss: ['The wall is doing marvellously.', 'Sand in everything now.'],
    hit: ['Sand. Everywhere. Thank you.'],
  },
  bankshot: {
    arrival: ['Safe as houses under the carport.', 'Nobody can get me in here.'],
    miss: ['Safe as houses, this carport.', 'Not even close to the carport.'],
    hit: ['Off the billboard? Of course.'],
  },
  trampoline: {
    arrival: ['Up here, I am untouchable.', 'A balcony is a castle, really.'],
    miss: ['The hedge thanks you.', 'Up here, I am untouchable.'],
    hit: ['Through the balcony? Unbelievable.'],
  },
  moon: {
    arrival: ['Finally. Some peace and quiet.', 'No one will bother me on the moon.'],
    miss: ['Low gravity. High blood pressure.', 'It floats. You might have noticed.'],
    hit: ['You followed me to the moon?', 'One small step for man. One giant bonk.'],
  },
  valley: {
    arrival: ["They'll never reach me out here.", 'Is that a cannon? From over there?'],
    miss: ['Long way to come to miss.', 'The valley has an echo, you know.'],
    hit: ['From over there?!', 'That was a very long way to come for that.'],
  },
};

/** Said while the player takes ages to aim. */
export const HECKLE_LINES: readonly string[] = [
  'Any time now.',
  "I'm not getting any younger.",
  'Still deciding?',
  'Lovely afternoon for doing nothing.',
  "Take all day. I've got the paper.",
  'Is it broken? The cannon, I mean.',
];

/** Heckles after a few misses in a row. */
export const HECKLE_AFTER_MISSES: readonly string[] = [
  'Third time lucky? Fourth? Fifth?',
  'Maybe aim at me this time.',
  'Have you considered a hobby?',
];

/** The title screen: idle quips, and what he says when the demo shot (or a tap) gets him. */
export const TITLE_LINES: readonly string[] = [
  'Oh good. Visitors.',
  'This is a private garden.',
  "I'm not here.",
  'Go on, then. If you must.',
  'Nobody press Play.',
  'Lovely afternoon. Shame about you.',
];

export const TITLE_HIT_LINES: readonly string[] = [
  'Every single time.',
  "And we haven't even started.",
  'Was that the tutorial?',
  'Lovely. A demonstration.',
  'Before the menu, even.',
];

/** Jonh watching the winning shot replayed at the end of a match. */
export const WINNING_SHOT_LINES: readonly string[] = [
  "That's the one that did it.",
  'Must we watch it again?',
  'I was robbed.',
  'Slow motion. Marvellous.',
  "Frame it, why don't you.",
];

