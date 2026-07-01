import type { Request, Response, NextFunction } from 'express';

// PUBLIC_URL is captured at module load — set it before importing the SUT.
process.env.APP_PUBLIC_URL = 'https://example.com';

// eslint-disable-next-line @typescript-eslint/no-var-requires
let httpsRedirectMiddleware: typeof import('./https-redirect.middleware.js').httpsRedirectMiddleware;

beforeAll(async () => {
  ({ httpsRedirectMiddleware } = await import('./https-redirect.middleware.js'));
});

function makeRes() {
  const res = {
    redirect: jest.fn(),
    status: jest.fn(),
    end: jest.fn(),
  } as unknown as Response & {
    redirect: jest.Mock;
    status: jest.Mock;
    end: jest.Mock;
  };
  res.status.mockReturnValue(res);
  return res;
}

function makeReq(url: string, headers: Record<string, string> = {}): Request {
  return { url, headers } as unknown as Request;
}

describe('httpsRedirectMiddleware', () => {
  it('passes the health check through without redirecting', () => {
    const res = makeRes();
    const next = jest.fn() as NextFunction;
    httpsRedirectMiddleware(makeReq('/api/health'), res, next);
    expect(next).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('calls next() when already on https (proxied)', () => {
    const res = makeRes();
    const next = jest.fn() as NextFunction;
    httpsRedirectMiddleware(makeReq('/x', { 'x-forwarded-proto': 'https' }), res, next);
    expect(next).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  describe('direct HTTP access (no proxy header)', () => {
    it('redirects to the public origin, preserving path + query', () => {
      const res = makeRes();
      httpsRedirectMiddleware(makeReq('/dashboard?tab=1'), res, jest.fn());
      expect(res.redirect).toHaveBeenCalledWith(301, 'https://example.com/dashboard?tab=1');
    });
  });

  describe('proxied HTTP (x-forwarded-proto: http)', () => {
    it('redirects to the public origin', () => {
      const res = makeRes();
      httpsRedirectMiddleware(makeReq('/path', { 'x-forwarded-proto': 'http' }), res, jest.fn());
      expect(res.redirect).toHaveBeenCalledWith(301, 'https://example.com/path');
    });
  });

  describe('F-07: open-redirect attempts are anchored to the trusted origin', () => {
    const cases: Array<[string, string]> = [
      ['//evil.com/path', 'https://example.com/path'],
      ['https://evil.com/steal', 'https://example.com/steal'],
      ['/\\evil.com', 'https://example.com/'],
      ['/normal/path', 'https://example.com/normal/path'],
    ];

    it.each(cases)('req.url %s never redirects off-origin', (input, expected) => {
      const res = makeRes();
      httpsRedirectMiddleware(makeReq(input), res, jest.fn());
      const [, target] = res.redirect.mock.calls[0] as [number, string];
      // Host is always example.com — never evil.com.
      expect(new URL(target).host).toBe('example.com');
      expect(target).toBe(expected);
    });
  });
});
