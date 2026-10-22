import { ethers, network } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import fs from "node:fs";
import path from "node:path";
import { MODELS, modelMetadata, prng } from "./seed-data";

const USD = (n: number | string) => ethers.parseUnits(n.toString(), 6);
const OUT_DIR = path.resolve(__dirname, "../../web/src/lib/web3/deployments");

async function main() {
  const signers = await ethers.getSigners();
  const [deployer] = signers;
  const isLocal = network.name === "localhost" || network.name === "hardhat";
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log(`Deploying to ${network.name} (${chainId}) as ${deployer.address}`);

  const token = await (await ethers.getContractFactory("NHUSD")).deploy(deployer.address);
  const models = await (await ethers.getContractFactory("ModelNFT")).deploy();
  const licenseUri = process.env.LICENSE_URI ?? "http://localhost:3000/api/licenses/{id}.json";
  const licenses = await (await ethers.getContractFactory("ModelLicenses")).deploy(deployer.address, licenseUri);
  const gatewayAddress = isLocal ? signers[1].address : (process.env.GATEWAY_ADDRESS ?? deployer.address);
  const market = await (
    await ethers.getContractFactory("Marketplace")
  ).deploy(deployer.address, deployer.address, await token.getAddress(), await models.getAddress(), await licenses.getAddress());
  await Promise.all([token, models, licenses, market].map((c) => c.waitForDeployment()));

  await (await licenses.grantRole(await licenses.ISSUER_ROLE(), await market.getAddress())).wait();
  await (await market.grantRole(await market.GATEWAY_ROLE(), gatewayAddress)).wait();
  const startBlock = await ethers.provider.getBlockNumber();

  if (isLocal || process.env.SEED === "1") await seed({ signers, token, models, market, licenses });

  const deployment = {
    chainId,
    network: network.name,
    startBlock: Math.max(0, startBlock - 4),
    gateway: gatewayAddress,
    addresses: {
      paymentToken: await token.getAddress(),
      modelNFT: await models.getAddress(),
      licenses: await licenses.getAddress(),
      marketplace: await market.getAddress(),
    },
  };
  // deployments/all.json maps chainId -> deployment; the frontend registry reads this single file.
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, "all.json");
  const all = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  all[chainId] = deployment;
  fs.writeFileSync(file, JSON.stringify(all, null, 2) + "\n");
  console.log("Wrote", file);
  console.log(deployment.addresses);
}

type Ctx = {
  signers: Awaited<ReturnType<typeof ethers.getSigners>>;
  token: any; models: any; market: any; licenses: any;
};

/** Mints the catalogue and replays ~6 months of purchases + metered API usage. */
async function seed({ signers, token, models, market }: Ctx) {
  const gateway = signers[1];
  const buyers = signers.slice(10, 16);
  console.log("Seeding catalogue…");

  for (let i = 0; i < MODELS.length; i++) {
    const m = MODELS[i];
    const id = i + 1;
    const meta = modelMetadata(m, id);
    const uri = `data:application/json;base64,${Buffer.from(JSON.stringify(meta)).toString("base64")}`;
    const creator = signers[m.creatorIdx];
    await (await models.connect(creator).mintModel(uri, m.category, "v1.0.0", m.royaltyBps)).wait();
    await (
      await market.connect(creator).listModel(id, {
        personal: USD(m.prices.personal),
        commercial: USD(m.prices.commercial),
        enterprise: USD(m.prices.enterprise),
        perCall: USD(m.prices.perCall),
        listed: true,
      })
    ).wait();
    if (m.partnerIdx) await (await market.connect(creator).setRevenueSplit(id, signers[m.partnerIdx].address, m.partnerBps)).wait();
  }

  for (const b of buyers) {
    await (await token.mint(b.address, USD(100_000))).wait();
    await (await token.connect(b).approve(await market.getAddress(), ethers.MaxUint256)).wait();
  }

  console.log("Replaying 6 months of activity…");
  const rand = prng(1337);
  const now = Math.floor(Date.now() / 1000);
  const MONTHS = 6;
  const day = 24 * 3600;
  let batch = 0;

  for (let month = 0; month < MONTHS; month++) {
    const growth = 1 + month * 0.35; // usage trends upward like the design's revenue chart
    for (let step = 0; step < 6; step++) {
      const ts = now - (MONTHS - month) * 30 * day + step * 5 * day;
      if (ts <= (await time.latest())) continue;
      await time.setNextBlockTimestamp(ts);
      for (const b of buyers) {
        if (step === 0) await (await market.connect(b).depositCredits(USD(400 + Math.floor(rand() * 400)))).wait();
        const picks = MODELS.map((m, i) => ({ m, id: i + 1 })).filter(({ m }) => rand() < 0.2 + m.popularity / 20);
        for (const { m, id } of picks) {
          if (rand() < 0.12) {
            const tier = rand() < 0.7 ? 1 : 2;
            try { await (await market.connect(b).buyLicense(id, tier)).wait(); } catch { /* already licensed — fine */ }
          }
          const calls = Math.floor((80 + rand() * 900) * m.popularity * 0.35 * growth);
          if (calls > 0) {
            const id32 = ethers.keccak256(ethers.toUtf8Bytes(`seed-${batch++}`));
            try { await (await market.connect(gateway).recordUsage(id32, id, b.address, calls)).wait(); } catch { /* out of credits */ }
          }
        }
      }
    }
  }
  // two demo subscribers so the pricing page has live state
  for (const [i, b] of buyers.slice(0, 2).entries()) {
    await (await market.connect(b).subscribe(i === 0 ? 1 : 2, i === 0)).wait();
  }
  // leave the chain at "now" so timestamps in the UI look right
  const latest = await time.latest();
  if (now > latest) await time.setNextBlockTimestamp(now);
  await ethers.provider.send("evm_mine", []);
  console.log("Seed complete.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
