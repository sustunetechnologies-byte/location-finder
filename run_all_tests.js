const { spawn, execSync } = require('child_process');

async function main() {
  console.log('Spawning server.js process...');
  const serverProc = spawn('node', ['server.js'], { stdio: ['ignore', 'pipe', 'pipe'] });

  await new Promise((resolve, reject) => {
    let output = '';
    serverProc.stdout.on('data', (d) => {
      const text = d.toString();
      output += text;
      process.stdout.write(text);
      if (text.includes('listening at') || output.includes('listening at')) {
        resolve();
      }
    });
    serverProc.stderr.on('data', (d) => {
      process.stderr.write(d.toString());
    });
    serverProc.on('error', reject);
    serverProc.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Server exited with code ${code}`));
    });
    setTimeout(() => reject(new Error('Server start timed out')), 8000);
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

    console.log('\n ALL TESTS SUCCEEDED!');
  } finally {
    serverProc.kill();
  }
}

main().catch(err => {
  console.error('\n Test run failed:', err);
  process.exit(1);
});
