import { BaseError, ContractFunctionRevertedError, formatUnits, UserRejectedRequestError } from "viem";
import { PAYMENT_DECIMALS } from "./contracts";

export type TxErrorKind = "rejected" | "reverted" | "wrong-chain" | "insufficient-funds" | "network" | "unknown";

export interface DecodedTxError {
  kind: TxErrorKind;
  title: string;
  message: string;
  /** custom-error name when the contract reverted with one */
  errorName?: string;
}

const usd = (v: unknown) => `${Number(formatUnits(BigInt(v as bigint), PAYMENT_DECIMALS)).toLocaleString("en-US", { maximumFractionDigits: 4 })} NHUSD`;

/** Human copy for every custom error our contracts can raise. */
const CONTRACT_ERRORS: Record<string, (args: readonly unknown[]) => string> = {
  FaucetCooldown: ([at]) => `The faucet is rate-limited. Try again after ${new Date(Number(at) * 1000).toLocaleTimeString()}.`,
  InsufficientCredits: ([, have, need]) => `Not enough prepaid credits — you have ${usd(have)}, this needs ${usd(need)}.`,
  BatchAlreadyProcessed: () => "That usage batch was already settled.",
  NothingToClaim: () => "There is nothing to claim yet.",
  NotForSale: () => "This model is not listed for sale at that tier.",
  NotModelOwner: () => "Only the current owner of the model NFT can do this.",
  InvalidSplit: () => "Revenue split is invalid (partner share max 50%, partner address required).",
  InvalidRoyalty: () => "Royalty can be at most 10%.",
  AlreadyLicensed: () => "The recipient already holds this license.",
  OnlyWholeLicenseTransfer: () => "Licenses can only be transferred one at a time.",
  ERC20InsufficientBalance: () => "Your NHUSD balance is too low. Use the faucet on the Assets page to top up.",
  ERC20InsufficientAllowance: () => "Allowance too low — approve the spender first.",
  ERC2612ExpiredSignature: () => "The permit signature expired. Please try again.",
  ERC2612InvalidSigner: () => "The permit signature did not match your account.",
  ERC721NonexistentToken: () => "That model does not exist.",
  ERC721IncorrectOwner: () => "You do not own that token.",
  ERC1155InsufficientBalance: () => "You do not hold that license.",
  AccessControlUnauthorizedAccount: () => "This account is not authorised for that action.",
  ZeroAmount: () => "Amount must be greater than zero.",
};

export function decodeTxError(err: unknown): DecodedTxError {
  if (!(err instanceof BaseError)) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/user (rejected|denied)/i.test(msg)) return rejected();
    return { kind: "unknown", title: "Something went wrong", message: msg.slice(0, 240) };
  }

  if (err.walk((e) => e instanceof UserRejectedRequestError) || (err.walk((e) => (e as { code?: number }).code === 4001) as unknown)) {
    return rejected();
  }

  const revert = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
  if (revert) {
    const name = revert.data?.errorName;
    if (name && CONTRACT_ERRORS[name]) {
      return { kind: "reverted", title: "Transaction would fail", message: CONTRACT_ERRORS[name](revert.data?.args ?? []), errorName: name };
    }
    return {
      kind: "reverted",
      title: "Transaction would fail",
      message: revert.reason ?? name ?? "The contract rejected this call.",
      errorName: name,
    };
  }

  const name = err.name;
  if (name === "InsufficientFundsError" || /insufficient funds/i.test(err.shortMessage)) {
    return { kind: "insufficient-funds", title: "Not enough gas funds", message: "Your wallet does not hold enough native token to pay network fees." };
  }
  if (name === "ChainMismatchError" || /chain/i.test(name)) {
    return { kind: "wrong-chain", title: "Wrong network", message: "Switch your wallet to the supported network and retry." };
  }
  if (/HttpRequestError|TimeoutError|RpcRequestError/.test(name)) {
    return { kind: "network", title: "Network problem", message: "Could not reach the RPC endpoint. Check your connection and retry." };
  }
  return { kind: "unknown", title: "Transaction failed", message: err.shortMessage || err.message.slice(0, 240) };
}

const rejected = (): DecodedTxError => ({
  kind: "rejected",
  title: "Request cancelled",
  message: "You rejected the request in your wallet. Nothing was sent.",
});
