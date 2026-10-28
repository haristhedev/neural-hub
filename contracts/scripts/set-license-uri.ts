import { ethers, network } from "hardhat";
import fs from "node:fs";
import path from "node:path";

/**
 * The ERC-1155 metadata URI has to point at the public site, which only has a URL after it is hosted — so it is set
 * after deployment (admin only):
 *   LICENSE_URI='https://your-app.example/api/licenses/{id}.json' pnpm --filter @neuralhub/contracts set-license-uri --network baseSepolia
 */
async function main() {
  const uri = process.env.LICENSE_URI;
  if (!uri || !uri.includes("{id}") || !/^https:\/\//.test(uri)) throw new Error("Set LICENSE_URI to an https URL containing {id}");
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const all = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../web/src/lib/web3/deployments/all.json"), "utf8"));
  const licenses = await ethers.getContractAt("ModelLicenses", all[chainId].addresses.licenses);
  await (await licenses.setURI(uri)).wait();
  console.log(`License URI on ${network.name} is now ${await licenses.uri(257)}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
