const fs = require('fs');
require('dotenv').config();
const key = process.env.GOOGLE_PLACES_API_KEY;

const aliases = JSON.parse(fs.readFileSync('aliases.json', 'utf8'));

const AREA_TYPES = new Set([
  'locality', 'sublocality', 'sublocality_level_1', 'sublocality_level_2', 'sublocality_level_3',
  'neighbourhood', 'administrative_area_level_1', 'administrative_area_level_2', 'administrative_area_level_3',
  'administrative_area_level_4', 'colloquial_area', 'postal_code', 'political'
]);

function isArea(types) {
  if (!Array.isArray(types)) return false;
  return types.some(t => AREA_TYPES.has(t));
}

async function resolveLocation(text) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const url = 'https://places.googleapis.com/v1/places:searchText';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.viewport,places.types'
        },
        body: JSON.stringify({
          textQuery: text,
          regionCode: 'IN',
          languageCode: 'en',
          pageSize: 5
        })
      });
      if (!res.ok) {
        if (res.status === 429) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        return null;
      }
      const data = await res.json();
      const areaPlaces = (data.places || []).filter(p => isArea(p.types));
      return areaPlaces;
    } catch (err) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return [];
}

async function run() {
  console.log('Testing 27 alias pairs from aliases.json...\n');
  let matched = 0;
  let mismatched = 0;

  for (const [legacy, official] of Object.entries(aliases)) {
    const resLegacy = await resolveLocation(legacy);
    const resOfficial = await resolveLocation(official);

    const idLegacy = resLegacy[0]?.id;
    const idOfficial = resOfficial[0]?.id;

    const nameLegacy = resLegacy[0]?.displayName?.text;
    const nameOfficial = resOfficial[0]?.displayName?.text;

    if (idLegacy && idOfficial && idLegacy === idOfficial) {
      console.log(`✅ MATCH: ${legacy} == ${official} -> [${idLegacy}] (${nameOfficial})`);
      matched++;
    } else {
      console.log(`❌ DIFF:  ${legacy} (${idLegacy || 'NONE'}, ${nameLegacy}) vs ${official} (${idOfficial || 'NONE'}, ${nameOfficial})`);
      mismatched++;
    }
    // Brief pause to avoid rate limits
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\nSummary: ${matched} matched, ${mismatched} mismatched.`);
}

run();
