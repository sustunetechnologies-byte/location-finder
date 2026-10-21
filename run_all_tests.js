const { spawn, execSync } = require('child_process');

async function main() {
  console.log('Spawning server.js process...');
  const serverProc = spawn('node', ['server.js'], { stdio: ['ignore', 'pipe', 'pipe'] });

  await new Promise((resolve, reject) => {
    let resolved = false;
    serverProc.stdout.on('data', (d) => {
      const text = d.toString();
      process.stdout.write(text);
      if ((text.includes('listening at') || text.includes('3000')) && !resolved) {
        resolved = true;
        clearInterval(pollInterval);
        clearTimeout(timeoutId);
        resolve();
      }
    });
    serverProc.stderr.on('data', (d) => {
      process.stderr.write(d.toString());
    });
    serverProc.on('error', reject);
    serverProc.on('exit', (code) => {
      if (code !== 0 && !resolved) reject(new Error(`Server exited with code ${code}`));
    });

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch('http://127.0.0.1:3000/robots.txt');
        if (res.ok && !resolved) {
          resolved = true;
          clearInterval(pollInterval);
          clearTimeout(timeoutId);
          resolve();
        }
      } catch {}
    }, 250);

    const timeoutId = setTimeout(() => {
      clearInterval(pollInterval);
      if (!resolved) reject(new Error('Server start timed out'));
    }, 15000);
  });

  console.log('\n Server is ready. Running tests...\n');

  try {
    console.log('=== Running test_run.js ===');
    execSync('node test_run.js', { stdio: 'inherit' });

    console.log('\n=== Running test_features.js ===');
    execSync('node test_features.js', { stdio: 'inherit' });

    console.log('\n=== Running test_redesign.js ===');
    execSync('node test_redesign.js', { stdio: 'inherit' });

    console.log('\n=== Running test_all_features.js ===');
    execSync('node test_all_features.js', { stdio: 'inherit' });

    console.log('\n=== Running test_viewport_and_warnings.js ===');
    execSync('node test_viewport_and_warnings.js', { stdio: 'inherit' });

    console.log('\n=== Running test_sections_1_2_3.js ===');
    execSync('node test_sections_1_2_3.js', { stdio: 'inherit' });

    console.log('\n=== Running test_suite_sections_1_to_5.js ===');
    execSync('node test_suite_sections_1_to_5.js', { stdio: 'inherit' });

    console.log('\n ALL TESTS SUCCEEDED!');
  } finally {
    serverProc.kill();
  }
}

main().catch(err => {
  console.error('\n Test run failed:', err);
  process.exit(1);
});
