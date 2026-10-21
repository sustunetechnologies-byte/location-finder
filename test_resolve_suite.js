const aliases = require('./aliases.json');

async function testAliasesAndAmbiguity() {
  console.log('Testing all alias pairs via /api/resolve-location...');
  let matchCount = 0;
  const entries = Object.entries(aliases);
  
  for (const [typed, official] of entries) {
    try {
      const res1 = await fetch('http://localhost:3000/api/resolve-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: typed })
      }).then(r => r.json());

      const res2 = await fetch('http://localhost:3000/api/resolve-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: official })
      }).then(r => r.json());

      const id1 = res1.area?.placeId || (res1.candidates && res1.candidates[0]?.placeId);
      const id2 = res2.area?.placeId || (res2.candidates && res2.candidates[0]?.placeId);

      if (id1 && id2 && id1 === id2) {
        matchCount++;
      } else {
        console.log(`MISMATCH: ${typed} (${id1}) vs ${official} (${id2})`);
      }
    } catch (err) {
      console.error(`Error on ${typed}:`, err.message);
    }
  }
  console.log(`Matched alias pairs: ${matchCount} / ${entries.length}`);

  // Test ambiguous name
  console.log('\nTesting ambiguous name "Aurangabad"...');
  const resAmb = await fetch('http://localhost:3000/api/resolve-location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location: 'Aurangabad' })
  }).then(r => r.json());

  console.log('Aurangabad response status:', resAmb.status, 'candidates count:', resAmb.candidates?.length);
  if (resAmb.candidates) {
    resAmb.candidates.forEach(c => console.log(` - Candidate: ${c.name}, ${c.district}, ${c.state} (${c.placeId})`));
  }
}

testAliasesAndAmbiguity();
