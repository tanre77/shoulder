import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SALE_CUT,
  SIGNUP_POINTS,
  awardSale,
  deskFor,
  matchAccount,
  readSession,
  referralSummary,
  registerAccount,
  spendHeld,
  viewForSession,
  writeSession,
} from "./accounts.ts";

function installStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: localStorage, configurable: true });
  Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });
}

beforeEach(() => {
  installStorage();
});

describe("deskFor and viewForSession", () => {
  it("sends each role to its desk and keeps a driver out of partner screens", () => {
    assert.equal(deskFor("driver"), "home");
    assert.equal(deskFor("insurance"), "insurer");
    assert.equal(deskFor("shop"), "operator");
    assert.equal(viewForSession("refer", "driver"), "refer");
    assert.equal(viewForSession("insurer", "driver"), "home");
    assert.equal(viewForSession("operator", "driver"), "home");
    assert.equal(viewForSession("quotes", "insurance"), "quotes");
    assert.equal(viewForSession("home", "insurance"), "insurer");
    assert.equal(viewForSession("home", "shop"), "operator");
    assert.equal(viewForSession("refer", "shop"), "refer");
  });
});

describe("registerAccount and matchAccount", () => {
  it("rejects a short password, a bad email, a blank name, and an unknown referral code", async () => {
    assert.deepEqual(await registerAccount({ name: "", email: "a@b.com", password: "password1", role: "driver" }), {
      ok: false,
      error: "Add your name.",
    });
    assert.deepEqual(await registerAccount({ name: "Ada", email: "nope", password: "password1", role: "driver" }), {
      ok: false,
      error: "Use a real email.",
    });
    assert.deepEqual(await registerAccount({ name: "Ada", email: "ada@example.com", password: "short", role: "driver" }), {
      ok: false,
      error: "Password needs 8 characters.",
    });
    assert.deepEqual(
      await registerAccount({
        name: "Ada",
        email: "ada@example.com",
        password: "password1",
        role: "driver",
        referralCode: "NOPE",
      }),
      { ok: false, error: "That referral code is not on an account." },
    );
  });

  it("creates unique referral codes, signs the member in, and refuses a duplicate email", async () => {
    const first = await registerAccount({ name: "Alice", email: "alice@example.com", password: "password1", role: "driver" });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.account.referralCode, "ALICE");
    assert.equal(readSession()?.id, first.account.id);

    const second = await registerAccount({ name: "Alice", email: "alice2@example.com", password: "password1", role: "driver" });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.account.referralCode, "ALICE2");

    const dup = await registerAccount({ name: "Al", email: "Alice@example.com", password: "password1", role: "driver" });
    assert.deepEqual(dup, { ok: false, error: "That email already has an account. Sign in." });
  });

  it("matches a password and rejects a wrong one", async () => {
    const created = await registerAccount({
      name: "Bea",
      email: "bea@example.com",
      password: "password1",
      role: "driver",
    });
    assert.equal(created.ok, true);
    writeSession(null);
    const wrong = await matchAccount("bea@example.com", "password2");
    assert.deepEqual(wrong, { ok: false, error: "Wrong password." });
    const missing = await matchAccount("nobody@example.com", "password1");
    assert.deepEqual(missing, { ok: false, error: "No account for that email." });
    const ok = await matchAccount("BEA@example.com", "password1");
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    assert.equal(ok.account.email, "bea@example.com");
    assert.equal(readSession()?.email, "bea@example.com");
  });
});

describe("referral hold", () => {
  it("awards signup points immediately and holds 5% of a referred stop until it is spent on a later service", async () => {
    const referrer = await registerAccount({
      name: "Rae",
      email: "rae@example.com",
      password: "password1",
      role: "driver",
    });
    assert.equal(referrer.ok, true);
    if (!referrer.ok) return;

    const member = await registerAccount({
      name: "Mo",
      email: "mo@example.com",
      password: "password1",
      role: "driver",
      referralCode: referrer.account.referralCode,
    });
    assert.equal(member.ok, true);
    if (!member.ok) return;

    const afterSignup = referralSummary(referrer.account.id);
    assert.equal(afterSignup.points, SIGNUP_POINTS);
    assert.equal(afterSignup.earned, 0);
    assert.equal(afterSignup.held, 0);
    assert.equal(afterSignup.events[0]?.kind, "signup");

    assert.equal(
      awardSale({ jobId: "job-1", accountId: member.account.id, name: "Mo", total: 200 }),
      true,
    );
    const afterSale = referralSummary(referrer.account.id);
    assert.equal(afterSale.earned, 10);
    assert.equal(afterSale.held, 10);
    assert.equal(afterSale.earned, 200 * SALE_CUT);
    assert.equal(afterSale.events[0]?.kind, "sale");
    assert.match(afterSale.events[0]?.note ?? "", /Held for your next service/);

    // Same stop is not awarded twice. A member with no referrer earns nothing.
    assert.equal(awardSale({ jobId: "job-1", accountId: member.account.id, name: "Mo", total: 200 }), false);
    assert.equal(awardSale({ jobId: "job-2", accountId: referrer.account.id, name: "Rae", total: 200 }), false);
    assert.equal(awardSale({ jobId: "job-3", accountId: null, name: "Mo", total: 200 }), false);
    assert.equal(awardSale({ jobId: "job-4", accountId: member.account.id, name: "Mo", total: 0 }), false);

    assert.equal(spendHeld({ accountId: referrer.account.id, jobId: "svc-1", amount: 4 }), true);
    const afterSpend = referralSummary(referrer.account.id);
    assert.equal(afterSpend.earned, 10);
    assert.equal(afterSpend.held, 6);
    assert.equal(spendHeld({ accountId: referrer.account.id, jobId: "svc-1", amount: 4 }), false);

    assert.equal(spendHeld({ accountId: referrer.account.id, jobId: "svc-2", amount: 100 }), true);
    const drained = referralSummary(referrer.account.id);
    assert.equal(drained.held, 0);
    assert.equal(drained.earned, 10);
    assert.equal(spendHeld({ accountId: referrer.account.id, jobId: "svc-3", amount: 1 }), false);
  });
});
