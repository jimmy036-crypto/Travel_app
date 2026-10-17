import { describe, expect, it } from 'vitest';
import {
  buildAnnualReview, buildFootprints, buildPassportStamps, buildShareText,
  collectionProgress, extractVisitCandidates, getMemoryYear, groupMemories,
} from './journalModel.js';

const memories = {
  spring: {
    archived: true, title: '春日旅行', destination: '日本', startDate: '2025-03-02', endDate: '2025-03-05',
    note: '櫻花很美', visits: {
      park: { status: 'visited', name: '公園', city: ' ＴＯＫＹＯ ', cityId: 'tokyo', country: '日本', lat: null, lng: '' },
      tower: { status: 'visited', name: '塔', city: 'tokyo', cityId: 'tokyo', country: '日本', note: '夕陽值得再看', lat: '35.5', lng: '139.5' },
      wish: { status: 'wishlist', name: '想去寺院', city: 'Kyoto', lat: 35, lng: 135 },
      miss: { status: 'missed', name: '未去', city: 'Osaka', lat: 34, lng: 135 },
      unknown: { name: '未確認', city: 'Osaka' },
      blank: { status: 'visited', name: '沒有城市', city: '   ' },
    }, firsts: { rail: '第一次搭新幹線' },
  },
  restored: {
    archived: false, title: '再次出發', startDate: '2026-01-02',
    visits: { return: { status: 'visited', name: '再訪公園', city: 'Tokyo', cityId: 'tokyo', country: '日本', lat: 0, lng: 0 } },
  },
  emptyRestored: { archived: false, title: '未完成', startDate: '2026-02-01', visits: {} },
  winter: { archived: true, title: '冬日', startDate: '2025-12-01', visits: {} },
};

describe('memory grouping', () => {
  it('uses start year before archive year and handles missing dates', () => {
    expect(getMemoryYear({ startDate: '2025-12-31', archivedAt: new Date(2026, 0, 1).getTime() })).toBe('2025');
    expect(getMemoryYear({ archivedAt: new Date(2024, 0, 1).getTime() })).toBe('2024');
    expect(getMemoryYear({ archivedAt: null })).toBe('未註明年份');
    expect(getMemoryYear({ startDate: 'bad', archivedAt: 'bad' })).toBe('未註明年份');
  });

  it('groups only archived memories and orders years and dates newest first', () => {
    const grouped = groupMemories({ ...memories, latest: { archived: true, startDate: '2026-06-01' }, unknown: { archived: true } });
    expect(grouped.map((group) => group.year)).toEqual(['2026', '2025', '未註明年份']);
    expect(grouped[1].memories.map((memory) => memory.roomId)).toEqual(['winter', 'spring']);
    expect(groupMemories(null)).toEqual([]);
  });

  it.each(['春日', '日本', '櫻花', '公園', 'TOKYO', '夕陽'])('searches saved trip and visit text: %s', (query) => {
    expect(groupMemories(memories, query).flatMap((group) => group.memories).map((memory) => memory.roomId)).toEqual(['spring']);
  });
});

describe('footprints', () => {
  it.each([
    ['Weißensee', 'WEISSENSEE', 'weissensee'],
    ['WEIẞENSEE', 'weissensee', 'weissensee'],
    ['Κόσμοσ', 'ΚΌΣΜΟΣ', 'κόσμοσ'],
  ])('groups explicit city identity across different labels %s and %s', (first, second, id) => {
    const trips = {
      a: { startDate: '2026-01-01', visits: { v: { status: 'visited', city: first, cityId: id } } },
      b: { startDate: '2026-02-01', visits: { v: { status: 'visited', city: second, cityId: id } } },
    };
    expect(buildFootprints(trips)).toHaveLength(1);
    expect(buildFootprints(trips)[0]).toMatchObject({ id, city: second, tripCount: 2 });
    expect(buildAnnualReview(trips, '2026')).toMatchObject({ tripCount: 2, cityCount: 1 });
    expect(buildPassportStamps(trips, {}).filter((stamp) => stamp.kind === 'return')).toHaveLength(1);
  });

  it('preserves accents and distinct letters instead of transliterating city identities', () => {
    const trips = { a: { visits: {
      a: { status: 'visited', city: 'Café', cityId: 'café' },
      b: { status: 'visited', city: 'Cafe', cityId: 'cafe' },
      c: { status: 'visited', city: 'I', cityId: 'i' },
      d: { status: 'visited', city: 'ı', cityId: 'ı' },
    } } };
    expect(buildFootprints(trips).map((city) => city.id)).toEqual(['cafe', 'café', 'i', 'ı']);
  });

  it('includes only confirmed visits, preserves restored visits and counts distinct trips', () => {
    const footprints = buildFootprints(memories);
    expect(footprints).toHaveLength(1);
    expect(footprints[0]).toMatchObject({ id: 'tokyo', city: 'Tokyo', tripCount: 2, years: ['2026', '2025'], lat: 0, lng: 0 });
    expect(footprints[0].visits.map((visit) => [visit.roomId, visit.visitId])).toEqual([
      ['restored', 'return'], ['spring', 'park'], ['spring', 'tower'],
    ]);
    expect(footprints[0].visits[0]).toMatchObject({ tripTitle: '再次出發', year: '2026' });
    expect(memories.spring.visits.park).not.toHaveProperty('roomId');
  });

  it.each([null, undefined, '', ' ', false, true, [], {}, 'not-a-number', Infinity, 91])('does not manufacture latitude from %j', (lat) => {
    expect(buildFootprints({ r: { visits: { v: { status: 'visited', city: 'Town', lat, lng: 0 } } } })[0])
      .toMatchObject({ lat: null, lng: null, tripCount: 1 });
  });

  it('rejects out-of-range longitude and sorts cities independently of insertion order', () => {
    const input = { r: { visits: {
      z: { status: 'visited', city: 'Zoo', cityId: 'zoo', lat: 0, lng: -181 },
      a: { status: 'visited', city: '  New   York ', cityId: 'new york', lat: -90, lng: 180 },
      b: { status: 'visited', city: 'new york', cityId: 'new york', lat: 10, lng: 20 },
    } } };
    expect(buildFootprints(input).map(({ id, tripCount, lat, lng }) => ({ id, tripCount, lat, lng }))).toEqual([
      { id: 'new york', tripCount: 1, lat: -90, lng: 180 },
      { id: 'zoo', tripCount: 1, lat: null, lng: null },
    ]);
  });
});

