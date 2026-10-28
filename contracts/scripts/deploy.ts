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

  const live = !isLocal || process.env.LIVE_SEED === "1"; // LIVE_SEED=1 lets the live path be exercised on a local node
  const livePlan = live && process.env.SEED === "1" ? await planLiveSeed(deployer) : undefined; // fail before deploying if underfunded

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

  if (live) {
    if (livePlan) await seedLive({ deployer, token, models, market, gatewayAddress, plan: livePlan });
  } else {
    await seed({ signers, token, models, market, licenses });
  }

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


type Signer = Awaited<ReturnType<typeof ethers.getSigners>>[number];

/** Mints and lists every seed model; `signerFor` maps a seed creator/partner index to the account that acts as them. */
async function mintCatalogue({ models, market, signerFor }: { models: any; market: any; signerFor: (idx: number) => Signer | { address: string } }) {
  for (let i = 0; i < MODELS.length; i++) {
    const m = MODELS[i];
    const id = i + 1;
    const meta = modelMetadata(m, id);
    const uri = `data:application/json;base64,${Buffer.from(JSON.stringify(meta)).toString("base64")}`;
    const creator = signerFor(m.creatorIdx) as Signer;
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
    if (m.partnerIdx) await (await market.connect(creator).setRevenueSplit(id, signerFor(m.partnerIdx).address, m.partnerBps)).wait();
  }
}

/**
 * Seeding for a real network (no time travel, one funded deployer). Creators and buyers are wallets derived from the
 * deployer secret, funded with a little gas, so the marketplace has a catalogue plus real purchases and metered usage.
 * History starts "now" — a real chain can't be back-dated, so the dashboards fill up as people use the demo.
 */
type LivePlan = ReturnType<typeof planLiveSeed> extends Promise<infer T> ? T : never;

/** Works out the derived wallets and gas funding for the live seed, and fails fast if the deployer can't cover it. */
async function planLiveSeed(deployer: Signer) {
  const secret = process.env.DEPLOYER_KEY ?? "local-live-seed-test";
  const derive = (label: string) => new ethers.Wallet(ethers.keccak256(ethers.toUtf8Bytes(`neuralhub:${label}:${secret}`)), ethers.provider);
  const creatorIdxs = [...new Set(MODELS.map((m) => m.creatorIdx))];
  const creators = new Map(creatorIdxs.map((i) => [i, derive(`creator-${i}`)]));
  const buyers = Array.from({ length: 5 }, (_, i) => derive(`buyer-${i}`));
  const signerFor = (idx: number) => creators.get(idx) ?? derive(`partner-${idx}`);

  // size the gas funding from the network's current fee level (a flat amount breaks on pricier chains)
  const fee = await ethers.provider.getFeeData();
  const maxFee = fee.maxFeePerGas ?? fee.gasPrice ?? 1_000_000_000n;
  // each mintModel stores its metadata on-chain as a data: URI (~2-3M gas), so creators need a lot more than buyers
  const creatorGas = process.env.SEED_GAS_ETH ? ethers.parseEther(process.env.SEED_GAS_ETH) : maxFee * 8_000_000n;
  const buyerGas = process.env.SEED_GAS_ETH ? ethers.parseEther(process.env.SEED_GAS_ETH) : maxFee * 4_000_000n;
  const needed = creatorGas * BigInt(creators.size) + buyerGas * BigInt(buyers.length) + maxFee * 30_000_000n; // + contract deployment
  const have = await ethers.provider.getBalance(deployer.address);
  if (have < needed) {
    throw new Error(
      `Deployer ${deployer.address} has ${ethers.formatEther(have)} ETH but the live seed needs about ${ethers.formatEther(needed)} ETH ` +
        `at the current fee level (most is returned after seeding). Fund it, set SEED_GAS_ETH to lower the per-wallet amount, or deploy without SEED=1.`,
    );
  }
  return { creators, buyers, signerFor, creatorGas, buyerGas, maxFee };
}

async function seedLive({ deployer, token, models, market, gatewayAddress, plan }: { deployer: Signer; token: any; models: any; market: any; gatewayAddress: string; plan: LivePlan }) {
  const { creators, buyers, signerFor, creatorGas, buyerGas, maxFee } = plan;
  console.log(`Live seed: funding ${creators.size} creators (${ethers.formatEther(creatorGas)} ETH) and ${buyers.length} buyers (${ethers.formatEther(buyerGas)} ETH)…`);
  for (const w of creators.values()) await (await deployer.sendTransaction({ to: w.address, value: creatorGas })).wait();
  for (const w of buyers) await (await deployer.sendTransaction({ to: w.address, value: buyerGas })).wait();

  console.log("Seeding catalogue…");
  await mintCatalogue({ models, market, signerFor });

  // the deployer acts as the metering gateway for the seed; the real gateway key only needs GATEWAY_ROLE afterwards
  const role = await market.GATEWAY_ROLE();
  const deployerIsGateway = gatewayAddress.toLowerCase() === deployer.address.toLowerCase();
  if (!deployerIsGateway) await (await market.grantRole(role, deployer.address)).wait();

  console.log("Seeding purchases and metered usage…");
  const rand = prng(1337);
  let batch = 0;
  for (const b of buyers) {
    await (await token.mint(b.address, USD(5_000))).wait();
    await (await token.connect(b).approve(await market.getAddress(), ethers.MaxUint256)).wait();
    await (await market.connect(b).depositCredits(USD(150))).wait();
    const picks = MODELS.map((m, i) => ({ m, id: i + 1 })).filter(({ m }) => rand() < 0.25 + m.popularity / 25);
    for (const { m, id } of picks) {
      if (rand() < 0.35) {
        try { await (await market.connect(b).buyLicense(id, 1)).wait(); } catch { /* already licensed or out of funds — fine */ }
      }
      const calls = Math.max(1, Math.floor((40 + rand() * 300) * m.popularity * 0.3));
      const id32 = ethers.keccak256(ethers.toUtf8Bytes(`live-seed-${batch++}`));
      try { await (await market.connect(deployer).recordUsage(id32, id, b.address, calls)).wait(); } catch { /* out of credits */ }
    }
  }
  await (await market.connect(buyers[0]).subscribe(1, true)).wait();
  await (await market.connect(buyers[1]).subscribe(2, false)).wait();
  if (!deployerIsGateway) await (await market.revokeRole(role, deployer.address)).wait();

  // hand the unused gas money back to the deployer — testnet ETH is the scarce resource
  const latest = await ethers.provider.getFeeData();
  const sweepFee = (latest.maxFeePerGas ?? latest.gasPrice ?? maxFee) * 21_000n;
  for (const w of [...creators.values(), ...buyers]) {
    const bal = await ethers.provider.getBalance(w.address);
    if (bal > sweepFee * 2n) {
      try { await (await w.sendTransaction({ to: deployer.address, value: bal - sweepFee * 2n, gasLimit: 21_000n })).wait(); } catch { /* dust — leave it */ }
    }
  }
  console.log("Live seed complete.");
}

/** Mints the catalogue and replays ~6 months of purchases + metered API usage. */
async function seed({ signers, token, models, market }: Ctx) {
  const gateway = signers[1];
  const buyers = signers.slice(10, 16);
  console.log("Seeding catalogue…");
  await mintCatalogue({ models, market, signerFor: (i) => signers[i] });

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
