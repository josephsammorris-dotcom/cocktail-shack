/*
 * Customer comments for the phones: a live feed under each bar's sales count during the day.
 *
 * Cosmetic only: built from the settled results (the same verdicts as the report, plus the walk-aways in the
 * day script), so what customers say always matches what really happened. Moods: happy, funny, angry, sad, serious.
 * Tokens: {bar} your bar, {price} your price, {rival} a cheaper rival, {away} the visiting team.
 */

const Q = {
  // ---- price
  price_fair: [
    ['happy', '{price}p? Fair enough. Make it a large one.'],
    ['happy', 'Decent price, decent drink. Can\'t argue.'],
    ['serious', 'Reasonable pricing. I\'ll be recommending {bar}.'],
    ['funny', 'Finally, a beach bar that doesn\'t need a mortgage.'],
    ['happy', 'Worth every penny of {price}p.'],
  ],
  price_cheap: [
    ['funny', '{price}p?! I\'d have paid double. Don\'t tell them.'],
    ['happy', 'Cheapest cocktails on the coast. Get two!'],
    ['funny', 'At {price}p I\'m buying one for my dog.'],
    ['serious', 'You could charge more, you know. Just saying.'],
  ],
  price_below: [
    ['funny', 'Are they paying ME to drink this? Brilliant.'],
    ['serious', 'How do they make money at {price}p? They don\'t, do they.'],
    ['happy', 'A cocktail for {price}p! It\'s like 1983 again!'],
    ['funny', 'The accountant at {bar} is crying into a mojito.'],
  ],
  price_steep: [
    ['serious', '{price}p is a bit steep, but go on then.'],
    ['sad', 'There goes my ice cream money.'],
    ['funny', 'For {price}p I expect the umbrella to be real gold.'],
    ['angry', 'Daylight robbery... but it IS hot.'],
  ],
  price_dear: [
    ['angry', '{price}p for THAT?! Not a chance!'],
    ['angry', 'Who do they think we are, millionaires?'],
    ['funny', '{price}p? I\'ll drink seawater, thanks.'],
    ['sad', 'I only brought my pocket money...'],
    ['angry', 'I\'m writing to the council about these prices.'],
  ],
  wa_price: [
    ['angry', 'Too dear. I\'m off.'],
    ['sad', 'Can\'t afford that. Tap water it is.'],
    ['funny', 'I looked at the price and my wallet fainted.'],
    ['angry', '{price}p?! Walking away, thanks.'],
    ['sad', 'Looked at the price board and lost the will to sunbathe.'],
    ['serious', 'Not paying {price}p for a cocktail. Principle.'],
  ],
  wa_cheaper: [
    ['serious', '{rival} is cheaper. See ya!'],
    ['funny', 'Psst, {rival} has a better deal. Don\'t tell {bar}.'],
    ['angry', 'Why pay {price}p here? Off to {rival}.'],
    ['happy', 'Ooh, {rival} is cheaper! Bye!'],
  ],
  // ---- stock
  soldout: [
    ['angry', 'SOLD OUT?! I queued for twenty minutes!'],
    ['sad', 'They\'ve run out... my day is ruined.'],
    ['angry', 'What kind of cocktail bar runs out of cocktails?'],
    ['funny', 'Sold out. I\'ll just lick the umbrella then.'],
    ['sad', 'Last one went to the man in front of me. Typical.'],
    ['angry', 'No cocktails left? I\'m leaving a one-star review!'],
    ['funny', 'Sold out! Even the gulls look disappointed.'],
  ],
  waste: [
    ['funny', 'Why is there a mountain of melting cocktails back there?'],
    ['serious', 'That\'s a lot of drinks going warm in the sun.'],
    ['funny', 'The gulls are eyeing up all those spare cocktails.'],
    ['sad', 'All those lovely cocktails and nobody to drink them.'],
  ],
  nothing: [
    ['angry', 'A cocktail bar with NO cocktails? Is this a joke?'],
    ['funny', 'I asked for a mojito and got a shrug.'],
    ['sad', 'Empty shelves. What a waste of a sunny day.'],
  ],
  // ---- ads
  ads_spam: [
    ['angry', 'If I see ONE more flyer for {bar} I\'m swimming to France.'],
    ['funny', 'There\'s a leaflet for {bar} stuck to my sandwich.'],
    ['angry', 'Stop shouting about {bar}! We heard you!'],
    ['funny', 'The plane banner, the flyers, the man in the costume... we get it!'],
  ],
  ads_good: [
    ['happy', 'Saw the {bar} banner from the sea. Here I am!'],
    ['happy', 'Got your flyer. Worth the walk!'],
    ['serious', 'Good advertising. That\'s how I found you.'],
    ['funny', 'The sign said "best cocktails on the beach". Prove it!'],
  ],
  ads_none: [
    ['sad', 'I didn\'t even know {bar} was here.'],
    ['serious', 'Nice bar. Hidden, though. Ever heard of a sign?'],
    ['funny', 'Found {bar} by accident. Best accident of my life.'],
  ],
  ads_waste: [
    ['serious', 'Your flyers are in every bin on the beach.'],
    ['funny', 'Used one of your leaflets as a fan. Very useful, thanks.'],
  ],
  // ---- staff
  staff_idle: [
    ['funny', 'All these staff and hardly any queue. Am I royalty?'],
    ['serious', 'Half the staff at {bar} are just playing on their phones.'],
    ['funny', 'There are more bar staff than customers here!'],
    ['funny', 'One of the staff is building a sandcastle behind the bar.'],
  ],
  staff_busy: [
    ['sad', 'The poor barman looks absolutely frazzled.'],
    ['serious', 'They could do with another pair of hands back there.'],
    ['funny', 'The barman is shaking three cocktails at once!'],
  ],
  staff_quick: [
    ['happy', 'Speedy service! Cheers!'],
    ['happy', 'Lovely staff, quick as you like.'],
    ['happy', 'Served with a smile.'],
  ],
  // ---- weather
  wx_hot: [
    ['happy', 'I\'m MELTING. Thank heavens for {bar}!'],
    ['funny', 'It\'s so hot the sand is cooking my feet. Two please!'],
    ['happy', 'Ice, ice, and more ice please!'],
  ],
  wx_cold: [
    ['sad', 'Brrr. Do you do hot chocolate?'],
    ['funny', 'A frozen daiquiri? It\'s ALREADY frozen out here!'],
    ['serious', 'Bit nippy for cocktails, but go on.'],
  ],
  wx_grey: [
    ['serious', 'Grey skies, but a cocktail cheers things up.'],
    ['sad', 'Not exactly sunbathing weather, is it?'],
  ],
  wx_storm: [
    ['funny', 'My umbrella just flew off to Spain!'],
    ['serious', 'Brave of {bar} to stay open in this.'],
    ['sad', 'Soaked through. At least the cocktail is dry.'],
  ],
  // ---- fixtures and events
  match: [
    ['happy', 'Come on Home! Another round!'],
    ['funny', 'Missed the last point getting this. Worth it.'],
    ['happy', 'Great rally! I need a drink after that.'],
    ['serious', '{away} look strong today. Nervy stuff.'],
    ['funny', 'I don\'t understand volleyball, but I understand cocktails.'],
    ['happy', 'What a spike! Same again please!'],
  ],
  final: [
    ['happy', 'It\'s the FINAL! Cocktails all round!'],
    ['serious', 'Biggest day of the season. Don\'t run out, {bar}!'],
  ],
  match_off: [
    ['sad', 'Match abandoned! I came all this way...'],
    ['angry', 'Called off?! I want my ticket money back!'],
  ],
  ev_van: [
    ['serious', 'The juice van is doing smoothies for half the price.'],
    ['funny', 'The juice van man has a really catchy jingle.'],
    ['angry', 'Who let a juice van on the beach?!'],
  ],
  ev_gulls: [
    ['angry', 'A gull just stole my mojito!'],
    ['funny', 'That seagull is wearing a tiny hat. RUN!'],
    ['sad', 'I dropped my cocktail running from the gulls...'],
  ],
  ev_party: [
    ['happy', 'This DJ is unreal! Three more please!'],
    ['funny', 'I can\'t dance, but after this cocktail I think I can.'],
    ['happy', 'Best beach party ever! Keep them coming!'],
  ],
  ev_thirdset: [
    ['happy', 'THIRD SET! My nerves need a cocktail!'],
    ['funny', 'This match will never end. Better get a refill.'],
  ],
  happy: [
    ['happy', 'Best piña colada on the coast!'],
    ['happy', 'Ooh, a little umbrella! Love it.'],
    ['funny', 'My nan would love this. I\'m not sharing though.'],
    ['happy', 'Holiday mode: ON.'],
    ['funny', 'I came for one. This is my fourth.'],
    ['happy', 'Cheers, {bar}!'],
    ['serious', 'Proper fruit in it, too. Very good.'],
    ['funny', 'Has anyone seen my other flip-flop?'],
    ['happy', 'This is the life. Don\'t wake me up.'],
    ['funny', 'I told my boss I was ill. Cheers!'],
    ['happy', 'Ten out of ten. Would queue again.'],
    ['funny', 'Is it too early for a cocktail? Never mind, don\'t answer.'],
    ['serious', 'Good balance of lime and sugar. Proper job.'],
    ['funny', 'My sunburn and this cocktail are the same colour.'],
    ['happy', 'Putting {bar} on my holiday postcard!'],
    ['funny', 'I\'ve lost the kids, but I\'ve found a mojito.'],
    ['sad', 'Last day of my holiday. Better make it a double.'],
  ],
};

