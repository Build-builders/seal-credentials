import { SealError, SealErrorCode } from "../errors";
import type { SignTransaction } from "../types";
import type { TxPrepareResponse } from "./endpoints";

export interface PrepareSignSubmitArgs<T> {
  signTransaction: SignTransaction | undefined;
  prepare: () => Promise<TxPrepareResponse>;
  submit: (signedXdr: string) => Promise<T>;
  onPhase: (phase: "preparing" | "signing" | "submitting") => void;
}

/** Shared prepare -> sign -> submit flow behind every `useVault` write action. */
export async function runPrepareSignSubmit<T>({ signTransaction, prepare, submit, onPhase }: PrepareSignSubmitArgs<T>): Promise<T> {
  if (!signTransaction) {
    throw new SealError({
      code: SealErrorCode.MISSING_SIGN_TRANSACTION,
      message: "ActaConfig was not given a signTransaction callback — required for useVault write actions.",
    });
  }

  onPhase("preparing");
  const { xdr } = await prepare();

  onPhase("signing");
  let signedXdr: string;
  try {
    signedXdr = await signTransaction(xdr);
  } catch (err) {
    throw new SealError({
      code: SealErrorCode.SIGNING_REJECTED,
      message: err instanceof Error ? err.message : "Signing was rejected.",
      cause: err,
    });
  }

  onPhase("submitting");
  return submit(signedXdr);
}
