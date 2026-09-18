import test from "node:test";
import assert from "node:assert/strict";
import {
  businessNameHistoryLimit,
  businessNameHistoryStorageKey,
  clearUploadFormState,
  emptyUploadFormState,
  readBusinessNameHistory,
  readUploadFormState,
  rememberBusinessName,
  uploadFormStorageKey,
  writeUploadFormState,
} from "../lib/upload-form-storage";

class MemoryStorage {
  values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

test("upload form preferences round-trip through the versioned Pnlwise key", () => {
  const storage = new MemoryStorage();
  const state = {
    businessType: "Consulting",
    businessName: "North Star Studio",
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    allAccounts: "no" as const,
    accountLabel: "Operating 1234",
    amountConvention: "debit-positive" as const,
  };
  writeUploadFormState(storage, state);
  assert.deepEqual(readUploadFormState(storage), state);
  assert.deepEqual(
    Object.keys(JSON.parse(storage.getItem(uploadFormStorageKey)!)).sort(),
    [
      "accountLabel",
      "allAccounts",
      "amountConvention",
      "businessName",
      "businessType",
      "periodEnd",
      "periodStart",
      "version",
    ],
  );
});

test("malformed, old, or invalid upload preferences fail closed", () => {
  const storage = new MemoryStorage();
  for (const value of [
    "not-json",
    JSON.stringify({ version: 0 }),
    JSON.stringify({
      version: 1,
      businessType: "Invented type",
      businessName: "Test",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      allAccounts: "yes",
      accountLabel: "",
      amountConvention: "credit-positive",
    }),
  ]) {
    storage.setItem(uploadFormStorageKey, value);
    assert.deepEqual(readUploadFormState(storage), emptyUploadFormState);
  }
});

test("upload persistence contains no files, report IDs, or financial contents", () => {
  const storage = new MemoryStorage();
  writeUploadFormState(storage, {
    ...emptyUploadFormState,
    businessType: "Other",
    businessName: "Allowed Name",
  });
  const raw = storage.getItem(uploadFormStorageKey)!;
  for (const forbidden of [
    "statement.csv",
    "reportId",
    "transaction",
    "merchant",
    "paddle",
    "secret",
  ]) {
    assert.equal(
      raw.toLocaleLowerCase().includes(forbidden.toLowerCase()),
      false,
    );
  }
  clearUploadFormState(storage);
  assert.equal(storage.getItem(uploadFormStorageKey), null);
});

test("submitted business names are deduplicated and bounded", () => {
  const storage = new MemoryStorage();
  rememberBusinessName(storage, "  Acme Studio  ");
  rememberBusinessName(storage, "acme studio");
  assert.deepEqual(readBusinessNameHistory(storage), ["acme studio"]);

  for (let index = 0; index < businessNameHistoryLimit + 3; index++) {
    rememberBusinessName(storage, `Business ${index}`);
  }
  const names = readBusinessNameHistory(storage);
  assert.equal(names.length, businessNameHistoryLimit);
  assert.equal(names[0], `Business ${businessNameHistoryLimit + 2}`);
  assert.equal(names.includes("Acme Studio"), false);
  assert.ok(storage.getItem(businessNameHistoryStorageKey));
});

test("invalid business-name history is ignored", () => {
  const storage = new MemoryStorage();
  storage.setItem(businessNameHistoryStorageKey, "not-json");
  assert.deepEqual(readBusinessNameHistory(storage), []);
});
