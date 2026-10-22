/** pnpm --filter @neuralhub/contracts fund 0xYourWallet  → sends 10 ETH + 5,000 NHUSD on the local chain. */
import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const to = process.env.TO ?? process.argv.find((a) => a.startsWith("0x"));
  if (!to || !ethers.isAddress(to)) throw new Error("Usage: TO=0x… pnpm fund");
  const [deployer] = await ethers.getSigners();
  const dep = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../web/src/lib/web3/deployments/all.json"), "utf8"))["31337"];
  const token = await ethers.getContractAt("NHUSD", dep.addresses.paymentToken);
  await (await deployer.sendTransaction({ to, value: ethers.parseEther("10") })).wait();
  await (await token.mint(to, ethers.parseUnits("5000", 6))).wait();
  console.log(`Funded ${to} with 10 ETH and 5,000 NHUSD`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