describe('annual review', () => {
  it('uses trip start year, includes archived trips and restored visits, excludes empty restored trips', () => {
    expect(buildAnnualReview(memories, '2025')).toMatchObject({ year: '2025', tripCount: 2, placeCount: 3, cityCount: 1 });
    expect(buildAnnualReview(memories, 2026)).toMatchObject({ year: '2026', tripCount: 1, placeCount: 1, cityCount: 1 });
    expect(buildAnnualReview(memories, '2026').memories.map((memory) => memory.roomId)).toEqual(['restored']);
    expect(buildAnnualReview({ r: { archived: true, archivedAt: new Date(2025, 0, 1).getTime() } }, '2025').tripCount).toBe(0);
  });
});

describe('collections and passport', () => {
  it('derives progress from live visit links rather than claimed completion', () => {
    expect(collectionProgress({ items: {
      a: { status: 'wishlist', roomId: 'spring', visitId: 'park' },
      b: { status: 'visited', roomId: 'spring', visitId: 'wish' },
      c: { status: 'visited', roomId: 'missing', visitId: 'park' },
    } }, memories)).toEqual({ total: 3, visited: 1, wishlist: 2, complete: false });
    expect(collectionProgress({ items: {} }, memories)).toEqual({ total: 0, visited: 0, wishlist: 0, complete: false });
    expect(collectionProgress({ deleted: true, items: { a: { roomId: 'spring', visitId: 'park' } } }, memories))
      .toEqual({ total: 0, visited: 0, wishlist: 0, complete: false });
  });

  it('creates first, return-city and complete-collection stamps with real source memories', () => {
    const stamps = buildPassportStamps(memories, {
      complete: { title: '鐵道清單', items: { a: { roomId: 'spring', visitId: 'park' } } },
      deleted: { deleted: true, title: '已刪除', items: { a: { roomId: 'spring', visitId: 'park' } } },
      empty: { title: '空白', items: {} },
      orphan: { title: '斷線', items: { a: { status: 'visited', roomId: 'gone', visitId: 'park' } } },
    });
    expect(stamps.map((stamp) => stamp.kind).sort()).toEqual(['collection', 'first', 'return']);
    expect(stamps.find((stamp) => stamp.kind === 'first')).toMatchObject({ title: '第一次搭新幹線', roomId: 'spring' });
    expect(stamps.find((stamp) => stamp.kind === 'collection')).toMatchObject({ title: '鐵道清單', target: { kind: 'collection', id: 'complete' } });
    expect(stamps.find((stamp) => stamp.kind === 'return')).toMatchObject({ target: { kind: 'city', id: 'tokyo' } });
    expect(stamps.find((stamp) => stamp.kind === 'first')).toMatchObject({ target: { kind: 'memory', id: 'spring' } });
    expect(buildPassportStamps({ r: { firsts: { invalid: true, empty: '', object: { title: 'invalid' } } } }, {})).toEqual([]);
  });
});

describe('share text', () => {
  it('requires explicit selection and exposes only selected memory summary and confirmed cities', () => {
    expect(buildShareText(memories, [])).toBe('');
    expect(buildShareText(memories)).toBe('');
    const text = buildShareText({ ...memories, spring: { ...memories.spring,
      roomId: 'secret-room', url: 'https://secret.test', travelers: ['私人旅伴'], photos: ['private-photo'],
    } }, ['spring', 'missing', 'spring']);
    for (const content of ['春日旅行', '2025-03-02', '2025-03-05', '日本', 'TOKYO']) expect(text).toContain(content);
    for (const privateContent of ['櫻花很美', 'secret-room', 'https:', '私人旅伴', 'private-photo', '第一次', '35.5', '139.5', '再次出發', 'Kyoto', 'Osaka', 'spring']) expect(text).not.toContain(privateContent);
    expect(text.match(/春日旅行/g)).toHaveLength(1);
  });
});

