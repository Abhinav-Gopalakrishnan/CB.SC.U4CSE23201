const { Log } = require('./index');

async function runTests() {
  console.log('=== Logging Middleware Tests ===\n');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    process.stdout.write(`Test: ${name} ... `);
    try {
      await fn();
      console.log('PASS');
      passed++;
    } catch (e) {
      console.log(`FAIL - ${e.message}`);
      failed++;
    }
  }


  await test('Backend INFO log (middleware)', async () => {
    await Log('backend', 'info', 'middleware', 'Logging middleware initialized successfully');
  });

  await test('Backend ERROR log (handler)', async () => {
    await Log('backend', 'error', 'handler', 'received string, expected bool');
  });

  await test('Backend FATAL log (db)', async () => {
    await Log('backend', 'fatal', 'db', 'Critical database connection failure.');
  });

  await test('Backend WARN log (service)', async () => {
    await Log('backend', 'warn', 'service', 'API response time exceeding 2000ms threshold');
  });

  await test('Backend INFO log (controller)', async () => {
    await Log('backend', 'info', 'controller', 'Processing request for vehicle maintenance schedule');
  });

  await test('Backend INFO log (auth)', async () => {
    await Log('backend', 'info', 'auth', 'User authentication token validated');
  });

  await test('Backend ERROR log (repository)', async () => {
    await Log('backend', 'error', 'repository', 'Query returned null for vehicle ID abc-123');
  });


  await test('Validation: invalid stack rejects', async () => {
    try {
      await Log('mobile', 'info', 'handler', 'This should fail');
      throw new Error('Should have thrown');
    } catch (e) {
      if (e.message.includes('Invalid stack')) return; 
      throw e;
    }
  });

  await test('Validation: frontend package rejected on backend stack', async () => {
    try {
      await Log('backend', 'info', 'component', 'This should fail');
      throw new Error('Should have thrown');
    } catch (e) {
      if (e.message.includes('Invalid package')) return;
      throw e;
    }
  });

  await test('Validation: empty message rejects', async () => {
    try {
      await Log('backend', 'info', 'handler', '');
      throw new Error('Should have thrown');
    } catch (e) {
      if (e.message.includes('Message must be')) return; 
      throw e;
    }
  });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
}

runTests();
