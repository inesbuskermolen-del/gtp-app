/**
 * Typed, user-facing errors for the "handle I don't know gracefully"
 * requirement — every one of these should become a clear, honest message in
 * the UI and never a fabricated-looking result.
 */
export class GtpError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class GeocodeNotFoundError extends GtpError {
  constructor(address: string) {
    super(
      'GEOCODE_NOT_FOUND',
      `Could not find "${address}" on the map. Try including suburb, state and postcode (e.g. "1 Swan Street, Richmond VIC 3121").`,
      404
    );
  }
}

export class NonVictorianAddressError extends GtpError {
  constructor(address: string, state: string) {
    super(
      'NON_VICTORIAN_ADDRESS',
      `"${address}" appears to be in ${state || 'a state other than Victoria'}. This tool only covers Victorian councils and transport data.`,
      422
    );
  }
}

export class GeocodeServiceError extends GtpError {
  constructor(detail: string) {
    super('GEOCODE_SERVICE_ERROR', `Address lookup service failed: ${detail}`, 502);
  }
}

export class TransportServiceError extends GtpError {
  constructor(detail: string) {
    super(
      'TRANSPORT_SERVICE_ERROR',
      `Nearby transport-infrastructure lookup failed: ${detail}. The draft can still be generated but the Existing Transport Infrastructure section will need to be completed manually.`,
      502
    );
  }
}