const BUYER = new Set(['price_fair', 'price_cheap', 'price_below', 'price_steep', 'price_dear', 'ads_spam', 'ads_good', 'ads_none', 'ads_waste',
  'staff_idle', 'staff_busy', 'staff_quick', 'wx_hot', 'wx_cold', 'wx_grey', 'wx_storm', 'match', 'final', 'ev_party', 'ev_thirdset', 'happy', 'waste']);

/**
 * Comments for one bar's day. res: the bar's results (with verdicts); sb: its day-script entry; ctx: { weather, event,
 * fixture, names: {slot: bar name} }; rnd: () => [0,1); recent: ids used lately for this bar (kept fresh by the caller).
 * Returns [{ atMs, mood, text, id }] in time order.
 */
export function barQuotes(res, sb, ctx, rnd = Math.random, recent = []) {
  const v = res.verdicts, ev = ctx.event, fx = ctx.fixture || {};
  const sales = sb?.saleTimesMs || [], last = sales.length ? sales[sales.length - 1] : 1000;
  const fleeAt = ev?.type === 'gulls' ? ev.atMs : Infinity;
  const want = [];                                   // [key, atMs or null (a sale time is picked), priority]
  const add = (key, at = null, pri = 1) => want.push({ key, at, pri });

  if (res.mixed === 0) add('nothing', 2500, 3);
  if (v) {
    const [, mixNote] = v.mix;
    if (mixNote.startsWith('sold out')) add('soldout', Math.min(13200, last + 700), 3);
    else if (v.mix[0] !== 'good' && res.mixed > 0 && res.sold < res.mixed) add('waste', 9500 + rnd() * 3000, 2);
    const a = v.ads[1];
    if (a.includes('far too many')) add('ads_spam', null, 3);
    else if (a.includes('down the drain') || a.includes('barely')) add('ads_waste', null, 1);
    else if (res.ads === 0 && v.ads[0] !== 'good') add('ads_none', null, 2);
    else if (a.includes('paid their way')) add('ads_good', null, 1);
    const p = v.price[1];
    add(p.includes('below cost') ? 'price_below' : p.includes('far too dear') ? 'price_dear' : p.includes('steep') ? 'price_steep'
      : p.includes('charge more') ? 'price_cheap' : 'price_fair', null, v.price[0] === 'good' ? 1 : 3);
    const s = v.staff[1];
    add(s.includes('idle') ? 'staff_idle' : s.includes('full capacity') ? 'staff_busy' : 'staff_quick', null, v.staff[0] === 'good' ? 0 : 2);
  }
  // walk-aways say it at the moment they turn away (at most two)
  const wa = (sb?.walkaways || []).filter(w => w.atMs < fleeAt);
  for (const w of wa.filter(w => w.reason !== 'soldout').slice(0, 2)) add(w.reason === 'cheaper' ? 'wa_cheaper' : 'wa_price', w.atMs, 2);
  // the day itself
  const wx = { scorcher: 'wx_hot', cool: 'wx_cold', cloud: 'wx_grey', storm: 'wx_storm' }[ctx.weather];
  if (wx) add(wx, null, 2);
  if (ev?.type === 'van') add('ev_van', ev.atMs + 1200 + rnd() * 2000, 3);
  if (ev?.type === 'gulls') add('ev_gulls', ev.atMs + 600, 3);
  if (ev?.type === 'extra') add(fx.match ? 'ev_thirdset' : 'ev_party', ev.atMs + 900 + rnd() * 2500, 3);
  if (fx.match) {
    if (fx.abandoned) add('match_off', (ev?.atMs ?? 0) + 2500, 3);
    else add(fx.stage === 'final' ? 'final' : 'match', null, 1);
  }
  const target = Math.max(4, Math.min(10, 3 + Math.round(sales.length / 3)));
  while (want.length < target) add('happy', null, 0);

  // pick the most important first, then place each one in time
  want.sort((a, b) => b.pri - a.pri || rnd() - 0.5);
  const placed = [], used = new Set(recent);
  const tooClose = at => placed.some(q => Math.abs(q.atMs - at) < 900);
  const freeSales = sales.filter(t => t < fleeAt && t < 13000);
  for (const w of want) {
    if (placed.length >= target) break;
    let at = w.at;
    if (at == null) {
      if (!BUYER.has(w.key) || !freeSales.length) continue;         // a buyer comments as they're served
      const options = freeSales.filter(t => !tooClose(t));
      if (!options.length) continue;
      at = options[Math.floor(rnd() * options.length)];
    } else if (tooClose(at)) {
      at = [at + 1200, at - 1200, at + 2400].find(x => x > 800 && x < 13600 && !tooClose(x));
      if (at == null) continue;
    }
    if (BUYER.has(w.key) && at >= fleeAt && w.key !== 'ev_party') continue;
    const pool = Q[w.key].map((q, i) => ({ q, id: `${w.key}.${i}` }));
    const fresh = pool.filter(x => !used.has(x.id));
    const pick = (fresh.length ? fresh : pool)[Math.floor(rnd() * (fresh.length ? fresh : pool).length)];
    used.add(pick.id);
    const rival = ctx.names?.[wa.find(x => x.reason === 'cheaper')?.to] || 'next door';
    const text = pick.q[1].replace(/\{bar\}/g, res.bar).replace(/\{price\}/g, res.price).replace(/\{rival\}/g, rival).replace(/\{away\}/g, fx.away || 'the visitors');
    placed.push({ atMs: Math.round(at), mood: pick.q[0], text, id: pick.id });
  }
  return placed.sort((a, b) => a.atMs - b.atMs);
}

export const QUOTE_BANK = Q;
