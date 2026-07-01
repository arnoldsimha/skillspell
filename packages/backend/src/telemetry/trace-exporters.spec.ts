import { buildTraceProcessors } from './trace-exporters';

describe('buildTraceProcessors', () => {
  it('returns only the Aspire processor when no langfuse config', () => {
    expect(buildTraceProcessors('http://aspire:18890')).toHaveLength(1);
  });

  it('adds the Langfuse processor when configured', () => {
    const ps = buildTraceProcessors('http://aspire:18890', {
      baseUrl: 'http://localhost:3001',
      publicKey: 'pk-lf-test',
      secretKey: 'sk-lf-test',
    });
    expect(ps).toHaveLength(2);
  });
});
