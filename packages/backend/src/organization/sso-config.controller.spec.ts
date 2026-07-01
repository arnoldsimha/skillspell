import { SsoConfigController } from './sso-config.controller.js';

// We test the private `parseMetadataXml` method directly via type casting.
type SsoConfigControllerPrivate = {
  parseMetadataXml(xml: string): {
    idpEntityId: string | null;
    idpSsoUrl: string | null;
    idpSloUrl: string | null;
    idpCertificate: string | null;
  };
};

const SAMPLE_METADATA = `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com/saml">
  <md:IDPSSODescriptor WantAuthnRequestsSigned="false" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>
            MIICpDCCAYwCCQDU+pQ4pHgSpDANBgkqhkiG9w0BAQsFADAUMRIwEAYDVQQDDAls
            b2NhbGhvc3QwHhcNMjMwMTAxMDAwMDAwWhcNMjQwMTAxMDAwMDAwWjAUMRIwEAYD
          </ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example.com/sso/redirect"/>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.example.com/sso/post"/>
    <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example.com/slo"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

const POST_ONLY_METADATA = `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.post.com/saml">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.post.com/sso/post"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

const NO_NAMESPACE_METADATA = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.nons.com/saml">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>ABCDEF1234</X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.nons.com/sso"/>
  </IDPSSODescriptor>
</EntityDescriptor>`;

describe('SsoConfigController – parseMetadataXml', () => {
  let ctrl: SsoConfigControllerPrivate;

  beforeEach(() => {
    // Constructor args are only used by HTTP handlers; pass nulls for unit tests.
    ctrl = new SsoConfigController(null as never, null as never) as unknown as SsoConfigControllerPrivate;
  });

  it('parses entityID correctly from namespaced metadata', () => {
    const result = ctrl.parseMetadataXml(SAMPLE_METADATA);
    expect(result.idpEntityId).toBe('https://idp.example.com/saml');
  });

  it('prefers HTTP-Redirect over HTTP-POST for SSO URL', () => {
    const result = ctrl.parseMetadataXml(SAMPLE_METADATA);
    expect(result.idpSsoUrl).toBe('https://idp.example.com/sso/redirect');
  });

  it('falls back to HTTP-POST when only HTTP-POST is available', () => {
    const result = ctrl.parseMetadataXml(POST_ONLY_METADATA);
    expect(result.idpSsoUrl).toBe('https://idp.post.com/sso/post');
  });

  it('parses SingleLogoutService Location correctly', () => {
    const result = ctrl.parseMetadataXml(SAMPLE_METADATA);
    expect(result.idpSloUrl).toBe('https://idp.example.com/slo');
  });

  it('extracts X509Certificate and strips all whitespace', () => {
    const result = ctrl.parseMetadataXml(SAMPLE_METADATA);
    // Whitespace stripped — no spaces, newlines, or tabs
    expect(result.idpCertificate).not.toBeNull();
    expect(result.idpCertificate).not.toMatch(/\s/);
    expect(result.idpCertificate).toContain('MIICpDCCAYwCCQDU');
  });

  it('returns null fields for malformed XML without throwing', () => {
    const result = ctrl.parseMetadataXml('<not valid xml>>>');
    expect(result.idpEntityId).toBeNull();
    expect(result.idpSsoUrl).toBeNull();
    expect(result.idpSloUrl).toBeNull();
    expect(result.idpCertificate).toBeNull();
  });

  it('returns null for empty string without throwing', () => {
    const result = ctrl.parseMetadataXml('');
    expect(result.idpEntityId).toBeNull();
    expect(result.idpSsoUrl).toBeNull();
  });

  it('parses metadata without namespace prefixes (default namespace)', () => {
    const result = ctrl.parseMetadataXml(NO_NAMESPACE_METADATA);
    expect(result.idpEntityId).toBe('https://idp.nons.com/saml');
    expect(result.idpSsoUrl).toBe('https://idp.nons.com/sso');
    expect(result.idpCertificate).toBe('ABCDEF1234');
  });
});
