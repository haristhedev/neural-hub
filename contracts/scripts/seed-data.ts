/** Seed catalogue — mirrors the models shown in the NeuralHub design files. */
export type SeedModel = {
  creatorIdx: number; // hardhat signer index
  handle: string;
  name: string;
  category: number; // ModelNFT.Category
  categoryLabel: string;
  framework: string;
  params: string;
  description: string;
  tags: string[];
  rating: number;
  prices: { personal: number; commercial: number; enterprise: number; perCall: number }; // USD
  partnerIdx?: number;
  partnerBps?: number;
  royaltyBps: number;
  benchmarks: { dataset: string; score: string; latencyMs: number; fidelity: number }[];
  popularity: number; // relative usage weight for the seeded history
};

export const MODELS: SeedModel[] = [
  {
    creatorIdx: 2, handle: "SpectralAI", name: "Aura-Llama-70B-Decentral", category: 0, categoryLabel: "LLM",
    framework: "PyTorch", params: "70B", rating: 4.9, royaltyBps: 500, popularity: 10,
    description: "Instruction-tuned 70B language model served by decentralized nodes with verifiable execution traces.",
    tags: ["llm", "instruct", "zk-verified"],
    prices: { personal: 120, commercial: 480, enterprise: 2400, perCall: 0.004 },
    partnerIdx: 3, partnerBps: 3000,
    benchmarks: [
      { dataset: "MMLU-5shot", score: "81.4", latencyMs: 45, fidelity: 96.8 },
      { dataset: "HumanEval", score: "74.2", latencyMs: 52, fidelity: 94.1 },
    ],
  },
  {
    creatorIdx: 3, handle: "VinciLabs", name: "SynthDiffusion-v4-HighRes", category: 1, categoryLabel: "Image Gen",
    framework: "PyTorch", params: "3.5B", rating: 4.8, royaltyBps: 500, popularity: 7,
    description: "High-resolution latent diffusion model tuned for texture fidelity and consistent lighting.",
    tags: ["diffusion", "text-to-image"],
    prices: { personal: 80, commercial: 320, enterprise: 1600, perCall: 0.003 },
    benchmarks: [
      { dataset: "COCO-Val-2026", score: "FID 1.31", latencyMs: 210, fidelity: 97.9 },
      { dataset: "ImageNet-A-100K", score: "FID 1.47", latencyMs: 235, fidelity: 96.9 },
    ],
  },
  {
    creatorIdx: 4, handle: "KortexGroup", name: "DeepVoice-Wave-Custom", category: 2, categoryLabel: "Audio",
    framework: "TensorFlow", params: "1.2B", rating: 4.7, royaltyBps: 300, popularity: 4,
    description: "Custom voice synthesis with real-time streaming and speaker adaptation from 30 seconds of audio.",
    tags: ["tts", "voice", "streaming"],
    prices: { personal: 40, commercial: 150, enterprise: 750, perCall: 0.002 },
    benchmarks: [{ dataset: "LibriTTS", score: "MOS 4.52", latencyMs: 120, fidelity: 95.2 }],
  },
  {
    creatorIdx: 5, handle: "EulerMetrics", name: "PredictNet-Financial-v2", category: 4, categoryLabel: "Predictive",
    framework: "ONNX", params: "480M", rating: 4.9, royaltyBps: 500, popularity: 8,
    description: "Time-series forecasting network for volatility and order-flow prediction on tick data.",
    tags: ["forecasting", "finance", "time-series"],
    prices: { personal: 200, commercial: 820, enterprise: 4100, perCall: 0.005 },
    benchmarks: [{ dataset: "LOB-Bench-2026", score: "F1 0.84", latencyMs: 18, fidelity: 98.4 }],
  },
  {
    creatorIdx: 6, handle: "PangeaSys", name: "NeuraTranslator-Global-Pro", category: 5, categoryLabel: "NLP",
    framework: "PyTorch", params: "13B", rating: 4.6, royaltyBps: 500, popularity: 3,
    description: "Multilingual translation across 140 languages with domain adapters for legal and medical text.",
    tags: ["translation", "multilingual"],
    prices: { personal: 30, commercial: 100, enterprise: 500, perCall: 0.001 },
    benchmarks: [{ dataset: "FLORES-200", score: "chrF 62.1", latencyMs: 60, fidelity: 93.7 }],
  },
  {
    creatorIdx: 7, handle: "AegisSec", name: "CyberGuard-Anomalies-7B", category: 6, categoryLabel: "Security",
    framework: "PyTorch", params: "7B", rating: 4.8, royaltyBps: 500, popularity: 5,
    description: "Anomaly and intrusion detection model for network telemetry and smart-contract call graphs.",
    tags: ["security", "anomaly-detection"],
    prices: { personal: 140, commercial: 550, enterprise: 2750, perCall: 0.0045 },
    benchmarks: [{ dataset: "CIC-IDS-2026", score: "AUC 0.987", latencyMs: 33, fidelity: 98.1 }],
  },
  {
    creatorIdx: 3, handle: "VinciLabs", name: "VisionForge Pro", category: 1, categoryLabel: "Image Gen",
    framework: "PyTorch", params: "4.1B", rating: 4.8, royaltyBps: 500, popularity: 6,
    description: "State-of-the-art latent diffusion model fine-tuned for photorealistic assets, spatial precision and high-fidelity textures.",
    tags: ["diffusion", "photorealism", "text-to-image", "vinci-labs"],
    prices: { personal: 120, commercial: 480, enterprise: 2400, perCall: 0.003 },
    benchmarks: [
      { dataset: "COCO-Val-2026", score: "FID 1.24", latencyMs: 240, fidelity: 98.2 },
      { dataset: "ImageNet-A-100K", score: "FID 1.42", latencyMs: 260, fidelity: 97.4 },
    ],
  },
];

/** Deterministic PRNG so every local chain looks the same. */
export function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function modelMetadata(m: SeedModel, id: number) {
  const hue = (id * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},80%,55%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},80%,25%)"/></linearGradient></defs><rect width="400" height="400" fill="#0b0d16"/><circle cx="200" cy="200" r="150" fill="url(#g)" opacity=".85"/><text x="200" y="215" font-family="monospace" font-size="36" fill="#fff" text-anchor="middle">#${id}</text></svg>`;
  return {
    name: m.name,
    description: m.description,
    image: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    external_url: `/models/${id}`,
    attributes: [
      { trait_type: "Category", value: m.categoryLabel },
      { trait_type: "Framework", value: m.framework },
      { trait_type: "Parameters", value: m.params },
    ],
    neuralhub: {
      handle: m.handle,
      framework: m.framework,
      params: m.params,
      tags: m.tags,
      rating: m.rating,
      benchmarks: m.benchmarks,
      // In production this is a pinned CID; the demo uses a placeholder so the IPFS code path is exercised.
      weights: `ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/model-${id}.safetensors`,
    },
  };
}
