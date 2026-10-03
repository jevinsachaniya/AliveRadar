export default async function teardown() {
  await fetch('http://127.0.0.1:4030/stop', { method: 'POST' });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      await fetch('http://127.0.0.1:4030/ready', { signal: AbortSignal.timeout(1000) });
      await new Promise((resolve) => setTimeout(resolve, 250));
    } catch {
      return;
    }
  }
  throw new Error('The isolated browser test stack did not stop cleanly.');
}
