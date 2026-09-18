import { businessTypes, validDate } from "./domain";

export const uploadFormStorageKey = "pnlwise:upload-form:v1";
export const businessNameHistoryStorageKey = "pnlwise:business-name-history:v1";
export const businessNameHistoryLimit = 8;

export type AmountConvention = "" | "credit-positive" | "debit-positive";

export interface UploadFormState {
  businessType: string;
  businessName: string;
  periodStart: string;
  periodEnd: string;
  allAccounts: "yes" | "no";
  accountLabel: string;
  amountConvention: AmountConvention;
}

interface StoredUploadFormState extends UploadFormState {
  version: 1;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const emptyUploadFormState: UploadFormState = {
  businessType: "",
  businessName: "",
  periodStart: "",
  periodEnd: "",
  allAccounts: "yes",
  accountLabel: "",
  amountConvention: "",
};

function isShortString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.length <= maxLength;
}

function isOptionalDate(value: unknown) {
  return value === "" || (typeof value === "string" && validDate(value));
}

export function readUploadFormState(storage: StorageLike): UploadFormState {
  try {
    const raw = storage.getItem(uploadFormStorageKey);
    if (!raw) return { ...emptyUploadFormState };
    const value = JSON.parse(raw) as Partial<StoredUploadFormState>;
    if (
      value.version !== 1 ||
      typeof value.businessType !== "string" ||
      (value.businessType !== "" &&
        !businessTypes.includes(value.businessType)) ||
      !isShortString(value.businessName, 100) ||
      !isOptionalDate(value.periodStart) ||
      !isOptionalDate(value.periodEnd) ||
      (value.allAccounts !== "yes" && value.allAccounts !== "no") ||
      !isShortString(value.accountLabel, 40) ||
      !["", "credit-positive", "debit-positive"].includes(
        String(value.amountConvention),
      )
    ) {
      return { ...emptyUploadFormState };
    }
    return {
      businessType: value.businessType,
      businessName: value.businessName as string,
      periodStart: value.periodStart as string,
      periodEnd: value.periodEnd as string,
      allAccounts: value.allAccounts,
      accountLabel: value.accountLabel as string,
      amountConvention: value.amountConvention as AmountConvention,
    };
  } catch {
    return { ...emptyUploadFormState };
  }
}

export function writeUploadFormState(
  storage: StorageLike,
  state: UploadFormState,
) {
  try {
    const value: StoredUploadFormState = { version: 1, ...state };
    storage.setItem(uploadFormStorageKey, JSON.stringify(value));
  } catch {
    // Storage can be unavailable or full. The form must continue to work.
  }
}

export function clearUploadFormState(storage: StorageLike) {
  try {
    storage.removeItem(uploadFormStorageKey);
  } catch {
    // Storage failures must not block navigation after a successful upload.
  }
}

export function readBusinessNameHistory(storage: StorageLike): string[] {
  try {
    const parsed = JSON.parse(
      storage.getItem(businessNameHistoryStorageKey) || "[]",
    );
    if (!Array.isArray(parsed)) return [];
    const names: string[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (typeof item !== "string") continue;
      const name = item.trim().slice(0, 100);
      const key = name.toLocaleLowerCase();
      if (!name || seen.has(key)) continue;
      names.push(name);
      seen.add(key);
      if (names.length === businessNameHistoryLimit) break;
    }
    return names;
  } catch {
    return [];
  }
}

export function rememberBusinessName(storage: StorageLike, value: string) {
  const name = value.trim().slice(0, 100);
  if (!name) return readBusinessNameHistory(storage);
  const names = readBusinessNameHistory(storage).filter(
    (item) => item.toLocaleLowerCase() !== name.toLocaleLowerCase(),
  );
  const next = [name, ...names].slice(0, businessNameHistoryLimit);
  try {
    storage.setItem(businessNameHistoryStorageKey, JSON.stringify(next));
  } catch {
    // Autocomplete is optional; storage failures must not block submission.
  }
  return next;
}