describe('visit candidates', () => {
  it('uses stable day occurrences, excludes transit and missing identities, and deduplicates exact identities', () => {
    const candidates = extractVisitCandidates({
      'Day 2': [{ id: 'p.1', name: '公園', lat: null, lng: '' }, { id: 'p.1', name: '重複' },
        { id: 'train', name: '列車', type: 'transit' }, { name: '沒有 ID' }, { id: 'empty', name: '' }],
      'Day 1': { a: { id: 'p.1', name: '同地不同天', type: 'place', lat: 0, lng: 0 }, b: { id: 'museum', name: '博物館', type: 'attraction' } },
    }, '2026-01-31');
    expect(candidates).toEqual([
      { visitId: 'Day%201~p%2E1', dayId: 'Day 1', itemId: 'p.1', name: '同地不同天', lat: 0, lng: 0, date: '2026-01-31' },
      { visitId: 'Day%201~museum', dayId: 'Day 1', itemId: 'museum', name: '博物館', lat: null, lng: null, date: '2026-01-31' },
      { visitId: 'Day%202~p%2E1', dayId: 'Day 2', itemId: 'p.1', name: '公園', lat: null, lng: null, date: '2026-02-01' },
    ]);
    expect(extractVisitCandidates(null, '')).toEqual([]);
  });

  it('encodes forbidden Firebase characters and separator collisions without changing identity on reordering', () => {
    const first = extractVisitCandidates({ 'Day.1': [{ id: 'p~a/#$[]', name: '地點' }] }, 'invalid');
    expect(first[0]).toMatchObject({ visitId: 'Day%2E1~p%7Ea%2F%23%24%5B%5D', date: '' });
    expect(first[0].visitId).not.toMatch(/[.#$[\]/]/);
    expect([...first[0].visitId].every((character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127)).toBe(true);
    expect(extractVisitCandidates({ 'Day 1': [{ id: 0, name: '零號' }] }, '')[0].itemId).toBe('0');
  });
});


describe('canonical city identities and explicit share fields', () => {
  it('keeps legacy labels unassigned and never guesses a canonical merge', () => {
    const input = {
      a: { startDate: '2026-01-01', visits: {
        a: { status: 'visited', city: '京都', country: '日本' },
        b: { status: 'visited', city: '日本・京都', country: '日本' },
        c: { status: 'visited', city: '京都', country: '日本', cityId: 'kyoto' },
      } },
      b: { startDate: '2026-02-01', visits: { a: { status: 'visited', city: '京都', country: '日本' } } },
    };
    const cities = buildFootprints(input);
    expect(cities).toHaveLength(3);
    expect(cities.filter((city) => city.unassigned)).toHaveLength(2);
    expect(cities.find((city) => city.unassigned && city.city === '京都')).toMatchObject({ tripCount: 2, country: '日本' });
    expect(buildAnnualReview(input, '2026').cityCount).toBe(1);
    expect(buildPassportStamps(input, {}).filter((stamp) => stamp.kind === 'return')).toEqual([]);
  });
  it('keeps same labels in different countries distinct through their IDs', () => {
    const cities = buildFootprints({ a: { visits: {
      a: { status: 'visited', city: 'Victoria', cityId: 'victoria-ca', country: '加拿大' },
      b: { status: 'visited', city: 'Victoria', cityId: 'victoria-sc', country: '塞席爾' },
    } } });
    expect(cities.map(({ id, country }) => ({ id, country }))).toEqual([{ id: 'victoria-ca', country: '加拿大' }, { id: 'victoria-sc', country: '塞席爾' }]);
  });
  it('shares personal notes only after explicit field selection', () => {
    expect(buildShareText(memories, ['spring'], { dates: false, cities: false, note: true })).toBe('春日旅行\n櫻花很美');
  });
  it('emits only one stamp per first experience type', () => {
    const stamps = buildPassportStamps({ ...memories, other: { startDate: '2026-01-01', firsts: { rail: '第一次搭新幹線' } } }, {});
    expect(stamps.filter((stamp) => stamp.kind === 'first')).toHaveLength(1);
  });
});


it('uses canonical city coordinates for footprints without losing the original place location', () => {
  const result = buildFootprints({ a: { visits: { v: { city: '京都', cityId: 'kyoto', country: '日本', status: 'visited', lat: 35.1, lng: 135.1, cityLat: 35, cityLng: 135 } } } });
  expect(result[0]).toMatchObject({ cityId: 'kyoto', country: '日本', lat: 35, lng: 135, cityLat: 35, cityLng: 135 });
  expect(result[0].visits[0]).toMatchObject({ lat: 35.1, lng: 135.1 });
});
