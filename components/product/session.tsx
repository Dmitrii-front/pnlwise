"use client";
import { readResponse } from "@/lib/api-client";
import {
  clearPnlwiseBrowserStorage,
  type StorageRemover,
} from "@/lib/upload-form-storage";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

type DeleteRequest = (
  input: string,
  init: { method: "DELETE" },
) => Promise<Response>;

export async function deleteSessionData(
  request: DeleteRequest,
  storage: StorageRemover,
) {
  const res = await request("/api/session/data", { method: "DELETE" });
  const data = await readResponse(res);
  if (!res.ok) throw Error(data.error);
  clearPnlwiseBrowserStorage(storage);
}

export function DeleteData() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true);
    try {
      await deleteSessionData(fetch, window.localStorage);
      setOpen(false);
      window.location.href = "/generate";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="delete-data">
          <Trash2 size={14} /> Delete my data
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your report data?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes all statements, transactions, reports, and merchant
            rules in this browser session and your linked account, including
            paid reports. Download anything you want to keep first. Payment
            records are retained separately, and an active or incomplete Paddle
            transaction may need to be resolved before deletion can finish.
            After server deletion succeeds, saved Pnlwise form details and
            business-name history are also cleared from this browser. This
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep my data</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => void remove()}
          >
            Delete my data
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
