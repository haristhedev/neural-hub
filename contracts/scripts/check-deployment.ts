import { ethers, network } from "hardhat";
import fs from "node:fs";
import { MODELS } from "./seed-data";
import path from "node:path";

/**
 * Post-deploy sanity check for whichever network Hardhat is pointed at:
 *   pnpm --filter @neuralhub/contracts verify:deployment --network baseSepolia
 * Reads web/src/lib/web3/deployments/all.json (what the frontend uses) and verifies the on-chain state matches it.
 */
const FILE = path.resolve(__dirname, "../../web/src/lib/web3/deployments/all.json");

type Check = { name: string; ok: boolean; detail?: string };

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const all = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const d = all[chainId];
  if (!d) throw new Error(`No deployment for chain ${chainId} in ${FILE} — run the deploy script for this network first`);
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  for (const [label, address] of Object.entries(d.addresses as Record<string, string>)) {
    const code = await ethers.provider.getCode(address);
    add(`${label} has contract code`, code !== "0x", address);
  }

  const token = await ethers.getContractAt("NHUSD", d.addresses.paymentToken);
  const models = await ethers.getContractAt("ModelNFT", d.addresses.modelNFT);
  const licenses = await ethers.getContractAt("ModelLicenses", d.addresses.licenses);
  const market = await ethers.getContractAt("Marketplace", d.addresses.marketplace);

  add("token is NHUSD with 6 decimals", (await token.symbol()) === "NHUSD" && Number(await token.decimals()) === 6);
  add("marketplace is a license issuer", await licenses.hasRole(await licenses.ISSUER_ROLE(), d.addresses.marketplace));
  add("gateway holds GATEWAY_ROLE", await market.hasRole(await market.GATEWAY_ROLE(), d.gateway), d.gateway);
  const supply = Number(await models.totalSupply());
  if (process.env.EXPECT_SEEDED === "0") add("catalogue exists", supply >= 0, `${supply} models (seed check skipped)`);
  else add(`catalogue is fully seeded (${MODELS.length} models)`, supply === MODELS.length, `${supply} minted`);
  add("startBlock is not after the chain head", d.startBlock <= (await ethers.provider.getBlockNumber()), `startBlock ${d.startBlock}`);
  const uri = await licenses.uri(257);
  add("license metadata URI is public (not localhost)", network.name === "localhost" || network.name === "hardhat" || !/localhost|127\.0\.0\.1/.test(uri), uri);

  let failed = 0;
  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `  (${c.detail})` : ""}`);
    if (!c.ok) failed++;
  }
  console.log(`\n${checks.length - failed}/${checks.length} checks passed on ${network.name} (${chainId})`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
