// ============================================================================
// Beds24 V2 API client (Deno / Supabase Edge Functions).
// Port of the validated Python flow: a permanent REFRESH token mints a 24h
// ACCESS token; all data calls carry the access token in the `token` header.
//
// The refresh token is stored as the Supabase secret BEDS24_REFRESH_TOKEN.
// The invite code is NOT used here — it was a one-time bootstrap that already
// produced the refresh token.
//
// Docs proven this session:
//   GET  /authentication/token   (header refreshToken) -> { token, expiresIn }
//   GET  /properties             (header token)
//   POST /properties             create / modify (array body)
//   GET  /bookings?departureFrom=&departureTo=&status=
//   POST /bookings               create / modify / cancel (array body)
// ============================================================================

const BASE = "https://api.beds24.com/v2";

export interface Beds24Booking {
  id: number;
  propertyId: number;
  roomId: number;
  status: string;
  arrival: string;    // ISO date
  departure: string;  // ISO date  (== checkout == cleaning trigger)
  firstName?: string;
  lastName?: string;
  apiSource?: string;
  apiSourceId?: number;
}

export class Beds24 {
  private token: string | null = null;

  private constructor(private refreshToken: string) {}

  /** Build a client and mint an access token from the stored refresh token. */
  static async create(): Promise<Beds24> {
    const rt = Deno.env.get("BEDS24_REFRESH_TOKEN");
    if (!rt) throw new Error("BEDS24_REFRESH_TOKEN secret not set");
    const c = new Beds24(rt);
    await c.refreshAccess();
    return c;
  }

  private async refreshAccess(): Promise<void> {
    const r = await fetch(`${BASE}/authentication/token`, {
      headers: { refreshToken: this.refreshToken },
    });
    if (!r.ok) throw new Error(`beds24 token refresh failed (${r.status}): ${await r.text()}`);
    const j = await r.json();
    if (!j.token) throw new Error("beds24 token refresh: no token in response");
    this.token = j.token;
  }

  private async call(method: string, path: string, body?: unknown): Promise<Response> {
    if (!this.token) await this.refreshAccess();
    const init: RequestInit = { method, headers: { token: this.token! } };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      (init.headers as Record<string, string>)["Content-Type"] = "application/json";
    }
    let res = await fetch(`${BASE}${path}`, init);
    // one retry on auth expiry
    if (res.status === 401) {
      await this.refreshAccess();
      (init.headers as Record<string, string>).token = this.token!;
      res = await fetch(`${BASE}${path}`, init);
    }
    return res;
  }

  private async json<T>(res: Response, ctx: string): Promise<T> {
    const text = await res.text();
    if (!res.ok) throw new Error(`beds24 ${ctx} (${res.status}): ${text}`);
    return JSON.parse(text) as T;
  }

  /**
   * Create a property with a single bookable unit (one apartment = one unit;
   * bedroom count is descriptive only and does NOT affect Beds24 billing).
   * Returns { propertyId, roomId }.
   */
  async createProperty(opts: {
    name: string;
    propertyType?: string;   // "apartment" | "house"
    country?: string;        // ISO2, default CY
    roomName?: string;
    maxPeople?: number;
  }): Promise<{ propertyId: number; roomId: number }> {
    const payload = [{
      name: opts.name,
      propertyType: opts.propertyType ?? "apartment",
      currency: "EUR",
      country: opts.country ?? "CY",
      roomTypes: [{
        name: opts.roomName ?? "Unit",
        qty: 1,
        maxPeople: opts.maxPeople ?? 4,
        roomType: opts.propertyType ?? "apartment",
      }],
    }];
    const r = await this.call("POST", "/properties", payload);
    const j = await this.json<Array<{ success: boolean; new?: { id: number; roomTypes: Array<{ id: number }> } }>>(r, "createProperty");
    const first = j[0];
    if (!first?.success || !first.new) throw new Error(`createProperty failed: ${JSON.stringify(j)}`);
    return { propertyId: first.new.id, roomId: first.new.roomTypes[0].id };
  }

  /**
   * Make a property dormant (no OTA sync, won't sell). Used for "disconnect"
   * because the API has no property-delete yet.
   */
  async setPropertyDormant(propertyId: number): Promise<void> {
    const r = await this.call("POST", "/properties", [
      { id: propertyId, sellPriority: 0, controlPriority: 0 },
    ]);
    await this.json(r, "setPropertyDormant");
  }

  /** Bookings checking out within [fromISO, toISO], live statuses only. */
  async checkoutsBetween(fromISO: string, toISO: string): Promise<Beds24Booking[]> {
    const r = await this.call(
      "GET",
      `/bookings?departureFrom=${fromISO}&departureTo=${toISO}`,
    );
    const j = await this.json<{ data: Beds24Booking[] }>(r, "checkoutsBetween");
    const dead = new Set(["cancelled", "black", "inquiry"]);
    return (j.data ?? []).filter((b) => !dead.has(b.status));
  }

  async cancelBooking(id: number): Promise<void> {
    const r = await this.call("POST", "/bookings", [{ id, status: "cancelled" }]);
    await this.json(r, "cancelBooking");
  }
}
